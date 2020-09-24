---
title: Kubernetes中Java应用Heap Dump
categories:
  - Kubernetes
tags:
  - Kubernetes
  - Java
  - Heap
  - Dump
abbrlink: 27323
date: 2020-09-12 16:29:10
---

> Dump Java Heap to OSS

<!-- more -->

伴随着微服务及容器化的发展，越来越多的应用运行在kubernetes集群中，运维、调试的问题也随之而来。以Java为例，当线上环境出现内存问题，比如OOM，这时候需要Dump内存进行分析的时候，就会发现对于普通开发人员来说他们没有操作kubernetes集群机器的权限，从而导致，Dump出来的文件无法回传到开发手中进行MAT之类的分析。

本文的解决办法是这样的，当用户需要Dump某个应用实例的时候，只需要在实例终端界面点击一下按钮，后台会自动Dump Heap到OSS上，上传完成后，会将下载的信息展示在列表页，这时候开发人员就可以进行下载了。

具体的操作流程是这样的：
1、检测Pod中是否有JDK TOOLS
2、拷贝Dump工具到对应的Pod中
3、赋予Dump工具可执行权限
4、运行Dump工具

> Dump工具会识别Java进程，如果有多个Java进程会Dump进程号小的那一个。

核心代码主要是拷贝Dump工具到对应的Pod中

jmap.go

```
package dump

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

var jmapDumpTool = "jmap-dump-tool"

func init() {
	// jmap-dump-tool 文件名
	if os.Getenv("JMAP_DUMP_TOOL_NAME") != "" {
		jmapDumpTool = os.Getenv("JMAP_DUMP_TOOL_NAME")
	}
	log.Println("JMAP_DUMP_TOOL_NAME:" + jmapDumpTool)
}

func DumpJavaHeap(ctx context.Context, project, app, env, cluster, namespace, podID, container string) error {
   
	// todo 获取k8s信息部分 需要替换成自己的
	ctxName := meta.GetContextName(cluster)
	kclient, err := k8s.GetClient(ctxName)
	if err != nil {
		log.Println(err)
		return errors.New("获取kubernetes client失败！")
	}

	// 获取kube config配置
	config, err := k8s.GetClientConfig(ctxName)
	if err != nil {
		log.Println(err)
		return errors.New("获取kube config失败！")
	}

	pod := new(pod)
	pod.Namespace = namespace
	pod.Name = podID
	pod.ContainerName = container

	log.Println("开始检测目标容器中是否有JDK Tool")
	//检测是否 容器中是否有jps命令
	cmds := []string{"sh", "-c", "jps"}
	req := kclient.CoreV1().RESTClient().
		Post().
		Namespace(pod.Namespace).
		Resource("pods").
		Name(pod.Name).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: pod.ContainerName,
			Command:   cmds,
			Stdin:     true,
			Stdout:    true,
			Stderr:    true,
			TTY:       false,
		}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(config, "POST", req.URL())
	if err != nil {
		log.Println(err)
		return &customerr.JavaHeapDumpError{Msg: "检查对应容器中是否有JDK Tools时发生异常！"}
	}
	bufErr := new(bytes.Buffer)
	err = exec.Stream(remotecommand.StreamOptions{
		Stdin:  strings.NewReader(""),
		Stdout: os.Stdout,
		Stderr: bufErr,
		Tty:    false,
	})
	if bufErr.Len() > 0 {
		e := string(bufErr.Bytes())
		if e != "" {
			log.Println(e)
			return &customerr.JavaHeapDumpError{Msg: "请检查对应容器中是否有JDK Tools，" + e}
		}
	}

	log.Println("检测完成，目标容器中有JDK Tool")

	srcPath := "/" + jmapDumpTool
	log.Println("srcPath:" + srcPath)
	destPath := "/" + jmapDumpTool
	log.Println("destPath:" + destPath)

	err = pod.copyToPod(ctx, kclient, config, srcPath, destPath)
	if err != nil {
		log.Println(err)
		return &customerr.JavaHeapDumpError{Msg: "dump工具拷贝失败！"}
	}
	log.Println("jmap-dump-tool copy to pod end")
	// 赋予可执行权限
	cmds = []string{"sh", "-c", "chmod +x /" + jmapDumpTool}
	err = pod.Exec(ctx, kclient, config, cmds)
	if err != nil {
		log.Println(err)
		return &customerr.JavaHeapDumpError{Msg: "dump工具赋予可执行权限失败！"}
	}
	log.Println("jmap-dump-tool 已赋予可执行权限")
	go execDump(*pod, jmapDumpTool, project, app, env, kclient, config)
	return nil
}

func execDump(p pod, jmapDumpTool, project, app, env string, client *kubernetes.Clientset, config *rest.Config) {
	// 执行
	c := fmt.Sprintf("/%s %s %s %s", jmapDumpTool, project, app, env)
	cmds := []string{"sh", "-c", c}
	err := p.Exec(context.Background(), client, config, cmds)
	if err != nil {
		log.Println(err)
	}
}

```

