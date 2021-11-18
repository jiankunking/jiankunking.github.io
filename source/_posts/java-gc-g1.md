---
title: Java 垃圾回收算法之G1
author: jiankunking
categories:
  - GC
tags:
  - GC
  - G1
  - JVM
  - Java
  - 原创
abbrlink: 60535
date: 2019-01-02 18:09:50
---

> 有可能是全网最全的G1总结

<!-- more -->

G1(Garbage-First)回收器是在JDK1.7中正式使用的全新垃圾回收器，G1拥有独特的垃圾回收策略，从分代上看，G1依然属于分代垃圾回收器，它会区分年代和老年代，依然有eden和survivor区，但从堆的结构上看，它并不要求整个eden区、年清代或者老年代都连续。它使用了全新的分区算法。

其特点如下：
- 并行性：G1在回收期间，可以由多个GC线程同时工作，有效利用多核计算能力。

- 并发性：G1拥有与应用程序交替执行的能力，因此一般来说，不会在整个回收期间完全阻塞应用程序。

- 分代GC：与之前回收器不同，其他回收器，它们要么工作在年轻代要么工作在老年代。G1可以同时兼顾年轻代与老年代。

- 空间整理：G1在回收过程中，会进行适当的对象移动，不像CMS，只是简单的标记清除，在若干次GC后CMS必须进行一次碎片整理，G1在每次回收时都会有效的复制对象，减少空间碎片。

- 可预见性：由于分区的原因，G1可以只选取部分区域进行内存回收，这样缩小了回收范围，因此对于全局停顿也能得到更好的控制。

# 一、G1的内存划分和主要收集过程
G1收集回收器将堆进行分区，划分为一个个的区域，每次收集的时候，只收集其中几个区域，以此来控制垃圾回收产生一次停顿时间。

G1的收集过程可能有4个阶段：

- 新生代GC

- 并发标记周期

- 混合收集

- （如果需要）进行Full GC。

# 二、G1的新生代GC
新生代GC的主要工作是回收eden区和survivor区。

一旦eden区被占满，新生代GC就会启动。新生代GC收集前后的堆数据如下图所示，其中E表示eden区，S表示survivor区，O表示老年代。

![](/images/java-gc-g1/新生代.png)

可以看到，新生代GC只处理eden和survivor区，回收后，所有的eden区都应该被清空，而survivor区会被收集一部分数据，但是应该至少仍然存在一个survivor区，类比其他的新生代收集器，这一点似乎并没有太大变化。另一个重要的变化是老年代的区域增多，因为部分survivor区或者eden区的对象可能会晋升到老年代。

# 三、G1并发标记周期

G1的并发阶段和CMS有些类似，它们都是为了降低一次停顿时间，而将可以和应用程序并发执行的部分单独提取出来执行。

>并发标记周期针对老年代

并发标记周期可分为以下几步：

- 初始标记：标记从根节点直接可达的对象。这个阶段会伴随一次新生代GC，它是会产生<font color=DeepPink>**全局停顿**</font>的，应用程序在这个阶段必须停止执行。

- 根区域扫描：由于初始标记必然会伴随一次新生代GC，所以在初始化标记后，eden被清空，并且存活对象被移到survivor区。在这个阶段，将扫描由survivor区直接可达的老年代区域，并标记这些直接可达的对象。这个过程是可以和应用程序并发执行的。但是根区域扫描不能和新生代GC同时发生（因为根区域扫描依赖survivor区的对象，而新生代GC会修改这个区域），故如果恰巧此时需要新生代GC，GC就需要等待根区域扫描结束后才能进行，如果发生这种情况，这次新生代GC的时间就会延长。

- 并发标记：G1 GC 在整个堆中查找可访问的（存活的）对象。该阶段与应用程序同时运行，可以被 STW 年轻代垃圾回收中断。

- 重新标记：和CMS一样，重新标记也是会使<font color=DeepPink>**应用程序停顿**</font>，由于在并发标记过程中，应用程序依然运行，因此标记结果可能需要修正，所以在此阶段对上一次标记进行补充。在G1中，这个过程使用SATB（Snapshot-At-The-Begining）算法完成，即G1会在标记之初为存活对象创建一个快照，这个快照有助于加速重新标记的速度。

- 独占清理：顾名思义，这个阶段会引起<font color=DeepPink>**停顿**</font>。它将计算各个区域的存活对象和GC回收比例并进行排序，识别可供混合回收的区域。在这个阶段，还会更新记忆集。该阶段给出了需要被混合回收的区域并进行了标记，在混合回收阶段，需要这些信息。

