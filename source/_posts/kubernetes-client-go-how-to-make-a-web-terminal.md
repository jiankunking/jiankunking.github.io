---
title: 一个Kubernetes Web终端连接工具
abbrlink: 60972
date: 2020-09-12 15:09:06
categories:
  - Kubernetes
tags:
  - Kubernetes
  - client-go
  - exec
  - terminal
---

> 当应用部署到Kubernetes集群中之后，如何提供Web终端的功能，以便开发人员调试？

<!-- more -->


# 方案一

该功能的核心就是实现kubernetes executor接口

exec.go

```
package pod

import (
	"context"
	"errors"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

// 封装websocket连接
type WsConnection struct {
	wsSocket  *websocket.Conn // 底层websocket
	inChan    chan *WsMessage // 读取队列
	outChan   chan *WsMessage // 发送队列
	mutex     sync.Mutex      // 避免重复关闭管道
	isClosed  bool
	closeChan chan byte // 关闭通知
}

// web终端发来的包
type xtermMessage struct {
	MsgType string `json:"type"`  // 类型:resize客户端调整终端, input客户端输入
	Input   string `json:"input"` // msgtype=input情况下使用
	Rows    uint16 `json:"rows"`  // msgtype=resize情况下使用
	Cols    uint16 `json:"cols"`  // msgtype=resize情况下使用
}

// websocket消息
type WsMessage struct {
	MessageType int
	Data        []byte
}

// 关闭连接
func (wsConn *WsConnection) WsClose() {
	wsConn.wsSocket.Close()
	wsConn.mutex.Lock()
	defer wsConn.mutex.Unlock()
	if !wsConn.isClosed {
		wsConn.isClosed = true
		close(wsConn.closeChan)
	}
}

// ssh流式处理器
type streamHandler struct {
	wsConn      *WsConnection
	resizeEvent chan remotecommand.TerminalSize
}

// executor回调获取web是否resize
func (handler *streamHandler) Next() (size *remotecommand.TerminalSize) {
	ret := <-handler.resizeEvent
	size = &ret
	return
}

// 发送返回消息到协程
func (wsConn *WsConnection) WsWrite(messageType int, data []byte) (err error) {
	select {
	case wsConn.outChan <- &WsMessage{messageType, data}:
	case <-wsConn.closeChan:
		err = errors.New("WsWrite websocket closed")
		break
	}
	return
}

// 读取协程
func (wsConn *WsConnection) wsReadLoop() {
	for {
		// 读一条message
		// ReadMessage返回的messageType只可能是：TextMessage BinaryMessage
		msgType, data, err := wsConn.wsSocket.ReadMessage()
		if err != nil {
			log.Println(err)
			break
		}
		//log.Print(string(data))
		// 放入请求队列
		wsConn.inChan <- &WsMessage{
			msgType,
			data,
		}
	}
}

// 发送协程
func (wsConn *WsConnection) wsWriteLoop() {
	// 服务端返回给页面的数据
	for {
		select {
		// 取一个应答
		case msg := <-wsConn.outChan:
			//log.Print(string(msg.Data))
			// 写给web  websocket
			if err := wsConn.wsSocket.WriteMessage(msg.MessageType, msg.Data); err != nil {
				log.Println(err)
				break
			}
		case <-wsConn.closeChan:
			wsConn.WsClose()
			return
		}
	}
}

func (wsConn *WsConnection) onContextCancel(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			log.Println("web cancel context or time out..........")
			wsConn.WsClose()
			return
		}
	}
}

// 读取 页面消息到协程
func (wsConn *WsConnection) WsRead() (msg *WsMessage, err error) {
	select {
	case msg = <-wsConn.inChan:
		return
	case <-wsConn.closeChan:
		err = errors.New("WsRead websocket closed")
		break
	}
	return
}

// executor回调读取web端的输入
func (handler *streamHandler) Read(p []byte) (size int, err error) {
	// 读web发来的输入
	msg, err := handler.wsConn.WsRead()
	if err != nil {
		handler.wsConn.WsClose()
		return
	}

	xtermMsg := &xtermMessage{
		//MsgType: string(msg.MessageType),
		Input: string(msg.Data),
	}
	// 放到channel里，等remotecommand executor调用我们的Next取走
	handler.resizeEvent <- remotecommand.TerminalSize{Width: xtermMsg.Cols, Height: xtermMsg.Rows}
	size = len(xtermMsg.Input)
	copy(p, xtermMsg.Input)
	return

}

// executor回调向web端输出
func (handler *streamHandler) Write(p []byte) (size int, err error) {
	// 产生副本
	copyData := make([]byte, len(p))
	copy(copyData, p)
	size = len(p)
	err = handler.wsConn.WsWrite(websocket.TextMessage, copyData)
	return
}

func ContainerExec(ctx context.Context, r *http.Request, w http.ResponseWriter, cluster, namespace, podID, container string) error {

	// todo 获取k8s信息部分 需要替换成自己的
	ctxName := meta.GetContextName(cluster)
	kclient, err := k8s.GetClient(ctxName)
	if err != nil {
		log.Println(err)
		return err
	}
	cmds := []string{"sh", "-c", "test -f /bin/bash && bash || sh"}
	option := &corev1.PodExecOptions{
		Command:   cmds,
		Stdin:     true,
		Stdout:    true,
		Stderr:    true,
		TTY:       true,
		Container: container,
	}
	subCtx, cancel := context.WithTimeout(ctx, models.READ_LOG_TIMEOUT)
	defer cancel()
	req := kclient.CoreV1().RESTClient().
		Post().
		Resource("pods").
		Name(podID).
		Namespace(namespace).
		SubResource("exec").
		VersionedParams(option, scheme.ParameterCodec).Timeout(models.READ_LOG_TIMEOUT)
	wsSocket, err := upGrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return err
	}
	wsConn := &WsConnection{
		wsSocket:  wsSocket,
		inChan:    make(chan *WsMessage, 1000),
		outChan:   make(chan *WsMessage, 1000),
		closeChan: make(chan byte),
		isClosed:  false,
	}
	// 获取kube config配置
	config, err := k8s.GetClientConfig(ctxName)
	if err != nil {
		wsConn.WsClose()
		log.Println(err)
		return err
	}
	// 创建到容器的连接
	executor, err := remotecommand.NewSPDYExecutor(config, http.MethodPost, req.URL())
	if err != nil {
		wsConn.WsClose()
		log.Println(err)
		return err
	}
	// 页面读入输入 协程
	go wsConn.wsReadLoop()
	// 服务端返回数据 协程
	go wsConn.wsWriteLoop()

	// 监听前端请求
	go wsConn.onContextCancel(subCtx)

	// 配置与容器之间的数据流处理回调
	handler := &streamHandler{wsConn: wsConn, resizeEvent: make(chan remotecommand.TerminalSize)}
	if err = executor.Stream(remotecommand.StreamOptions{
		Stdin:             handler,
		Stdout:            handler,
		Stderr:            handler,
		TerminalSizeQueue: handler,
		Tty:               true,
	}); err != nil {
		log.Println("handler", err)
		return err
	}
	return err
}

```

