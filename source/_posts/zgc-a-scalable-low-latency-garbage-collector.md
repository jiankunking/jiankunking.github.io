---
title: '[译]ZGC: 一个可伸缩的低延迟垃圾收集器'
categories:
  - GC
tags:
  - GC
  - ZGC
  - JVM
  - Java
  - 原创
  - 翻译
abbrlink: 36241
date: 2019-07-31 20:49:32
---

> 翻译自：JEP 333
> 地址：https://openjdk.java.net/jeps/333

<!-- more -->

# 一、摘要
Z垃圾收集器，也称为ZGC，是一个可伸缩的低延迟垃圾收集器。

# 二、目标

* GC暂停时间不超过10ms
* 能处理大小从相对较小(几百MB)到非常大(TB级)的堆
* 与使用G1相比，应用程序吞吐量减少不超过15%
* 方便日后在此基础上利用彩色指针和内存屏障进一步优化收集器及实现新特性。【原文：Lay a foundation for future GC features and optimizations leveraging colored pointers and load barriers】
* 支持平台:Linux/x64

> 注：此处及下文中的内存屏障即load barrier，在ZGC中用的是读屏障。


# 三、动机

垃圾收集是Java的主要优势之一。但是，当垃圾收集暂停太长时，就会对应用程序的响应时间产生负面影响。通过大幅度缩短停顿时间，我们可以让Java适用于更多类型的应用程序。

此外，现代系统中可用的内存数量还在继续增长。**用户和应用程序开发人员希望JVM能够以一种有效的方式充分利用这种内存，并且不会出现很长的GC暂停时间。**

# 四、 描述

ZGC是一个并发的、单代（不再区分新生代和老年代）的、基于region的、支持numa的压缩收集器。Stop-the-world阶段仅限于根扫描，所以GC暂停时间不会随着堆或存活对象的多少而增加。

<font color=DeepPink>**ZGC的一个核心设计原则是结合使用内存屏障和彩色对象指针。这使得ZGC能够在运行Java应用程序线程时执行并发操作，比如对象重定位。从Java线程的角度来看，在Java对象中加载引用字段的行为受到内存屏障的限制。除了对象地址之外，有色对象指针还包含内存屏障需要的信息，用于确定在允许Java线程使用该指针之前是否需要采取某些操作。**</font>例如，对象可能已经被重新定位，在这种情况下，内存屏障将检测情况并采取适当的操作。

与其他技术相比，我们认为颜色指针方案提供了一些非常吸引人的特性。特别是:
* 这允许我们在移动对象/整理内存阶段，在指向可回收/重用区域的指针确定之前回收/重用这部分内存【原文：It allows us to reclaim and reuse memory during the relocation/compaction phase, before pointers pointing into the reclaimed/reused regions have been fixed. 】。这有助于降低堆开销。这还意味着不需要实现单独的标记压缩算法来处理完整的GC。

* 这允许我们使用相对较少且简单的GC屏障。这有助于降低运行时开销。这还意味着在解释器和JIT编译器中更容易实现、优化和维护GC barrier代码。

* 我们目前将标记和重新定位相关信息存储在彩色指针中。然而，此方案的通用性允许我们存储任何类型的信息(只要我们能将其放入指针中)，并允许内存屏障根据该信息采取它想要采取的任何操作。我们相信这将为将来的许多特性打下基础。举一个例子，在异构内存环境中，这可以用来跟踪堆访问模式，以指导GC重新定位决策，将很少使用的对象移动到冷存储(不常访问的内存区域)中【原文：To pick one example, in a heterogeneous memory environment, this could be used to track heap access patterns to guide GC relocation decisions to move rarely used objects to cold storage.】。

# 五、性能

我们已经使用SPECjbb 2015[1]做了常规性能测试。从吞吐量和延迟角度来看，性能都很好。下面是使用128G堆在复合模式下比较ZGC和G1的典型基准分数(以百分比为单位，根据ZGC的max-jOPS进行标准化)【原文：Below are typical benchmark scores (in percent, normalized against ZGC’s max-jOPS), comparing ZGC and G1, in composite mode using a 128G heap.】：
>越高越好
```
ZGC
       max-jOPS: 100%
  critical-jOPS: 76.1%

G1
       max-jOPS: 91.2%
  critical-jOPS: 54.7%
```
下面是来自相同基准测试的GC暂停时间。ZGC设法保持远低于10ms的目标。注意，确切的数字可能会根据使用的机器和设置而变化(上下都有，但不是很明显)。
> 越低越好
```
ZGC
                avg: 1.091ms (+/-0.215ms)
    95th percentile: 1.380ms
    99th percentile: 1.512ms
  99.9th percentile: 1.663ms
 99.99th percentile: 1.681ms
                max: 1.681ms

G1
                avg: 156.806ms (+/-71.126ms)
    95th percentile: 316.672ms
    99th percentile: 428.095ms
  99.9th percentile: 543.846ms
 99.99th percentile: 543.846ms
                max: 543.846ms
```
我们还对其他各种SPEC®基准测试和内部工作负载进行了特别的性能测量。一般情况下，ZGC能够维护个位数的毫秒暂停时间。

# 六、 局限性

ZGC的初始实验版本将不支持类卸载。默认情况下，classunload和ClassUnloadingWithConcurrentMark选项将被禁用。即便你启用也是不生效的。

此外，ZGC最初不支持JVMCI(即Graal)。如果启用EnableJVMCI选项，将打印一条错误消息。

这些限制将在本项目的后期解决。

# 七、 构建和使用

按照惯例，构建系统默认禁用JVM中的实验性特性。ZGC是一个实验性特性，因此不会出现在JDK构建中，除非在编译时使用configure选项:
```
--with-jvm-features=zgc
```
显式地启用它。

(ZGC将出现在Oracle发布的所有Linux/x64 JDK版本中)

JVM中的实验特性还需要在运行时显式地解锁。因此，要启用/使用ZGC，需要以下JVM选项:
```
-XX:+ unlockexperimental alvmoptions -XX:+UseZGC
```
有关如何设置和调优ZGC的更多信息，请参阅ZGC项目Wiki（wiki地址：https://wiki.openjdk.java.net/display/zgc/Main）。

ZGC paper可以参考Azul Pauseless GC Algorithm：

https://github.com/jiankunking/books-recommendation/blob/master/GC/ZGC/Azul_Pauseless_GC_Algorithm.pdf

ZGC 简介PPT:

https://github.com/jiankunking/books-recommendation/blob/master/GC/ZGC/ZGC-FOSDEM-2018.pdf