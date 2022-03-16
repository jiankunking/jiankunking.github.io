---
title: Kubernetes集群中Pod间文件拷贝
categories:
  - Kubernetes
tags:
  - Kubernetes
  - client-go
  - Copy
  - File
  - Pod
abbrlink: 344
date: 2022-03-16 16:33:51
---

如何在Pod间拷贝文件？

<!-- more -->

具体代码如下：

```
/*
 copy file to pod
*/
package cp

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

type Pod struct {
	Name          string
	Namespace     string
	ContainerName string
}

func (i *Pod) CopyToPod(ctx context.Context, client *kubernetes.Clientset, config *rest.Config, srcPath string, destPath string) error {
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

func checkDestinationIsDir(ctx context.Context, client *kubernetes.Clientset, config *rest.Config, i *Pod, destPath string) error {
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

	// defer func() {
	// 	fmt.Println("d")
	// 	if err := recover(); err != nil {
	// 		fmt.Println(err) // 这里的err其实就是panic传入的内容
	// 	}
	// 	fmt.Println("e")
	// }()

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

func (i *Pod) Exec(ctx context.Context, client *kubernetes.Clientset, config *rest.Config, cmd []string) error {

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