参考资料：

https://github.com/jiankunking/k8-web-terminal

> 方案一存在内存泄漏问题，https://github.com/kubernetes/client-go/issues/884

# 方案二

exec.go

```
import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

// https://github.com/kubernetes/dashboard/blob/master/src/app/backend/handler/terminal.go

type PtyHandler interface {
	io.Reader
	io.Writer
	remotecommand.TerminalSizeQueue
}

const END_OF_TRANSMISSION = "\u0004"

// TerminalMessage is the messaging protocol between ShellController and TerminalSession.
//
// OP      DIRECTION  FIELD(S) USED  DESCRIPTION
// ---------------------------------------------------------------------
// bind    fe->be     SessionID      Id sent back from TerminalResponse
// stdin   fe->be     Data           Keystrokes/paste buffer
// resize  fe->be     Rows, Cols     New terminal size
// stdout  be->fe     Data           Output from the process
// toast   be->fe     Data           OOB message to be shown to the user
type TerminalMessage struct {
	Op, Data, SessionID string
	Rows, Cols          uint16
}

// TerminalSession
type TerminalSession struct {
	ID       string
	wsConn   *websocket.Conn
	sizeChan chan remotecommand.TerminalSize
	doneChan chan struct{}
}

// TerminalSize handles pty->process resize events
// Called in a loop from remotecommand as long as the process is running
func (t *TerminalSession) Next() *remotecommand.TerminalSize {
	select {
	case size := <-t.sizeChan:
		return &size
	case <-t.doneChan:
		return nil
	}
}

// Read handles pty->process messages (stdin, resize)
// Called in a loop from remotecommand as long as the process is running
func (t *TerminalSession) Read(p []byte) (int, error) {
	_, message, err := t.wsConn.ReadMessage()
	if err != nil {
		log.Printf("%s: read ws message failed: %v", t.ID, err)
		return copy(p, END_OF_TRANSMISSION), err
	}
	log.Printf("%s: read", t.ID)
	// TODO: msg type
	return copy(p, message), nil
	//var msg TerminalMessage
	//if err := json.Unmarshal(message, &msg); err != nil {
	//	log.Printf("json decoded failed: %v", err)
	//	return copy(p, END_OF_TRANSMISSION), err
	//}
	//switch msg.Op {
	//case "stdin":
	//	return copy(p, msg.Data), nil
	//case "resize":
	//	t.sizeChan <- remotecommand.TerminalSize{Width: msg.Cols, Height: msg.Rows}
	//	return 0, nil
	//default:
	//	log.Printf("unknown message type '%s'", msg.Op)
	//	return copy(p, END_OF_TRANSMISSION), fmt.Errorf("unknown message type '%s'", msg.Op)
	//}
}

// Write handles process->pty stdout
// Called from remotecommand whenever there is any output
func (t *TerminalSession) Write(p []byte) (int, error) {
	//msg, err := json.Marshal(TerminalMessage{
	//	Op:   "stdout",
	//	Data: string(p),
	//})
	//if err != nil {
	//	log.Printf("json encode failed: %v", err)
	//	return 0, err
	//}
	// TODO: msg type
	if err := t.wsConn.WriteMessage(websocket.TextMessage, p); err != nil {
		log.Printf("%s: write ws message failed: %v", t.ID, err)
		return 0, err
	}
	log.Printf("%s: write", t.ID)
	return len(p), nil
}

func (t *TerminalSession) Close() error {
	close(t.doneChan)
	return t.wsConn.Close()
}

func newTerminalSession(id string, r *http.Request, w http.ResponseWriter) (*TerminalSession, error) {
	conn, err := upGrader.Upgrade(w, r, nil)
	if err != nil {
		return nil, err
	}
	return &TerminalSession{
		ID:       id,
		wsConn:   conn,
		sizeChan: make(chan remotecommand.TerminalSize),
		doneChan: make(chan struct{}),
	}, nil
}

func ContainerExec(ctx context.Context, r *http.Request, w http.ResponseWriter, cluster, namespace, podName, container string) error {
	kclient, err := k8s.GetKubeClient(cluster)
	if err != nil {
		log.Println(err)
		return err
	}

	// 获取kube config配置
	config, err := k8s.GetClientConfig(cluster)
	if err != nil {
		log.Println(err)
		return err
	}

	cmd := []string{"sh", "-c", "test -f /bin/bash && bash || sh"}
	option := &corev1.PodExecOptions{
		Command:   cmd,
		Stdin:     true,
		Stdout:    true,
		Stderr:    true,
		TTY:       true,
		Container: container,
	}
	//ctx, cancel := context.WithTimeout(ctx, models.READ_LOG_TIMEOUT)
	//defer cancel()
	req := kclient.CoreV1().RESTClient().
		Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("exec").
		VersionedParams(option, scheme.ParameterCodec).
		Timeout(models.READ_LOG_TIMEOUT)

	executor, err := remotecommand.NewSPDYExecutor(config, http.MethodPost, req.URL())
	if err != nil {
		log.Println(err)
		return err
	}

	sessID := fmt.Sprintf("%s|%s|%s|%s|%v", cluster, namespace, podName, container, time.Now().Unix())
	t, err := newTerminalSession(sessID, r, w)
	if err != nil {
		log.Println(err)
		return err
	}
	defer t.Close()

	if err = executor.Stream(remotecommand.StreamOptions{
		Stdin:             t,
		Stdout:            t,
		Stderr:            t,
		TerminalSizeQueue: t,
		Tty:               true,
	}); err != nil {
		// http连接已经被hijacked，http.ResponseWriter不能再使用，所以不返回err
		log.Printf("exec stream failed: %v", err)
		return nil
	}

	return nil
}

```