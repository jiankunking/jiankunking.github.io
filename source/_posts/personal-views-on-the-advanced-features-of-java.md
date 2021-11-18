---
title: 对于Java系高级特性的个人看法
abbrlink: 50545
date: 2020-11-29 13:07:46
categories:
  - Java
tags:
  - Lambda
  - Java
  - CompletableFuture
  - 原创
---

> CompletableFuture、Lambda、Reactive，欢迎留言讨论。

<!-- more -->

说一下我个人的观点吧：

# Lambda

## 优点

* 代码简洁

## 缺点

* 不方便调试.
* 会拉升代码维护的成本。对于写代码/维护代码的人，有一定的要求（需要学习语法糖）。
* 对于非 CPU密集型的程序，性能方面没有什么提升。

拓展：[Java Lambda表达式 实现原理分析](https://jiankunking.com/java-lambda.html)

# CompletableFuture

CompletableFuture这种回调底层还是Fork/Join框架，Fork/Join对于io这种操作还是会阻塞线程，而且CompletableFuture默认线程数是与CPU核数一样的。在现在容器化的场景下，CPU核数都不会很多（一般都是个位数），那么使用CompletableFuture是执行io操作是不是会更早的无响应？因为个位数的线程很快就都被阻塞了。

> 这里说一下我的理解：
>
> CompletableFuture还不能等完全同于ForkJoin。
> 可以简单的理解为
> CompletableFuture.then() 等于 Fork
> CompletableFuture.get() 等于 Join
>
> 但不是所有场景下，CompletableFuture都需要用get()结束的。也就是说，有时候是不需要调用阻塞的get()方法的。
>
> 另外，虽然CompletableFuture 默认使用 ForkJoinPool，但你完全可以给它提供一个自定义的执行器。
>
> -- <cite>李玥</cite>

# Spring Reactive

Spring Reactive基于Netty，用更少的线程可以满足更多的并发请求，可以减少微服务部署的实例，但对于使用者来说Reactor不是很友好，而且排查问题麻烦。

拓展：[Spring WebFlux vs Spring MVC](https://jiankunking.com/spring-webflux-vs-spring-mvc.html)


# 总结
目前来看CompletableFuture、Lambda、Reactive，对于目前Web开发而言可以说是意义不大，尤其是CompletableFuture、Spring Reactive，终将被[Loom项目](http://openjdk.java.net/projects/loom/)代替或者将基于[Loom](http://openjdk.java.net/projects/loom/)再次开发。

<code>Java目前的问题在于语言层面没有协程这种东西，所以io操作仍然会阻塞线程（除非基于Netty开发）。</code>

Java在云原生的路上，内存归还OS问题，已在G1、ZGC中解决了，剩下的就是协程跟[AOT](https://jiankunking.com/spring-boot-clound-native-by-graalvm.html)了。



<!-- 最早结识Lambda是在14、15年的时候，那时候主要是写C#,刚开始的感觉是惊艳，竟然可以把代码写的如此简洁。

后来写了一段时间发现有这么几个问题：

* 不方便调试
* 会拉升代码维护的成本。对于写代码/维护代码的人，有一定的要求（需要学习语法糖）。
* 对于非 CPU密集型的程序，性能方面没有什么提升。

后来，Java 8也引入了Lambda，之前还写了一篇文章分析：[Java Lambda表达式 实现原理分析](https://jiankunking.com/java-lambda.html) -->