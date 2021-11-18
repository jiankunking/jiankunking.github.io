---
title: '[译]Go 并发 : Context'
categories:
  - Go
tags:
  - Go
  - Concurrency
  - Context
  - 原创
  - 翻译
abbrlink: 61017
date: 2020-06-13 10:01:33
---

> 翻译自：Go Concurrency Patterns: Context
> 地址：https://blog.golang.org/context

<!-- more -->

# 简介

在Go server端，每个请求都是通过新起goroutine来处理。请求处理程序通常会启动其他goroutine来访问后端，例如数据库和RPC服务。处理该请求的goroutine集合通常需要访问特定于请求的值，例如最终用户的身份，授权令牌和请求的时限。当一个请求被取消或超时时，处理该请求的所有goroutine应该迅速退出，以便系统可以回收他们正在使用的资源。

在Google，我们开发了一个Context包，可以轻松地跨API边界将请求范围（request-scoped）的值，取消信号和截止日期（deadlines）传递给处理请求的所有goroutine。该软件包可作为Context公开使用。本文将介绍如何使用该package。

# Context

Context包的核心是Context类型:

```
// Context跨API边界携带期限(deadline)、取消信号和请求范围(request-scoped)的值。Context的方法是协程安全的。
type Context interface {
    // Done返回一个channel，该channel在Context被取消或超时时关闭。
    Done() <-chan struct{}

    // Err表示在Done channel关闭后取消此Context的原因。
    Err() error

    // Deadline返回Context将被取消的时间(如果有的话)。
    Deadline() (deadline time.Time, ok bool)

    // Value返回与key关联的值(如果没有，返回nil)。
    Value(key interface{}) interface{}
}
```

更详细的介绍，参见godoc：https://golang.org/pkg/context/

Done方法返回一个channel，作为代表Context运行的函数的取消信号:当channel关闭时，函数应该放弃它们的工作并返回。Err方法返回一个错误，指示Context被取消的原因。

因为Done channel只用于接收的原因，Context没有取消方法：接收取消信号的方法与发送信号方法往往不是同一个。特别是，当父操作（parent operation）为子操作（sub-operations）启动goroutines时，这些子操作应该不能取消父操作。相反，WithCancel函数（如下所述）提供了一种取消新的上下文值的方法。

Context是协程安全的。代码中可以将单个Context传递给任意数量的goroutine，并在取消该Context时可以将信号传递给所有的goroutine。

最后期限（Deadline）方法允许函数决定他们是否应该开始工作;如果剩下的时间太少，可能就不值得了。代码也可以使用期限（Deadline）来设置I/O操作的超时。

值（Value）允许Context携带请求范围(request-scoped)的数据。 该数据必须是协程安全的，以便多个goroutine可以同时使用。

# Derived contexts

<font color=DeepPink>**Context包提供了从现有Context值派生新Context值的函数。这些值形成一个树:当一个Context被取消时，从它派生的所有Context也被取消。**</font>

Background是所有Context树的根;它永远不会被取消:
```
// Background返回一个空Context。它永远不会被取消，没有截止日期，也没有值。
// 后台通常用于main、init和测试，并作为传入请求的顶级上下文。
func Background() Context
```

WithCancel和WithTimeout返回派生的Context值，该值可以比父Context早被取消。请求处理程序返回时，通常会取消与传入请求关联的Context。 使用多个副本时，WithCancel对于取消冗余请求也很有用。WithTimeout对于设置对后端服务器的请求的最后期限很有用：

```
// WithCancel返回parent的副本，该副本的parent channel在parent结束后立即关闭。done关闭或调用cancel。
func WithCancel(parent Context) (ctx Context, cancel CancelFunc)

// CancelFunc取消Context。
type CancelFunc func()

// WithTimeout返回父对象的副本，该父对象的Done channel会在父对象关闭后立即关闭。
// 调用cancel或超时,关闭Done。 
// 新的上下文截止日期是now + timeout和父级截止日期（如果有）中的较早者。 
// 如果计时器仍在运行，则取消功能将释放其资源。
func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc)
```

WithValue提供了一种将请求范围的值与Context关联的方法:

```
// WithValue returns a copy of parent whose Value method returns val for key.
func WithValue(parent Context, key interface{}, val interface{}) Context
```