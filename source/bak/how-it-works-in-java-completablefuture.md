---
title: How it works in java CompletableFuture
abbrlink: 58335
date: 2020-08-15 16:27:38
categories:
  - JUC
tags:
  - JUC
  - JDK
  - Java
  - CompletableFuture
  - 原创
  - 翻译
---

> 翻译自：How it works in java CompletableFuture
> 地址：https://medium.com/@sergeykuptsov/how-it-works-in-java-completablefuture-3031dbbca66d

<!-- more -->

编程的有个原则就是不要重新发明轮子。 但是有时为了了解幕后情况以及如何正确使用，我们确实还是需要这样做。 今天我们重新造一下CompletableFuture。

CompletableFuture出现在java 8中，是受到谷歌ListenableFuture的启发。正如[javadoc](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/concurrent/CompletableFuture.html)所说，CompletableFuture是“A Future that may be explicitly completed”。但是大多数情况下，它是一些有用的方法，可以异步执行一些代码，并有可能以快速api风格组合异步阶段。

让我们从一个具有基础功能的WaitingFuture接口开始，有两种方法:

```
public interface WaitingFuture<V> {

    V get() throws ExecutionException;

    V get(long timeout, TimeUnit unit) throws TimeoutException, ExecutionException;
}
```

一个方法会一直阻塞直到执行完成，如果执行失败则会失败;另一个方法有时间限制，如果出现超时则会抛出TimeoutException。

现在，我们添加一个实用程序方法，该方法允许实际异步执行某些用户功能并获取其结果。 异步意味着我们可以在启动waitFuture之后继续执行流程，稍后再返回执行结果。 这意味着我们需要另一个线程来执行用户功能。 最好的模式是使用线程池来执行。 为简单起见，让我们为每个用户功能启动一个新线程。