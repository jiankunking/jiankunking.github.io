---
layout: w
title: 云原生时代的Spring Boot
date: 2020-06-20 12:55:26
categories:
  - Spring
tags:
  - Spring
  - Cloud
  - Native
  - 原创
---

云原生时代的Spring Boot/Java

<!-- more -->

Spring Boot毫无疑问是Java后端开发的第一大框架，基于Spring Boot有着一套完整的工具链，各种各样的starter。对于日常业务开发而言，可以说是轮子很全。

但随着云原生时代的到来，Spring Boot应用或者说是Java应用却暴露出了一些问题，其中比较突出的有：

* 启动慢
* 应用内存占用多
 
其中启动慢的主要原因：代码编译。

当然对于Spring Boot来说，Bean实例注入也会花费一定的时间，但花费时间相比编译会小的多。大家可以通过开启延迟初始化试试。

 ```
spring:
  main:
    lazy-initialization: true
 ```

> Spring Boot 2.2开始支持。

个人本地开启延迟初始化之后，启动能快了1~2秒，整个启动时间10秒左右。

> 测试机配置：i7-6500U 2.50@GHz 内存:16G

内存占用多主要是内存占用后不会归还操作系统，这个正在逐步改善：
* G1 JDK12及之后 已支持
* ZGC JDK13及之后 已支持

> 由于Java语言的特性及Spring Boot的一些实现方式，决定了即便是开启了G1/ZGC的未使用内存及时归还操作系统，Spring Boot的内存占用，仍然远大于Golang这种编译型语言。

2017年9月，Java 9发布，在Java 9中引入了[AOT（Ahead-of-Time Compilation）](https://openjdk.java.net/jeps/295)。

> AOT在内部使用是通过GraalVM来生成代码的。

但对于普通用户而言通过Java的AOT去编译Spring程序还是不可行的。

那么有没有一种比较优雅的解决方案呢？既能使用Spring Boot又能像Golang一样启动快、内存占用低？

有朋友可能想到了[Quarkus](https://quarkus.io/)、[Micronaut](https://quarkus.io/)，但这两个框架如果是从头开始开发，可以考虑一下，但还是要注意两点：
* 需要去学习使用
* 某些库有可能不支持

其实，Java想要解决云原生时代的问题，目前的方案基本都是基于GraalVM来的，不管是Quarkus还是Micronaut都是。

那么，Spring Boot有没有类似的方案呢？

答案是有的。

在[spring-projects-experimental](这个项目的状态是alpha) Organizations下有这么一个项目：[spring-graalvm-native](https://github.com/spring-projects-experimental/spring-graalvm-native)

目前已发布到0.7.0 release，不过从github的文档中可以看到这个项目的状态仍然是alpha，也就是说目前用到生产中还是为时过早。

![](/images/spring-graalvm-native/alpha.png)

希望能早日spring-graalvm-native能早日发布生产可用版本吧。

graalvm+AOT如此美好？

其实，GraalVM目前来看还是有一些局限的：

Not Supported 
* Dynamic Class Loading/Unloading
* Runtime Bytecode Generation *
* InvokeDynamic Bytecode and Method Handles 
* ......

Require Configuration
* Resource Access 
* Reflection
* Dynamic Proxy（JDK，not CGLIB）
* JNI (Java Native Interface)
* ......

更详细限制可以看：

[https://github.com/oracle/graal/blob/master/substratevm/LIMITATIONS.md](https://github.com/oracle/graal/blob/master/substratevm/LIMITATIONS.md)

同时，由于提前编译无法像JIT那样获取到运行时的信息，所以在做Profile-Guided Optimization，PGO时，会更麻烦。

具体做法：[https://www.graalvm.org/docs/release-notes/19_2/](https://www.graalvm.org/docs/release-notes/19_2/)

JIT会做的典型的PGO[<sup>1</sup>](#fnref:1)：

* type-feedback optimization：主要针对多态的面向对象程序来做优化。根据profile收集到的receiver type信息来把原本多态的虚方法调用点（virtual method call site）或属性访问点（property access site）根据类型来去虚化（devirtualize）。

* single-value profiling：这个相对少见一些。它的思路是有些参数、函数返回值可能在一次运行中只会遇到一个具体值。如果是这样的话可以把那个具体值给记录下来，然后在JIT编译时把它当作常量来做优化，于是常见的常量相关优化（常量折叠、条件常量传播等）就可以针对一个静态意义上本来不是常量的值来做了。branch-profile-based code scheduling：主要目的是把“热”的（频繁执行的）代码路径集中放在一起，而把“冷”的（不频繁执行的）代码路径放到别的地方。AOT编译的话常常会利用一些静态的启发条件来猜测哪些路径比较热，或者让用户指定哪些路径比较热（例如likely()/unlikely()宏），而JIT搭配PGO的话可以有比较准确的路径热度信息，对应可以做的优化也就更吻合实际执行情况，于是效果会更好。

* profile-guided inlining heuristics：根据profile信息得知函数调用点的热度，从而影响内联决策——对某个调用点，到底值不值得把目标函数内联进来。

* implicit exception：隐式异常，例如Java/C#的空指针异常检查，又例如Java/C#的除以零检查。这些异常如果在某块代码里从来没有发生过，就可以用更快的方式来实现，而不必生成显式检查代码。但如果在某块代码经常发生这种异常，则显式检查会更快。


附录：

<div id="fnref:1">1.</div> JIT会做的典型的PGO

https://www.zhihu.com/question/52572852↩︎

个人思考：

其实，通过openjdk jeps及spring boot的一些实验性的项目可以看出，Java正在实现一些新的特性：比如本文提到的AOT,[Loom](https://openjdk.java.net/projects/loom/)来解决Java的一些痛点。

但这些新的特性具体什么时候能用于生产还是一个未知数。

相对于Golang，在使用Java的过程中，我个人感觉有以下几个痛点：

* 没有协程，无法轻量的异步。
* 也正是没有协程，IO请求的阻塞，会导致线程上下文的切换，成本太高。
* 内存占用过高
* 没有Context，调用方请求取消，感知不到；调用别人的时候，也没有办法很好的传递调用状态及请求取消。