- 并发清理阶段：识别并清理完全空闲的区域。它是并发的清理，不会引起停顿。

>SATB全称是Snapshot-At-The-Beginning，由字面理解，是GC开始时活着的对象的一个快照。它是通过Root Tracing得到的，作用是维持并发GC的正确性。那么它是怎么维持并发GC的正确性的呢？根据三色标记算法，我们知道对象存在三种状态：白：对象没有被标记到，标记阶段结束后，会被当做垃圾回收掉。灰：对象被标记了，但是它的field还没有被标记或标记完。黑：对象被标记了，且它的所有field也被标记完了。

>SATB 利用 write barrier 将所有即将被删除的引用关系的旧引用记录下来，最后以这些旧引用为根 Stop The World 地重新扫描一遍即可避免漏标问题。 因此G1 Remark阶段 Stop The World 与 CMS了的remark有一个本质上的区别，那就是这个暂停只需要扫描有 write barrier 所追中对象为根的对象， 而 CMS 的remark 需要重新扫描整个根集合，因而CMS remark有可能会非常慢。

# 四、混合回收

**在并发标记周期中，虽有部分对象被回收，但是回收的比例是非常低的。但是在并发标记周期后，G1已经明确知道哪些区域含有比较多的垃圾对象，在混合回收阶段，就可以专门针对这些区域进行回收。当然G1会优先回收垃圾比例较高的区域（回收这些区域的性价比高），这正是G1名字的由来（Garbage First Garbage Collector：译为垃圾优先的垃圾回收器），这里的垃圾优先（Garbage First）指的是回收时优先选取垃圾比例最高的区域。**

这个阶段叫做混合回收，是因为在这个阶段，即会执行正常的年轻代GC,又会选取一些被标记的老年代区域进行回收，同时处理了新生代和老年代。

<font color=DeepPink>**混合回收会被执行多次，直到回收了足够多的内存空间**</font>，然后，它会触发一次新生代GC。新生代GC后，又可能会发生一次并发标记周期的处理，最后又会引起混合回收，因此整个过程可能是如下图：

![](/images/java-gc-g1/回收循环.png)

# 五、必要时的Full GC

和CMS类似，并发收集让应用程序和GC线程交替工作，因此在特别繁忙的情况下无可避免的会发生回收过程中内存不足的情况，当遇到这种情况，G1会转入一个Full GC 进行回收。

以下4种情况会触发这类的Full GC：

## 1、并发模式失效

G1启动标记周期，但在Mix GC之前，老年代就被填满，这时候G1会放弃标记周期。这种情形下，需要增加堆大小，或者调整周期（例如增加线程数-XX:ConcGCThreads等）。

GC日志如下的示例：

![](/images/java-gc-g1/并发模式失效.png)

解决办法：发生这种失败意味着堆的大小应该增加了，或者G1收集器的后台处理应该更早开始，或者需要调整周期，让它运行得更快（如，增加后台处理的线程数）。

## 2、晋升失败

（to-space exhausted或者to-space overflow）

G1收集器完成了标记阶段，开始启动混合式垃圾回收，清理老年代的分区，不过，老年代空间在垃圾回收释放出足够内存之前就会被耗尽。（G1在进行GC的时候没有足够的内存供存活对象或晋升对象使用），由此触发了Full GC。

下面日志中（可以在日志中看到(to-space exhausted)或者（to-space overflow）），反应的现象是混合式GC之后紧接着一次Full GC。

![](/images/java-gc-g1/晋升失败.png)

这种失败通常意味着混合式收集需要更迅速的完成垃圾收集：每次新生代垃圾收集需要处理更多老年代的分区。

解决这种问题的方式是：

- 增加 -XX:G1ReservePercent选项的值（并相应增加总的堆大小），为“目标空间”增加预留内存量。

- 通过减少 -XX:InitiatingHeapOccupancyPercent 提前启动标记周期。

- 也可以通过增加 -XX:ConcGCThreads 选项的值来增加并行标记线程的数目。

## 3、疏散失败
（to-space exhausted或者to-space overflow）

进行新生代垃圾收集是，Survivor空间和老年代中没有足够的空间容纳所有的幸存对象。这种情形在GC日志中通常是：

![](/images/java-gc-g1/疏散失败.png)

这条日志表明堆已经几乎完全用尽或者碎片化了。G1收集器会尝试修复这一失败，但可以预期，结果会更加恶化：G1收集器会转而使用Full GC。

解决这种问题的方式是：

- 增加 -XX:G1ReservePercent选项的值（并相应增加总的堆大小），为“目标空间”增加预留内存量。

- 通过减少 -XX:InitiatingHeapOccupancyPercent 提前启动标记周期。

