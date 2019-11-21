---
title: '[译]Spring WebFlux vs Spring MVC'
categories:
  - Spring
tags:
  - Spring
  - WebFlux
  - MVC
  - 原创
abbrlink: 31044
date: 2019-11-14 08:42:16
---

Spring MVC or WebFlux?

<!-- more -->

![](/images/spring-webflux-vs-spring-mvc/spring-mvc-and-webflux-venn.png)

* <font color=DeepPink>**如果你的Spring MVC应用运行良好，则不需要改变。**</font>Spring MVC更容易编写、理解、调试，可以选择更多的库，因为目前大多数库都是阻塞的。
<!-- * If you are already shopping for a non-blocking web stack, Spring WebFlux offers the same execution model benefits as others in this space and also provides a choice of servers (Netty, Tomcat, Jetty, Undertow, and Servlet 3.1+ containers), a choice of programming models (annotated controllers and functional web endpoints), and a choice of reactive libraries (Reactor, RxJava, or other). -->
* 如果你对轻量的web框架感兴趣，并希望使用Java 8 lambdas或者Kotlin，则可以选择Spring WebFlux。对于小型应用程序或微服务来说，这也是一个不错的选择，因为它们可以从更大的透明性（transparency）和控制中获益。
* 在微服务体系架构中，可以混合使用带有Spring MVC或Spring WebFlux控制器或Spring WebFlux 函数式的应用程序。在两个框架中都支持相同的基于注释的编程模型，这使得重用知识更容易，同时也为正确的工作选择了正确的工具。
*评估的一个简单方法是检查应用的依赖项。 <font color=DeepPink>**如果你要使用阻塞持久性APIs (JPA、JDBC)或网络APIs，那么Spring MVC至少是通用架构的最佳选择。**</font>在技术上，Reactor和RxJava都可以在单独的线程上执行阻塞调用，但这时就无法充分利用非阻塞网络栈。
* <font color=DeepPink>**如果你的Spring MVC应用程序需要远程调用别的服务，请尝试reactive WebClient。**</font>你可以直接从Spring MVC控制器方法返回反应类型（Reactor、RxJava或其他）。每次调用的延迟或调用之间的相互依赖性越大，好处就越显著。Spring MVC控制器也可以调用其他响应性组件。
* <font color=DeepPink>**如果你有一个大型团队，请记住向非阻塞、函数式和声明式编程转变的陡峭学习曲线。一种不需要完全切换的实用方法是使用响应式的WebClient。**</font>除此之外，从小处着手，衡量收益。我们认为，对于广泛的应用程序，这种转变是不必要的。如果你不确定要寻找什么好处，可以从学习非阻塞I/O的工作原理（例如，在单线程Node.js上的并发性）及其效果开始。

原文地址：
https://docs.spring.io/spring-framework/docs/current/spring-framework-reference/web-reactive.html