cp.go（参考kubectl cp的实现）

```
package dump

import (
	"archive/tar"
	"context"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
	"path"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

type pod struct {
	Name          string
	Namespace     string
	ContainerName string
}

func (i *pod) copyToPod(ctx context.Context, client *kubernetes.Clientset, config *rest.Config, srcPath string, destPath string) error {
	reader, writer := io.Pipe()

	if destPath != "/" && strings.HasSuffix(string(destPath[len(destPath)-1]), "/") {
		destPath = destPath[:len(destPath)-1]
	}

	if err := checkDestinationIsDir(ctx, client, config, i, destPath); err == nil {
		destPath = destPath + "/" + path.Base(srcPath)
	}

	go func() {
		defer writer.Close()
		err := makeTar(srcPath, destPath, writer)
		if err != nil {
			fmt.Println(err)
		}
	}()

	var cmdArr []string

	cmdArr = []string{"tar", "-xf", "-"}
	destDir := path.Dir(destPath)
	if len(destDir) > 0 {
		cmdArr = append(cmdArr, "-C", destDir)
	}
	//remote shell.
	req := client.CoreV1().RESTClient().
		Post().
		Namespace(i.Namespace).
		Resource("pods").
		Name(i.Name).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: i.ContainerName,
			Command:   cmdArr,
			Stdin:     true,
			Stdout:    true,
			Stderr:    true,
			TTY:       false,
		}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(config, "POST", req.URL())
	if err != nil {
		return err
	}

	err = exec.Stream(remotecommand.StreamOptions{
		Stdin:  reader,
		Stdout: os.Stdout,
		Stderr: os.Stderr,
		Tty:    false,
	})
	if err != nil {
		return err
	}
	return nil
}

func checkDestinationIsDir(ctx context.Context, client *kubernetes.Clientset, config *rest.Config, i *pod, destPath string) error {
	return i.Exec(ctx, client, config, []string{"test", "-d", destPath})
}

func makeTar(srcPath, destPath string, writer io.Writer) error {
	// TODO: use compression here?
	tarWriter := tar.NewWriter(writer)
	defer tarWriter.Close()

	srcPath = path.Clean(srcPath)
	destPath = path.Clean(destPath)
	return recursiveTar(path.Dir(srcPath), path.Base(srcPath), path.Dir(destPath), path.Base(destPath), tarWriter)
}

func recursiveTar(srcBase, srcFile, destBase, destFile string, tarWriter *tar.Writer) error {

	filepath := path.Join(srcBase, srcFile)
	stat, err := os.Lstat(filepath)
	if err != nil {
		return err
	}
	if stat.IsDir() {
		files, err := ioutil.ReadDir(filepath)
		if err != nil {
			return err
		}
		if len(files) == 0 {
			//case empty directory
			hdr, _ := tar.FileInfoHeader(stat, filepath)
			hdr.Name = destFile
			if err := tarWriter.WriteHeader(hdr); err != nil {
				return err
			}
		}
		for _, f := range files {
			if err := recursiveTar(srcBase, path.Join(srcFile, f.Name()), destBase, path.Join(destFile, f.Name()), tarWriter); err != nil {
				return err
			}
		}
		return nil
	} else if stat.Mode()&os.ModeSymlink != 0 {
		//case soft link
		hdr, _ := tar.FileInfoHeader(stat, filepath)
		target, err := os.Readlink(filepath)
		if err != nil {
			return err
		}

		hdr.Linkname = target
		hdr.Name = destFile
		if err := tarWriter.WriteHeader(hdr); err != nil {
			return err
		}
	} else {
		//case regular file or other file type like pipe
		hdr, err := tar.FileInfoHeader(stat, filepath)
		if err != nil {
			return err
		}
		hdr.Name = destFile
		err = tarWriter.WriteHeader(hdr)
		if err != nil {
			log.Println(err)
			return err
		}

		f, err := os.Open(filepath)
		if err != nil {
			return err
		}
		defer f.Close()

		if _, err := io.Copy(tarWriter, f); err != nil {
			return err
		}
		return f.Close()
	}
	return nil
}

func (i *pod) Exec(ctx context.Context, client *kubernetes.Clientset, config *rest.Config, cmd []string) error {

	req := client.CoreV1().RESTClient().
		Post().
		Namespace(i.Namespace).
		Resource("pods").
		Name(i.Name).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: i.ContainerName,
			Command:   cmd,
			Stdin:     true,
			Stdout:    true,
			Stderr:    true,
			TTY:       false,
		}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(config, "POST", req.URL())
	if err != nil {
		return err
	}

	err = exec.Stream(remotecommand.StreamOptions{
		Stdin:  strings.NewReader(""),
		Stdout: os.Stdout,
		Stderr: os.Stderr,
		Tty:    false,
	})

	if err != nil {
		return err
	}
	return nil
}

```