- 也可以通过增加 -XX:ConcGCThreads 选项的值来增加并行标记线程的数目。

## 4、Humongous Object 分配失败
当Humongous Object 找不到合适的空间进行分配时，就会启动Full GC，来释放空间。这种情况下，应该避免分配大量的巨型对象，增加内存或者增大-XX:G1HeapRegionSize，使巨型对象不再是巨型对象。

> 对于Humongous Object 的处理还有一种方式就是切换GC算法到ZGC，因为ZGC中对于Humongous Object 的回收不会特殊处理（比如不会延迟收集）。

# 六、巨型对象

Humongous Object：巨型对象
Humongous regions：巨型区域

对于G1而言，只要超过regin大小的一半，就被认为是巨型对象。巨型对象直接被分配到老年代中的“巨型区域”。这些巨型区域是一个连续的区域集。StartsHumongous 标记该连续集的开始，ContinuesHumongous 标记它的延续。

在分配巨型对象之前先检查是否超过 initiating heap occupancy percent和the marking threshold, 如果超过的话，就启动global concurrent marking，为的是提早回收，防止 evacuation failures 和 Full GC。

对于巨型对象，有以下几个点需要注意：

- 没有被引用的巨型对象会在标记清理阶段或者Full GC时被释放掉。

- 为了减少拷贝负载，只有在Full GC的时候，才会压缩大对象region。

- 每一个region中都只有一个巨型对象，该region剩余的部分得不到利用，会导致堆碎片化。

- 如果看到由于大对象分配导致频繁的并发回收，需要把大对象变为普通的对象，建议增大Region size。（或者切换到ZGC）

> 对于增大Region size有一个负面影响就是：减少了可用region的数量。因此，对于这种情况，你需要进行相应的测试，以查看是否实际提高了应用程序的吞吐量或延迟。

# 七、常见调优参数

## 1、-XX:MaxGCPauseMillis=N
默认200毫秒

前面介绍过使用GC的最基本的参数：

> -XX:+UseG1GC -Xmx32g -XX:MaxGCPauseMillis=200

前面2个参数都好理解，后面这个MaxGCPauseMillis参数该怎么配置呢？这个参数从字面的意思上看，就是允许的GC最大的暂停时间。G1尽量确保每次GC暂停的时间都在设置的MaxGCPauseMillis范围内。那G1是如何做到最大暂停时间的呢？这涉及到另一个概念，CSet(collection set)。它的意思是在一次垃圾收集器中被收集的区域集合。

- Young GC：选定所有新生代里的region。通过控制新生代的region个数来控制young GC的开销。

- Mixed GC：选定所有新生代里的region，外加根据global concurrent marking统计得出收集收益高的若干老年代region。在用户指定的开销目标范围内尽可能选择收益高的老年代region。

在理解了这些后，我们再设置最大暂停时间就有了方向。首先，我们能容忍的最大暂停时间是有一个限度的，我们需要在这个限度范围内设置。但是应该设置的值是多少呢？我们需要在吞吐量跟MaxGCPauseMillis之间做一个平衡。如果MaxGCPauseMillis设置的过小，那么GC就会频繁，吞吐量就会下降。如果MaxGCPauseMillis设置的过大，应用程序暂停时间就会变长。G1的默认暂停时间是200毫秒，我们可以从这里入手，调整合适的时间。

## 2、-XX:G1HeapRegionSize=n

设置的 G1 区域的大小。值是 2 的幂，范围是 1 MB 到 32 MB 之间。目标是根据最小的 Java 堆大小划分出约 2048 个区域。

- -XX:ParallelGCThreads=n（调整G1垃圾收集的后台线程数）
设置 STW 工作线程数的值。将 n 的值设置为逻辑处理器的数量。n 的值与逻辑处理器的数量相同，最多为 8。
如果逻辑处理器不止八个，则将 n 的值设置为逻辑处理器数的 5/8 左右。这适用于大多数情况，除非是较大的 SPARC 系统，其中 n 的值可以是逻辑处理器数的 5/16 左右。

- -XX:ConcGCThreads=n（调整G1垃圾收集的后台线程数）
设置并行标记的线程数。将 n 设置为并行垃圾回收线程数 (ParallelGCThreads) 的 1/4 左右。

## 3、 -XX:InitiatingHeapOccupancyPercent=45（调整G1垃圾收集运行频率）

设置触发标记周期的 Java 堆占用率阈值。默认占用率是整个 Java 堆的 45%。

该值设置太高：会陷入Full GC泥潭之中，因为并发阶段没有足够的时间在剩下的堆空间被填满之前完成垃圾收集。

