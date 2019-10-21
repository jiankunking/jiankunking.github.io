---
title: '[译]ZGC: 未使用堆内存归还操作系统'
categories:
  - GC
tags:
  - GC
  - ZGC
  - JVM
  - Java
  - 原创
abbrlink: 33451
date: 2019-09-18 17:07:17
---

> 翻译自：JEP 351
> 地址：https://openjdk.java.net/jeps/351

<!-- more -->

# 一、摘要
增强ZGC，将未使用的堆内存返回给操作系统。

# 二、动机
目前ZGC不会将未使用的内存归还给操作系统，即使该内存已经很长时间没有使用了。这种行为并不适合所有类型的应用程序和环境，特别是那些需要考虑内存占用的应用程序和环境。例如：
* 按资源使用付费的容器环境。
* 应用程序可能长时间处于空闲状态并与许多其他应用程序共享或竞争资源的环境。
* 应用程序在执行期间可能有非常不同的堆空间需求。例如，启动期间所需的堆可能大于稍后在稳定状态执行期间所需的堆。

HotSpot中的其他垃圾收集器(如G1和Shenandoah)已经提供了这种功能，该功能对于一些用户非常有用。将此功能添加到ZGC将受到这些用户的欢迎。

# 三、描述
ZGC堆由一组称为ZPages的堆区域组成。每个Zpage与数量可变的已提交内存相关联。当ZGC压缩堆时，ZPages被释放并插入到页面缓存ZPageCache中。页面缓存中的ZPages可以重用，以满足新的堆分配，在这种情况下，它们将从缓存中删除。页面缓存对性能至关重要，因为提交和不提交内存都是昂贵的操作。

页面缓存中的ZPages集合表示堆中未使用的部分，这些部分可以归还给操作系统。因此，取消提交内存可以通过简单地从页面缓存中删除一组精心选择的ZPages，并取消与这些页面关联的内存的提交来完成。页面缓存已经将ZPages保持在最近最少使用(LRU)的顺序，并按大小(小、中、大)进行分隔，因此清除ZPages和取消提交内存的机制相对简单。挑战在于设计策略来决定何时从缓存中驱逐ZPage。

<font color=DeepPink>**一个简单的策略是设置一个timeout或delay值，该值指定ZPage在被清除之前可以在页面缓存中驻留多长时间。这个超时将有一些合理的默认值，可以使用命令行选项覆盖它。Shenandoah GC使用这样的策略，默认值为5分钟，命令行选项-XX:ShenandoahUncommitDelay=\<milliseconds\>来覆盖默认值。**</font>

<font color=DeepPink>**类似上述策略的效果可能相当不错。然而，人们也可以设想更复杂的策略，不涉及添加新的命令行选项。例如，根据GC频率或其他数据找到合适超时值的启发式方法。我们将首先提供一个简单的超时策略，使用-XX:ZUncommitDelay=\<seconds\>选项，稍后再提供一个更复杂的策略(如果找到了)。**</font>

<font color=DeepPink>**默认情况下将启用uncommit功能。但是无论策略如何决定，ZGC都不能把堆内存降到低于Xms。这就意味着，如果Xmx和Xms相等的话，这个能力就失效了，-XX:-ZUncommit这个参数也能让这个内存管理能力失效。**</font>

最后，Linux/x64上的ZGC使用tmpfs或hugetlbfs文件来支持堆。这些文件使用的未提交内存需要fallocate(2)和FALLOC_FL_PUNCH_HOLE支持，FALLOC_FL_PUNCH_HOLE支持最早出现在Linux 3.5 (tmpfs)和4.3(hugetlbfs)中。在旧的Linux内核上运行时，ZGC应该像以前一样继续工作，但是禁用了uncommit功能。

> Java 越来越云原生了，下一个期盼就是fiber了。
