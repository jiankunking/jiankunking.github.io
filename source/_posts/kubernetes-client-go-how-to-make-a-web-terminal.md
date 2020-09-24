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
	//subCtx, cancel := context.WithTimeout(ctx, models.READ_LOG_TIMEOUT)
	//defer cancel()
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