如果该值设置太小：应用程序又会以超过实际需要的节奏进行大量的后台处理。

避免使用以下参数：避免使用 -Xmn 选项或 -XX:NewRatio 等其他相关选项显式设置年轻代大小。固定年轻代的大小会覆盖暂停时间目标。

# 八、细节
## 1、G1 mixed GC时机？

mixed gc中也有一个阈值参数 -XX:InitiatingHeapOccupancyPercent，当老年代大小占整个堆大小百分比达到该阈值时，会触发一次mixed gc.

在分配humongous object之前先检查是否超过 initiating heap occupancy percent, 如果超过的话，就启动global concurrent marking，为的是提早回收，防止 evacuation failures 和 Full GC。

为了减少连续H-objs分配对GC的影响，需要把大对象变为普通的对象，建议增大Region size。

一个Region的大小可以通过参数-XX:G1HeapRegionSize设定，取值范围从1M到32M，且是2的指数。

## 2、XX：G1 HeapRegionSize 默认值？

默认把堆内存按照2048份均分，最后得到一个合理的大小。

## 3、直接内存配置

Q: 什么时候用直接内存？

A: 读写频繁的场合，出于性能考虑，可以考虑使用直接内存。

直接内存也是 Java 程序中非常重要的组成部分，特别是 NIO 被广泛使用之后，直接内存可以跳过 Java 堆，使 Java 程序可以直接访问原生堆空间。因此可以在一定程度上加快内存的访问速度。直接内存可以用 -XX:MaxDirectMemorySize 设置，默认值为最大堆空间，也就是 -Xmx。当直接内存达到最大值的时候，也会触发垃圾回收，如果垃圾回收不能有效释放空间，直接内存溢出依然会引起系统的 OOM。

一般而言直接内存在访问读写上直接内存有较大优势（速度较快），但是在内存空间申请的时候，直接内存毫无优势而言。

## 4、RSet

全称是Remembered Set，是辅助GC过程的一种结构，典型的空间换时间工具，和Card Table有些类似。G1的RSet是在Card Table的基础上实现的：每个Region会记录下别的Region有指向自己的指针，并标记这些指针分别在哪些Card的范围内。这个RSet其实是一个Hash Table，Key是别的Region的起始地址，Value是一个集合，里面的元素是Card Table的Index。

RSet究竟是怎么辅助GC的呢？

在做YGC的时候，只需要选定young generation region的RSet作为根集，这些RSet记录了old->young的跨代引用，避免了扫描整个old generation。而mixed gc的时候，old generation中记录了old->old的RSet，young->old的引用由扫描全部young generation region得到，这样也不用扫描全部old generation region。所以RSet的引入大大减少了GC的工作量。

# 九、JDK 12中G1的新特性

## 1、可中断 mixed GC

如果 Mixed GC 的 G1 存在超出暂停目标的可能性，则使其可被中止。

## 2、G1未使用分配内存即时返回

增强 G1垃圾收集器，以便在空闲时自动将 Java 堆内存返回给操作系统。

# 十、GC 发展趋势
其实可以看到Java 垃圾回收器的趋势，就是在大内存堆的前提下尽 GC 可能的降低对应用程序的影响；从 CMS 的分阶段增量标记，到 G1 通过 SATB 算法改正 remark 阶段的 Stop The World 的影响，再到 ZGC/C4甚至在标记阶段无需 Stop The World，莫不如此。

# 十一、结尾

推荐几种学习这种GC的方式：

- 看JEP（JDK Enhancement Proposal）知道它的来龙去脉。

- 看相应算法的paper（之前看Shenandoah GC Paper的时候，就有一种收获很大的感觉，因为Shenandoah GC的处理方式，介于G1跟ZGC之间，所以看了Shenandoah GC Paper感觉对于G1、ZGC的理解也更加深入了）。

会在文章结束，补充上JEP官网地址跟我收集的一些GC资料（包含部分paper）github地址。

补一个我自己归纳的GC图：

![](/images/java-gc-g1/GC脉络.png)

各种GC算法都是围绕着，图中内容展开的，只是各自的处理方式不同而已。

资料推荐：

1、GC算法及paper

https://github.com/jiankunking/books-recommendation/tree/master/GC

2、Java相关书籍推荐

https://github.com/jiankunking/books-recommendation/tree/master/Java

参考文献

1、实战JAVA虚拟机 JVM故障诊断与性能优化

2、jeps

3、其它

https://www.oracle.com/technetwork/articles/java/g1gc-1984535.html

https://plumbr.io/handbook/gc-tuning-in-practice/other-examples/humongous-allocations

