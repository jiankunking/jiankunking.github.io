---
title: 关于Go net/http 超时完全指南
abbrlink: 848
date: 2020-05-23 14:32:23
categories:
  - Go
tags:
  - Go
  - net/http
  - Http
  - Timeout
  - 原创
  - 翻译
---

> 翻译自：The complete guide to Go net/http timeouts
> 地址：https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/

<!-- more -->

使用Go编写HTTP服务器或客户端时，超时是最容易出错的最容易发生的事情:一个错误可能在很长一段时间内没有任何影响，直到网络出现故障并挂起该进程为止。

HTTP是一个复杂的多阶段协议，因此没有一个适合所有超时的解决方案。考虑一下流端点、JSON API和[Comet](https://en.wikipedia.org/wiki/Comet_%28programming%29)端点。实际上，默认设置通常不是您想要的。

在本文中，我将介绍在服务器端和客户端都可能会导致应用超时的各个阶段，并探讨解决超时的不同方法。

# SetDeadline

首先，您需要了解Go用于实现超时的网络原语:Deadlines。

[net.Conn](https://golang.org/pkg/net/#Conn)使用Set[Read|Write]Deadline(time.Time)方法公开，Deadlines是绝对时间，一旦到时，所有I/O操作都会因超时错误而失败。

Deadlines不是超时。一旦设置，它们就会永久生效(直到下一次调用SetDeadline)，不管在此期间是否使用连接以及如何使用连接。因此，要使用SetDeadline建立超时，您必须在每次读/写操作之前调用它。

实际开发中，你并不需要直接调用SetDeadline，而是在标准库net/http中使用更高层次的超时设置。但是，请记住，所有超时都是根据Deadlines实现的，因此它们不会在每次发送或接收数据时重置。

# Server Timeouts

["So you want to expose Go on the Internet"](https://blog.cloudflare.com/exposing-go-on-the-internet/)一文提供了有关服务器超时的更多信息，尤其是有关HTTP/2和Go 1.7的信息。

![](/images/go-net-http-timeout-sequence-diagram/服务器超时.png)

对于暴露于Internet的HTTP服务器来说，设置客户端链接超时，是至关重要的。否则，非常缓慢或消失的客户端可能会泄漏文件描述符，最终导致以下情况:

```
http: Accept error: accept tcp [::]:80: accept4: too many open files; retrying in 5ms
```

http.Server有两个设置超时的方法:ReadTimeout和WriteTimeout。你可以显式地设置它们：
```
srv := &http.Server{
    ReadTimeout: 5 * time.Second,
    WriteTimeout: 10 * time.Second,
}
log.Println(srv.ListenAndServe())
```
ReadTimeout的时间计算是从连接被接受(accept)到request body完全被读取(if you do read the body, otherwise to the end of the headers)。net/http的内部实现是在[Accept之后立即调用SetReadDeadline](https://github.com/golang/go/blob/3ba31558d1bca8ae6d2f03209b4cae55381175b3/src/net/http/server.go#L750)。

WriteTimeout的时间计算正常是从request header的读取结束开始，到response write结束为止(也就是ServeHTTP的生命周期), 它是通过在[readRequest方法结束的时候调用SetWriteDeadline](https://github.com/golang/go/blob/3ba31558d1bca8ae6d2f03209b4cae55381175b3/src/net/http/server.go#L753-L755)实现的。

但是，当连接为HTTPS时，会在[Accept之后立即调用SetWriteDeadline](https://github.com/golang/go/blob/3ba31558d1bca8ae6d2f03209b4cae55381175b3/src/net/http/server.go#L1477-L1483)，所以它的时间计算也包括 TLS握手时的写的时间。令人讨厌的是，这意味着(仅在这种情况下)WriteTimeout最终将包括Header和读取body第一个字节这段时间。

当你处理不可信的客户端和网络的时候，你应该同时设置读写超时，这样客户端就不会因为读慢或者写慢长久的持有这个连接了。

最后,还有[http.TimeoutHandler](https://golang.org/pkg/net/http/#TimeoutHandler)。它不是一个Server参数，而是一个Handler包装函数，限制了ServeHTTP调用的最大持续时间。它缓存response, 如果deadline超过了则发送504 Gateway Timeout错误。 注意这个功能在1.6 中有问题，在1.6.2中改正了。

# http.ListenAndServe is doing it wrong

顺便说一句，这意味着绕过诸如http.ListenAndServe，http.ListenAndServeTLS和http.Serve之类的http.Server的程序包级便捷功能不适用于公共Internet服务器。

因为这些函数默认关闭了超时设置，也无法手动设置。使用这些函数，将很快泄露连接，然后耗尽文件描述符。对于这点，我至少犯了6次以上这样的错误。

对此，你应该使用http.server。在创建http.server实例的时候，调用相应的方法指定ReadTimeout（读取超时时间）和WriteTimeout（写超时时间），在以下会有一些案例。

# About streaming

非常烦人的是，无法从ServeHTTP访问底层net.Conn，因此打算流式传输响应的服务器被迫取消WriteTimeout的设置（这也可能是默认情况下它们为0的原因）。这是因为没有net.Conn访问，就无法在每次Write之前调用SetWriteDeadline来实现适当的空闲（不是绝对）超时。

同样，也没有办法取消一个被阻塞的ResponseWriter。由于无法确认ResponseWriter.Close支持并发写操作。因此，也没有办法使用计时器手动构建超时。

这意味着流媒体服务器面对一个低速客户端时，将无法有效保障自身的效率、稳定

我提交了[一个问题和一些建议](https://github.com/golang/go/issues/16100)，期待反馈。

> 译者注：: 原文作者此处的说法有问题，其实通过Hijack是可以获取到net.Conn的。

![](/images/go-net-http-timeout-sequence-diagram/Hijack获取conn.png)

# Client Timeouts

![](/images/go-net-http-timeout-sequence-diagram/客户端超时.png)

客户端超时，可以很简单，也可以很复杂，取决于你怎么用。但同样重要的是：要防止资源泄漏和阻塞。

最简单的使用超时的方式是[http.Client](https://golang.org/pkg/net/http/#Client)。它涵盖整个交互过程，从发起连接(如果未重用连接)到接收响应报文结束。

```
c := &http.Client{
    Timeout: 15 * time.Second,
}
resp, err := c.Get("https://jiankunking.com")
```

与服务端情况类似，程序包级别的功能（例如http.Get）可以使用[没有超时的客户端](https://golang.org/pkg/net/http/#DefaultClient)，因此在开放的Internet上使用非常危险。

还有其它一些方法，可以让你进行更精细的超时控制：
* net.Dialer.Timeout 限制创建一个TCP连接使用的时间（如果需要一个新的链接）
* http.Transport.TLSHandshakeTimeout 限制TLS握手使用的时间
* http.Transport.ResponseHeaderTimeout 限制读取响应报文头使用的时间
* http.Transport.ExpectContinueTimeout 限制客户端在发送一个包含：100-continue的http报文头后，等待收到一个go-ahead响应报文所用的时间。[在1.6中，此设置对HTTP/2无效](https://github.com/golang/go/issues/14391)。（[在1.6.2中提供了一个特定的封装DefaultTransport](https://github.com/golang/go/commit/406752b640fcc56a9287b8454564cffe2f0021c1#diff-6951e7593bfb1e773c9121df44df1c36R179)）

```
c := &http.Client{
    Transport: &http.Transport{
        Dial: (&net.Dialer{
                Timeout:   30 * time.Second,
                KeepAlive: 30 * time.Second,
        }).Dial,
        TLSHandshakeTimeout:   10 * time.Second,
        ResponseHeaderTimeout: 10 * time.Second,
        ExpectContinueTimeout: 1 * time.Second,
    }
}
```

据我了解，尚没有限制发送请求使用时间的机制。目前的解决方案是，在客户端方法返回后，通过time.Timer来个手工控制读取请求信息的时间（参见下面的“如何取消请求”）。

最后，在新的1.7版本中，提供了http.Transport.IdleConnTimeout。它用于控制一个闲置连接在连接池中的保留时间，而不考虑一个客户端请求被阻塞在哪个阶段。

请注意，客户端将使用默认的重定向机制。由于http.Transport是一个底层的系统机制，没有重定向概念，因此http.Client.Timeout涵盖了用于重定向花费的时间，而更精细的超时控，可以根据请求的不同，进行定制。

# Cancel and Context

net/http提供了两种方式取消一个client的请求: Request.Cancel以及Go 1.7新加的Context。

Request.Cancel是一个可选channel。在Request.Timeout被触发时，Request.Cancel将被设置并关闭，进而促使请求中断（基本上“撤销”都采用相同的机制，在写此文时，我发现一个1.7中的bug，所有的撤销操作，都会当作一个超时错误返回）。

我们可以使用Request.Cancel和time.Timer来构建一个细粒度的超时控制，以允许流传输，每次成功从Body读取一些数据时，都将截止日期推迟:
```
package main

import (
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"time"
)

func main() {
	c := make(chan struct{})
	timer := time.AfterFunc(5*time.Second, func() {
		close(c)
	})

        // Serve 256 bytes every second.
	req, err := http.NewRequest("GET", "http://httpbin.org/range/2048?duration=8&chunk_size=256", nil)
	if err != nil {
		log.Fatal(err)
	}
	req.Cancel = c

	log.Println("Sending request...")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()

	log.Println("Reading body...")
	for {
		timer.Reset(2 * time.Second)
                // Try instead: timer.Reset(50 * time.Millisecond)
		_, err = io.CopyN(ioutil.Discard, resp.Body, 256)
		if err == io.EOF {
			break
		} else if err != nil {
			log.Fatal(err)
		}
	}
}
```

在上面这个例子中，我们在请求阶段，设置了一个5秒钟的超时。但读取响应报文阶段，我们需要读8次，至少8秒钟的时间。每次读操作，设置2秒钟的超时。采用这样的机制，我们可以无限制的获取流媒体，而不用担心阻塞的风险。如果我们没有在2秒钟内读取到任何数据，io.CopyN将返回错误信息：net/http: request canceled.。

 context包升级了，进入到标准库中。[关于Contexts，我们有大量需要学习的东西](https://blog.golang.org/context)。基于本文的主旨，你首先应该知道的是：Contexts将替代Request.Cancel，不再建议(反对)使用Request.Cancel。

为了使用Contexts来撤销一个请求，我们需要创建一个新的Context以及它的基于context.WithCancel的cancel()函数，同时还有创建一个基于Request.WithContext的Request。当我们要撤销一个请求时，我们其实际是通过cancel()函数撤销相应的Context（取代原有的关闭Cancel channel的方式）：

```
ctx, cancel := context.WithCancel(context.TODO())
timer := time.AfterFunc(5*time.Second, func() {
	cancel()
})

req, err := http.NewRequest("GET", "http://httpbin.org/range/2048?duration=8&chunk_size=256", nil)
if err != nil {
	log.Fatal(err)
}
req = req.WithContext(ctx)
```

Context好处还在于如果parent context被取消的时候(在context.WithCancel调用的时候传递进来的)，子context也会取消， 消息会进行传递。