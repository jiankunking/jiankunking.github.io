---
title: Java性能优化权威指南 笔记
categories:
  - Java
tags:
  - Java
  - JVM
  - GC
  - Performance
  - 读书笔记
abbrlink: 32100
date: 2019-08-03 09:37:35
---

本文整理自：《Java性能优化权威指南》 

作者：Charlie Hunt / Binu John 

出版时间：2014-03

<!-- more -->

# 操作系统性能监控

## CPU使用率

大多数的操作系统的CPU使用率分为用户态CPU使用率和系统态CPU使用率。

用户态CPU使用率是指执行应用程序代码的时间占总CPU时间的百分比。

系统态CPU使用率是指应用执行操作系统调用的时间占总CPU时间的百分比。<font color=DeepPink>**系统态CPU使用率高意味着共享资源有竞争或者I/O设备之间有大量的交互。**</font>

既然原本用于执行操作系统内核调用的CPU周期也可以用来执行应用代码，所以理想情况下，应用达到最高性能和扩展性时，它的系统态CPU使用率为0%，所以提高应用性能和扩展性的一个目标是尽可能降低系统态CPU使用率。

对于计算密集型应用来说，不仅要监控用户态和系统态CPU使用率，还要进一步监控每时钟指令数（Instructions Per Clock，IPC）或每指令时钟周期（Cycles Per Instruction，CPI）等指标。这两个指标对于计算密集型应用来说很重要，因为<font color=DeepPink>**现代操作系统自带的CPU使用率监控工具只能报告CPU使用率，而没有CPU执行指令占用CPU时钟周期的百分比，这意味着，即便CPU在等待着内存中的数据，操作系统工具仍然会报告CPU繁忙。这种情况通常被称为停滞。当CPU执行指令所用的操作数据不在寄存器或者缓存中时，就会发生停滞，由于指令执行前必须等待数据从内存中装入CPU寄存器，所以一旦发生停滞，就会浪费时钟周期。**</font>CPU停滞通常会等待好几百个时钟周期，因此提高计算密集型应用性能的策略就是减少停滞或者改善CPU高速缓存使用率，从而减少CPU在等待内存数据时浪费的时钟周期。

## CPU调度程序运行队列
监控CPU调度程序运行队列对于分辨系统是否满负荷也有重要意义。<font color=DeepPink>**运行队列中就是那些已准备好运行、正等待可用CPU的轻量级进程。如果准备运行的轻量级进程数超过系统所能处理的上限，运行队列就会很长。**</font>运行队列长表明系统负载可能饱和。系统运行队列长度等于虚拟机处理器的个数时，用户不会明显感觉到性能下降。此处虚拟处理器的个数就是系统硬件线程的个数，也是Java API Runtime.availableProcessors()的返回值。当运行队列长度达到虚拟处理的4倍或者更多时，系统的响应就非常迟缓了。

一般性的指导原则是：如果在很长一段时间里，运行队列的长度一直都超过虚拟处理器个数的1倍，就需要关注了，只是暂时还不需要立刻采取行动。<font color=DeepPink>**如果在很长一段时间里，运行队列长度达到虚拟处理器个数的3~4倍或更高，则需要立刻引起注意和采取行动。**</font>

## 内存使用率

系统在进行页面交换或者使用虚拟内存时，Java应用或JVM会表现出明显的性能问题。当应用运行所需的内存超过可用物理内存时，就会发生页面交换。为了应对这种可能出现的情况，通常要为系统配置swap空间。swap空间一般会在一个独立的磁盘分区上。当应用耗尽内存时，操作系统会将应用的一部分置换到磁盘上的swap空间。通常是应用中最少运行的部分，以免影响整个应用或者应用最忙的那部分。当访问应用中被置换出去的部分时，就必须将它从磁盘置换进内存，而这种置换活动会对应用的响应性和吞吐量造成很大影响。

<font color=DeepPink>**JVM垃圾收集器在系统页面交换时的性能也很差，这是由于垃圾收集器为了回收不可达对象所占用的空间，需要访问大量的内存。如果Java堆得一部分被置换出去，就必须先置换进内存以便垃圾收集器扫描存活对象，这会增加垃圾收集的持续时间。**</font>垃圾收集是一种Stop-The-World操作，即停止所有正在运行的应用线程，如果此时系统正在进行页面交换，则会引起JVM长时间的停顿。

### 监控抢占式上下文切换
让步式上下文切换时指执行线程主动释放CPU，抢占式上下文切换时指线程因为分配的时间片用尽而被迫放弃CPU或者被其他优先级更高的线程锁抢占。pidstat的输出结果中<font color=DeepPink>**cswch/s**</font>是每秒的让步式上下文切换，<font color=DeepPink>**nvccswch/s**</font>是抢占式上下文切换。

### 监控线程迁移
我们发现，待运行线程在处理器之前的迁移也会导致性能的下降。大多数操作系统的CPU调度程序会将待运行线程分配给上次运行它的虚拟处理器。如果这个虚拟处理器忙，调度程序就会将待处理线程迁移到其他可用的虚拟处理器。<font color=DeepPink>**线程迁移会对应用性能造成影响，这是因为新的虚拟处理器缓存中可能没有待运行线程所需的数据或状态信息。**</font>多核系统上运行Java应用可能会发生大量的线程迁移，减少迁移的策略是创建处理器组并将应用分配给这些处理器组。一般性准则是，<font color=DeepPink>**如果横跨多核或虚拟处理器的Java应用每秒迁移超过500次，将Java应用绑定在处理器组上就有好处。**</font>

## 网络I/O使用率

### 应用性能改进的考虑

单次读写数据量小而网络读写量大的应用会消耗大量的系统态CPU，产生大量的系统调用。对于这类应用，减少系统态CPU的策略是减少网络读写的系统调用。此外，使用非阻塞的Java NIO而不是阻塞的java.net.Socket，减少处理请求和发送相应的线程数，也可以改善应用性能。

从非阻塞Socket中读取数据的策略是，应用在每次读请求时尽可能多地读取数据。同样，当往Socket中写数据时，每个写调用应该尽可能多地写。

# JVM概览

## HotSpot 运行时

### 命令行选项

HotSpot VM 命令行选项有3类：
* 标准选项（Standard option）：标准选项是Java virtual Machine Specification要求所有java JVM 都必须实现的选项。
* 非标准选项（NonStandard option）：非标准选项(以–X为前缀)，不保证也不强制所有JVM实现都必须支持。
* 非稳定选项（Developer option）：非稳定选项(以-XX为前缀),通常为了特定需要而对JVM的运行进行矫正。选项名称前+代表 true启用，-代表false关闭。

### VM生命周期

启动器启动HotSpot VM时会执行一系列操作。步骤概述如下：

1. 解析命令行选项
2. 设置堆的大小和JIT编译器
如果命令行没有明确设置堆的大小和JIT编译器，启动器则通过自动优化进行设置。
3. 设定环境变量如：LD_LIBRARY_PATH和CLASSPATH
4. 如果命令行有-jar选项，启动器则从指定JAR的manifest中查找Main-Class，否则从命令行读取Main-Class
5. 使用标准Java本地接口（Java Native Interface，JNI）方法JNI_CreateJavaVM在新创建的线程中创建HotSpot VM
6. 一旦创建并初始化号HotSpot VM，就会加载Java Main-Class，启动器也会从Java Main-Class中取得Java main方法的参数
7. HotSpot VM通过JNI方法CallStartVoidMethod调用Java main方法，并将命令行选项传给它

### VM类加载阶段

#### 类加载阶段

对于给定的Java类或接口，类加载时会依据它的名字找到Java类的二进制类文件，定义Java类，然后创建代表这个类或者接口的java.lang.Class对象。如果没有找到Java类或接口的二进制表示就会抛出NoClassDefFound。此外，类加载阶段会对类的格式进行语法检查，如果有错，则会抛出ClassFormatError或UnsupportedClassVersionError。Java类加载前，HotSpot VM必须先加载它的所有超类和超接口，如果类的继承层次有错，例如Java类是它自己的超类或超接口（类层次递归）,HotSpot VM则会抛出ClassCircularityError。如果所引用的直接超接口本身并不是接口，或者直接超类实际上是接口，HotSpot VM则会抛出IncompatibleClassChangeError。


链接的第一步是验证，检查类文件的语义、常量池符号以及类型。如果检查有错，就会抛出VerifyError。链接的下一步是准备，它会创建静态字段，初始化为标准默认值，以及分配方法表。请注意，此时还没有执行任何Java代码。接下来解析符号引用，这一步是可选的。然后初始化类，运行类构造器。这是迄今为止，类中运行的第一段Java代码。值得注意的是，<font color=DeepPink>**初始化类需要首先初始化超类（不会初始化超接口）**</font>。

>如：int的标准默认值为0；public static int value=123，准备阶段将其初始化为0而不是123，value=123的赋值操作在类构造器\<clinit\>()中。
public static final int value=123，编译时会为value在字段属性表中生成ConstantValue，从而在准备阶段就被初始化成123。

Java Virtual Machine Specification规定首次使用类时进行类初始化，而Java Language Specification则允许在链接阶段符号解析时灵活处理，只要保持语言的语义不变，JVM依次执行加载、链接和初始化，保证及时抛出错误即可。出于性能优化的考虑，通常直到类初始化时HotspotVM才会加载和链接类。<font color=DeepPink>**这意味着，类A引用类B。加载A不一定导致加载B（除非B需要验证）。执行B的第一条指令会导致初始化B，从而加载和链接B。**</font>

#### 类加载器委派
当请求类加载器查找和加载某个类时，该类加载器可以转而请求别的类加载器来加载。这被称为类加载器委派。类的首个类加找器称为初始类加载器（Initiating ClassLoader)，最终定义类的类加载器称为定义类加载器（Defining ClassLoader）。<font color=DeepPink>**就字节码解析而言，某个类的初始类加载器是指对该类进行常量池符号解析的类加载器。**</font>

类加载器之间是层级化关系，每个类加载器都可以委派给上一级类加载器。这种委派关系定义了二进制类的查找顺序。<font color=DeepPink>**Java SE类加载器的层级查找顺序为启动类加载器、扩展类加载器及系统类加载器。**</font>系统类加载器是默认的应用程序类加载器，它加载Java类的main方法并从classpath上加载类。<font color=DeepPink>**应用程序类加载器可以是Java SE系统自带的类加载器，或者由应用程序开发人员提供。扩展类加载器则JavaSE系统实现，它负责从JRE(Java Runtime Environment,Java运行环境）的lib/ext目录下加载类。**</font>

#### 启动类加载器

<font color=DeepPink>**启动类加载器是由HotSpot VM实现的，负责加载BOOTCLASSPATH路径中的类，如包含Java SE类库的rt.jar。**</font>为了加快启动速度，Client模式的HotSpot VM可以通过称为类教据共享（Class Data Sharing）的特性使用已经预加载的类。这个特性默认为开启，可由HotSpot VM命令行开关-Xshare:on开启，-Xshare:off关闭。到本书编写时为止，Server模式的HotSpot VM还不支持类数据共享，而且即便是Client模式，也只有使用Serial收集器时才支持该机制。

#### 类型安全
Java类或接口的名字为全限定名（包括包名）。Java的类型由全限定名和类加载器唯一确定。

#### HotSpot类元数据
类加载时，HotSpot VM会在永久代创建类的内部表示instanceKlass或arrayKlass。instanceKlass应用了与之对应的java.lang.Class实例，后者是前者的Java镜像。HotSpot VM内部使用称为klassOop的数据结构访问instanceKlass。后缀“Oop”表示普通对象指针，所以klassOop是应用java.lang.Class的HotSpot内部抽象，它是指向Klass（与Java类对应的内部表示）的普通对象指针。

#### 内部的类加载数据
类加载过程中，HotSpot VM维护了3张散列表。SystemDictionary包含已加载的类，它将建立类名/类加载器（包括初始类加载器和定义类加载器）与klassOop对象之间的映射。目前只有在安全点事才能移除SystemDictionary中的元素。Placeholder-Table包含当前正在加载的类，它用于检查ClassCircularityError，多线程类加载器并行加载类时也会用到它。LoaderConstraintTable用于追踪类型安全检查的约束条件。<font color=DeepPink>**这些散列表都需要加锁保证访问安全，在HotSpot VM中，这个锁称为SystemDictionary_lock。通常，HotSpot VM借助类加载器对象锁对加载类的过程进行序列化。**</font>


### 字节码验证
Java是一门类型安全语言，官方标准的Java编译器（javac）可以生成合法的类文件和类型安全的字节码，但Java虚拟机无法确保字节码一定是由可信的javac编译器产生的，所以在链接时必须进行字节码验证以保障类型安全。

### 类数据共享

类数据共享是Java 5引人的特性，以缩短Java程序（特別是小程序）的启动时间，同时也能减少它们的内存占用。使用Java HotSpot JRE安装程序在32位平台上安装Java运行环境（JRE)时，安装程序会加载系统jar中的部分类，变成私有的内部表示并转储成文件，称为共享文档(Shared Archive)。如果过没有使用Java HotSpot JRE安装程序，也可以手工生成该文件。之后调用Java虚拟机时，共享文档会映射到JVM内存中，从而减少减少加载这些类的开销，也使得这些类的大部分JVM允数椐能在多个JVM进程间共享。

### 解释器
HotSpot VM解释器是一种基于模板的解释器。JVM启动时，HotSpot VM运行时系统利用内部TemplateTable中的信息在内存中生成解析器。TemplateTable包含于每个字节码对应的机器代码，每个模板描述一个字节码。

HotSpot VM解释器堪于模板的设计要好于传统的switch语句循环方式。switch语句需要重复执行比较操作，最差情况需要和所冇字节码比较。此外，switch语句必须使用单独的软件栈传递 Java 参数。HotSpot VM使用本地C栈传递 Java 参数。一些存储在C变量中的HotSpot VM内部变量，例如Java线程的程序计数器或栈指针，并不能保证总是存储在底层硬件寄存器中。结果，管理这些软件解释器数据结构就会占去总执行时间的相当大一部分。不过总体来说，HotSpot解释器显著缩短HotSpot VM和实体机之间的性能差距，解释速度也明显变快了，然而代价是大量与机器相关的代码。例如，Intel X86平台特定的代码大约有10000行，SPARC平台专用的代码大约打14000行。由于需要支持动态代码生成（JIT编译），整体的代码量和复杂度也显著变大。并且调 试动态生成的机器码（ JIT编译代码）比调试静态代码困难多了。虽然这些不利于运行时系统的改善，但也并非不可能完成的任务。

### 异常处理
当与Java的语义约束冲突时，Java虚拟机会用异常通知程序。异常处理由HotSpot VM解释器、JIT编译器和其他HotSpot VM组件一起协作实现。异常处理主要有两种情形，同一方法中抛出和捕获异常，或由调用方法捕获异常。异常可以由抛出字节码、VM内部调用返回、JNI调用返回或Java调用返回所引发。

### 线程管理
<font color=DeepPink>**HotSpot VM通过协作、轮询的机制创建安全点**</font>。简中来说，线程会经常询问：“我该在安全点停住么？ ”高效地询问这个问题并不是件容易的事。线程在状态变迁的过程中，会经常询问这个问题，但并非所有的状态变迁都会如此询问，比如线程离开HotSpot VM进入本地代码的情况。此外，JIT编译代码从java方法中返回或正作循环迭代的某个阶段时，线程也会询问“我该在安全点停住吗？ ”。正在执行解释代码的线程通常不会询问它们是否该在安全点停住。相反，当解释器切换到不同的分配表时，会请求安全点。切换操作中包含一部分代码，用以询问何时离开安全点。当离开安全点时，分配表会再次切换回来。一旦请求了安全点，VMThread就必须在继续执行VM操作前等待，直到确定所行线程都已进入安全点保全状态为止。在安全点时，VMThread用Threads_lock阻塞所有正在运行的线程，VM操作完成后 , VMThread释放Threads_lock。

### Java本地接口（JNI）
切记，一旦在应用中使用JNI，就意味着丧失了Java平台的两个好处。首先，依赖JNI的Java应用难以在多种异构的硬件平台上运行。即便应用中Java语言编写的部分可以移植到多种硬件平台，采用本地编程语言的部分也需要重新编译。换句话说，一旦使用JNI就失去了Java承诺的特性，即“一次编写，到处运行”。其次，Java是强类型和安全的语言,本地语言如C或C++则不是。因此，Java开发者用JNI编写应用时必须格外小心。误用本地方法可能破坏整个应用。鉴于此，在调JNI方法前，Java应用常常需要安仝检查。额外的安全检查以及HotSpot VM在Java与JNI之间的数据复制会降低应用的性能。

HotSpot VM追踪正在执行本地方法的线程时必须特別小心。在HotSpot VM的某些活动过程中，尤其是垃圾收集的某些阶段，线程必须在安全点时暂停，以保证Java内存堆不被更改，确保垃圾收集的准确性。当HotSpot VM线程执行本地代码到达安全点时，线程可以继续执行本地代码，直到它Java代码或者发起JNI调用为止。

### VM致命错误处理

HotSpot内部使用信号进行通信。当无法识别信号时，将调用致命错误处理程序。在无法识别的情况下，它可能来自应用程序JNI代码，OS本地库，JRE本地库或JVM本身的错误。

## HotSpot VM垃圾收集器

### 分代垃圾收集

垃圾收集器不需要扫描整个（可能比新生代更大）老年代就能识别新生代中的存活对象，从而缩短Minor GC的时间。<font color=DeepPink>**HotSpot VM的垃圾收集器使用称为卡表（CardTable)的数据结构来达到这个目的。老年代以512字节为块划分成若十张卡（Card)。卡表是个单字节数组，每个数组元素对应堆中的一张卡。每次老年代对象中某个引用新生代的字段发生变化时，HotSpot VM就必须将该卡所对位的卡表元素设置为适当的值，从而将该引用字段所在的卡标记为脏。在Minor GC过程中，垃圾收集器只会在脏卡中扫描查找老年代-新生代引用。**</font>

![](/images/java-performance-note/图3-3.png)

<font color=DeepPink>**HotSpot VM的字节码解释器和JIT编译器使用写屏障(Write Barrier)维护卡表。**</font>写屏障是一小段将卡状态设罝为脏的代码。解释器每次执行更新引用的字节码时，都会执行一段写屏障；JIT 编译器在生成更新引用的代码后，也会生成一段写屏障。虽然写屏障使得应用线程增加了一些性能开销，但Minor GC变快了许多，整天的垃圾收集效率也提高了许多。通常应用的吞吐量也会有所改善。

### 新生代

需要指出的是，<font color=DeepPink>**在Minor GC过程中，Survivor可能不足以容纳Eden和另一个Survivor中的存活对象。如果Survivor 中的存活对象溢出，多余的对象将被移到老年代。这称为过早提升(Premature Promotion)**</font>。这会导致老年代中短期存活对象的增长，可能会引发严重的性能问题。再进一步说，在Minor GC过程中，如果老年代满了而无法容纳更多的对象，Minor GC之后通常就会进行Full GC,这将导致遍历整个Java堆。这称为提升失败（Promotion Failure）。

### 快速内存分配
对象内存分配器的操作需要和垃圾收集器紧密配合。垃圾收集器必须记录它回收的空间，而分配器在重用堆空间之前需要找到可以满足其分配需求的空闲空间。垃圾收集器以复制方式回收HotSpot VM新生代，其好处在于回收以后Eden总为空，在Eden中运用被称为指计碰撞(Bump-the-Pointer)的技术就可以有效地分配空间。这种技术追踪最后一个分配的对象（常称为top),当有新的分配请求时，分配器只需要检查top和eden未端之间的空间是否能容纳。如果能容纳，top则跳到新近分配对象的未端。

<font color=DeepPink>**重要的Java应用大多是多线程的，因此内存分配的操作需要考虑多线程安全。如果只用全局锁，在Eden中的分配操作就会成为瓶颈而降低性能。HotSpot VM没有采用这种方式，而是以一种称为线程本地分配缓冲区（thread-Local Allocation Buffer,TLAB)的技术，为每个线程设置各自的缓冲区(即Eden的一小块），以此改善多线程分配的吞吐量。因为每个TLAB都只有一个线程从中分配对象，所以可以使用指针碰撞技术快速分配而不需要任何锁。然而当线程的TLAB填满需要获取新的空间时（不常见），它就需要采用多线程安全的方式了。大部分时候，HotSpot VM的new Object()操作只需要大约十条指令。垃圾收集器清空Eden区域，然后就可以支持快速内存分配了。**</font>

## HotSpot VM JIT编译器
经典的寄存器分配策略是图着色算法，通常可以使机器寄存器的使用率达到最高，而且多余的值很少会卸载到栈中。图表示的是同时有哪些变量在使用．以及哪些寄存器可以存放这些变量。如果同时存活的变量数超过了可用的寄存器数，重要性最低的变量将被移到栈中，使得其他变量可以使用寄存器。指派某个变量给寄存器通常需要来回几次构建图和着色。这也导致了它的不足，图着色算法花费的时间、数据结构所需的空间都比较昂贵。

# JVM性能监控

## 垃圾收集
### 重要的垃圾收集数据
重要的垃圾收集数据包括：
* 当前使用的垃圾收集器
* Java堆的大小
* 新生代和老年代的大小
* 永久代的大小
* Minor GC的持续时间
* Minor GC的频率
* Minor GC的空间回收量
* Full GC的持续时间
* Full GC的频率
* 每个并发垃圾收集周期内的空间回收量
* 垃圾收集前后Java堆的占用量
* 垃圾收集前后新生代和老年代的占用量
* 垃圾收集前后永久代的占用量
* 是否老年代或永久代的占用触发了 Full GC
* 应用是否显式调用了 System.gc()

### 垃圾回收报告

### JIT编译器

可以使用-XX:+PrintCompilation监控HotSpot JIT编译器。-XX:+PrintCompilation为每次编译生成一行日志。

日志样例如下:
```
7		java. lang String: indexOf (151 bytes)
8% !		sun. awt. image. PNGImageDecoder: produceImage a 960 (1920 bytes)
9  !		sun awt. image. PNGImageDecoder: produceImage (1920 bytes)
10		java. lang. AbstractStringBuilder: append(40 bytes)
11	n	java. lang System: arraycopy (static)
12	s	java util. Hashtable: get (69 bytes)
13	b	java util. HashMap: indexFor (6 bytes)
14	made zombie java. awt. geom. Path2DSIterator: isDone (20 bytes)
```

# JVM性能调优入门

## 应用程序的系统需求

### 吞吐量
<font color=DeepPink>**吞吐量是对单位时间内处理工作量的度量**</font>。设计吞吐量需求时,我们一般不考虑它对延迟或者响应时间的影响。通常情况下,增加吞吐量的代价是延迟的增加或内存使用的增加。

吞吐量性能需求的一个典型例子是,应用程序每秒需要完成2500次事务。

### 延迟或响应性
<font color=DeepPink>**延迟,或者响应性,是对应用程序收到指令开始工作直到完成该工作所消耗时间的度量。**</font>

定义延迟或响应性需求时并不考虑程序的吞吐量。通常情况下,提高响应性或缩小延迟的代价是更低的吞吐量、或者更多的内存消耗(或者二者同时发生)

延迟或响应需求的一个典型例子是,应用程序应该在60毫秒内完成交易请求的处理工作。


### 内存占用

<font color=DeepPink>**内存占用指在同等程度的吞吐量、延迟、可用性和可管理性前提下,运行应用程序所需的内存大小。**</font>内存占用通常以运行应用程序需要的Java堆大小或者运行应用程序需要的总内存大小来表述。一般情况下,通过增大Java堆的方式增加可用内存能够提高吞吐量、降低延迟或者兼顾二者。应用程序的可用内存减少时,吞吐量和延迟通常都会受到影响。应用程序的内存占用限制了固定内存的机器上能同时运行的应用程序实例数。

内存占用需求的一个典型例子是,应用程序需要在拥有8GB内存的系统上以单个实例方式运行或者在24GB内存的系统上以3个应用程序实例方式运行。

## 性能收集调优基础

### 性能属性
* 吞吐量:是评价垃圾收集器能力的重要指标之一,指不考虑垃圾收集引起的停顿时间或内存消耗,垃圾收集器能支撑应用程序达到的最高性能指标。
* 延迟:也是评价垃圾收集器能力的重要指标,度量标准是缩短由于垃圾收集引起的停顿时间或完全消除因垃圾收集所引起的停顿,避免应用程序运行时发生抖动。
* 内存占用:垃圾收集器流畅运行所需要的内存数量。

<font color=DeepPink>**这其中任何一个属性性能的提高几乎都是以另一个或两个属性性能的损失作代价的。换句话说,某一个属性上的性能提高总会牺牲另一个或两个属性。然而,对大多数的应用而言,极少出现这三个属性的重要程度都同等的情况。很多时候,某一个或两个属性的性能要比另一个重要。**</font>

我们需要了解对应用程序而言哪些系统需求是最重要的,也需要知道对应用程序而言这三个性能属性哪些是最重要的。确定哪些属性最重要,并将其映射到应用程序的系统需求,对应用程序而言非常重要。

### 原则
谈到JVM垃圾收集器调优也有三个需要理解的基本原则。
* 每次Minor GC都尽可能多地收集垃圾对象。我们把这称作“<font color=DeepPink>**Minor GC回收原则**</font>”。遵守这原则可以减少应用程序发生 Full GC的频率。Full GC的持续时间总是最长的,是应用程序无法达到其延迟或吞吐量要求的罪魁祸首。
* 处理吞吐量和延迟问题时,垃圾处理器能使用的内存越大,即Java堆空间越大,垃圾收集的效果越好,应用程序运行也越流畅。我们称之为“<font color=DeepPink>**GC内存最大化原则**</font>”。
* 在这三个性能属性(吞吐量、延迟、内存占用)中任意选择两个进行JVM垃圾收集器调优。我们称之为“<font color=DeepPink>**GC调优的3选2原则**</font>”。

调优JVM垃圾收集的过程中谨记这三条原则能帮助你更轻松地调优垃圾收集,达到应用程序的性能要求。

## 确定内存占用

### HotSpot VM堆布局

通过-Xmn可以很方便地设定新生代空间的初始值和最大值。有一点需要特别注意,如果-Xms和-Xmx并没有设定为同一个值,使用-Xmn选项时,Java堆的大小变化不会影响新生代空间,即新生代空间的大小总保持恒定,而不是随着Java堆大小的扩展或缩减做相应的调整。因此,请注意,<font color=DeepPink>**只有在-Xms与-Xmx设定为同一值时才使用-Xmn选项。**</font>

老年代空间的大小会根据新生代的大小隐式设定。老年代空间的初始值为-Xmx的值减去XX:	NewSize的值。老年代空间的最小值为-Xmx的值减去-XX:MaxNewSize的值。如果-Xms与Xmx设置为同一值,同时使用了-Xmn,或者-XX:NewSize与-XX:MaxNewsize一样,则老年代的大小为-Xmx(或-Xms)的值减去-Xmn。

实际上,当HotSpot VM发现当前可用空间不足以容纳下一次Minor GC提升的对象时就会进行Full GC。与因空间问题导致的Minor GC过程中的对象提升失败比较起来,这种方式的代价要小得多。从失败的对象提升中恢复是一个很昂贵的操作。永久代没有足够的空间存储新的VM或类元数据时也会发生Full GC。

如果Full GC缘于老年代空间已满,即使永久代空间并没有用尽,老年代和永久代都会进行垃圾收集。同样,如果Full GC由永久代空间用尽引起,老年代和永久代也都会进行垃圾收集,无论老年代是否还有空闲空间。开启-XX:+UseParallelGC或-XX:+UseParallelOldGC时,如果关闭-XX:-ScavengeBeforeFullGC, HotSpot VM在Full GC之前不会进行Minor GC,但Full GC过程中依然会收集新生代;如果开启-XX:+ScavengeBeforeFullGC, HotSpot VM在Full GC前会先做一次Minor GC,分担一部分Full GC原本要做的工作。

### 堆大小调优着眼点

如果你使用的HotSpot VM不接受-XX:+UseParallelOldGC选项,可以使用-XX:+UseParallelGC代替。如果你很清楚Java应用程序要使用多大的Java堆空间,可以将Java堆大小作为调优的入手点,使用-Xmx和-Xms设置Java堆的大小。如果你不清楚Java应用程序到底需要使用多大的Java堆,可以利用HotSpot VM自动选取Java堆的大小。启动Java应用程序时不指定-Xmx或-Xms的值, HotSpot VM会自动设定Java堆大小的初始值。换句话说,这是一个起始点。随着调优过程,后面会逐渐调整Java堆的大小。

通过HotSpot命令行选项-XX:+PrintCommandLineFlags还可以查看堆的初始值及最大值。-XX:+PrintCommandlineFlags选项可以输出HotSpot VM初始化时使用-XX:InitialHeapSize=\<n\> -XX:MaxHeapSize=\<m\>指定的堆的初始值及最大值,其中\<n\>是以字节为单位的初始Java堆大小,\<m\>是以字节为单位的堆的最大值。

### 计算活跃数据大小

<font color=DeepPink>**活跃数据大小是应用程序运行于稳定态时,长期存活的对象在Java堆中占用的空间大小。换句话说,活跃数据大小是应用程序运行于稳定态,Full GC之后Java堆中老年代和永久代占用的空间大小。**</font>

Java应用的活跃数据大小可以通过GC日志收集。活跃数据大小包括下面的内容:
* 应用程序运行于稳定态时,老年代占用的Java堆大小;
* 应用程序运行于稳定态时,永久代占用的Java堆大小。

除了活跃数据大小,稳定态的Full GC也会对延迟带来严重影响。

为了更好地度量应用程序的活跃数据大小,最好在多次Full GC之后再查看Java堆的占用情况。另外,需要确保Full GC发生时,应用程序正处于稳定态。

如果应用程序没有发生Full GC或者不经常发生Full GC,你可以使用JVM监控工具Visual VM或JConsole人工触发Full GC。你也可以使用HotSpot JDK发行版中提供的jmap命令,通过命令行强制进行Full GC。为了实现这个目的,jmap需要使用- histo:live命令行选项及JVM进程号。JVM进程号可以通过JDK的js命令获得。例如,Java应用程序的JM进程号是348,使用jmap触发Full GC的命令行如下:
```
jmap -histo: live 348
```
jmap命令触发 Full GC的同时也生成一份包含对象分配信息的堆分析文件。为了专注本步操作,你可以忽略生成的堆分析文件。

### 初始化堆大小配置

推荐的做法是基于最差延迟进行估算。

|  空间   | 命令行选项  | 占用倍数  |
|  ----  | ----  |----  |
| Java堆  | -Xms和-Xmx | 3-4倍Full GC后的老年代空间占用量  |
| 永久代  | -XX:Permsize<br>-XX:MaxPermSize | 1.2-1.5倍Full GC后的永久代空间占用量  |
| 新生代  | -Xmn | 1~1.5倍 Full GC后的老年代空间占用量  |
| 老年代  | Java堆大小减新生代大小 | 2-3倍Full GC后的老年代空间占用量  |

## 调优延迟/响应性

### 输入
这一步调优有多个输入,都源于应用程序的系统性需求。
* 应用程序可接受的平均停滞时间。平均停滞时间将与测量出的Minor GC持续时间进行比较。
* 可接受的Minor GC(会导致延迟)频率。 Minor GC的频率将与可容忍的值进行比较。对应用程序干系人而言,GC持续的时间往往比GC发生的频率更重要。
* 应用程序干系人可接受的应用程序的最大停顿时间。最大停顿时间将与最差情况下Full GC的持续时间进行比较。
* 应用程序干系人可接受的最大停顿发生的频率。最大停顿发生的频率基本上就是Full GC的频率。同样,对于大多数应用程序干系人而言,相对于GC的频率,他们更关心GC持续的平均停顿时间和最大停顿时间。

### 优化新生代的大小
调整新生代空间时,需要谨记下面几个准则：
* <font color=DeepPink>**老年代空间大小不应该小于活跃数据大小的1.5倍。**</font>
* <font color=DeepPink>**新生代空间至少应为Java堆大小的10%**</font>,通过Xmx和-Xms可以设定该值。新生代过小可能适得其反,会导致频繁的Minor GC。
* 增大Java堆大小时,需要注意不要超过JVM可用的物理内存数。堆占用过多内存将导致底层系统交换到虚拟内存,反而会造成垃圾收集器和应用程序的性能低下。

### 监控晋升阈值

最大晋升阈值可以通过HotSpot VM的命令行选项-XX: MaxTenuringThreshold=\<n\>设置。使用HotSpot VM的命令行选项
```
-XX: +PrintTenuringDistribution
```

可以监控晋升的分布或者对象年龄分布,并以此为依据确定最优的最大晋升阈值值。

通过-XX:+PrintTenuringDistribution命令行选项可以观察Survivor空间中的对象是如何老化的。在-XX:+PrintTenuringDistribution生成的输出中,我们需要关注的是随着对象年龄的增加,各对象年龄上字节数减少的情况,以及 HotSpot VM计算出的晋升阈值是否等于或接近设置的最大晋升阈值。

XX:+PrintTenuringDistribution会输出每次Minor GC时晋升分布的情况。它也可以和其他的垃圾收集命令行选项,例如-XX:+PrintGCDateStamps、-XX:+PrintGcTime Stamps或-XX:+PrintgCDetails配合使用。对Survivor空间的有效对象老化进行微调时,应该使用选项XX:+PrintTenuringDistribution在垃圾收集日志中包含晋升分布的统计信息。同样,如果需要在生产环境中判断一个应用程序事件是否源于一次Stop-The-World压缩式垃圾收集,往往也需要获取晋升分布的日志信息,使用该选项是非常有帮助的。

> <font color=DeepPink>**通常情况下,观察到新的晋升阈值持续小于最大晋升阈值,或者观察到 Survivor空间大小小于总的存活对象大小都表明 Survivor空间过小。**</font>

### 调整 Survivor空间的容量

调整Survivor空间容量一个应该谨记于心的重要原则:<font color=DeepPink>**调整Survivor空间容量时,如果新生代空间大小不变,增大Survivor空间会减少Eden空间;而减少Eden空间会增加Minor GC的频率。**</font>因此,为了同时满足应用程序Minor GC频率的要求,就需要增大当前新生代空间的大小;即增大Survivor空间大小时,Eden空间的大小应该保持不变。换句话说,每当 Survivor空间增加时,新生代空间都应该增大。如果可以增大Minor GC的频率,你可以选择用一部分Eden空间来增大Survivor空间,或者直接增大新生代空间大小。如果内存足够,相对于减少Eden空间.增加新生代大小通常是更好的选择。保持Eden空间大小恒定, Minor GC的频率就不会由于Survivor空间增大而发生变化。

> 如果你观察到垃圾收集中晋升分布极少出现对象年龄为15的情况,并且也没有发生Survivor空间溢出,那么应该设置最大晋升阈值为其默认值15。这种场景下,对象都不是长期存活对象,在年龄很小的时候就被回收了,根本不会生存到最大晋升年限的年龄15。

#### 调整目标Survivor空间占用

目标Survivor空间占用是HotSpot VM尝试在Minor GC之后仍然维持的Survivor空间占用。通过 HotSpot VM的命令行选项-XX:TargetSurvivorRatio=\<percent\>可以对该值进行调整。通过命令行选项指定的参数实际上是Survivor空间占用的百分比而不是一个比率。它的默认值是50。

HotSpot VM研发团队对不同类型的应用程序进行了大量的负荷测试,结果表明50%的目标Survivor空间占用能适应大多数的应用程序,这是因为它能应对Minor GC时存活对象的急速增加。

极少发生需要对目标Survivor空间占用进行调优的情况。但是,如果应用程序有一个相对稳定的对象分配速率,可以考虑提高目标Survivor空间占用到80~90。这样可以减少用于老化对象的Survivor空间的数量。将-XX:TargetSurvivorRatio=\<percent\>设置得大于默认值会带来的问题是不能很好的适应迅速上涨的对象分配速率,导致提升对象的时机比预期更早。使用CMS时,如果对象提升过快会导致老年代占用增大,由于提升了一些非长期存活的对象,这些对象在将来的并发垃圾收集周期中一定会被回收,导致出现内存碎片的概率较高。碎片是我们要尽量避免的,因为它最终会导致Stop-The-World压缩式垃圾收集。

<font color=DeepPink>**成功的CMS收集器调优要能以对象从新生代提升到老年代的同等速度对老年代中的对象进行垃圾收集。达不到这个标准则称之为“失速”(Lost the Race)失速的结果就会发生Stop-The-World压缩式垃圾收集。避免失速的关键是要结合足够大的老年代空间和足够快地初始化CMS垃圾收集周期,让它以比提升速率更快的速度回收空间。**</font>

<font color=DeepPink>**CMS周期的初始化基于老年代空间的占用情况。如果CMS周期开始得太晚,就会发生失速。如果它无法以足够快的速度回收对象,就无法避免老年代空间用尽。但是CMS周期开始得过早又会引起无用的消耗,影响应用程序的吞吐量。通常,早启动CMS周期要比晚启动CMS好,因为启动太晚的结果比启动过早的结果要恶劣得多。**</font>

如果GC日志中发现concurrent mode failures字样,可以通过下面的命令行选项通知HotSpot在更早的时间启动CMS垃圾收集周期。
```
-XX: CMSInitiatingOccupancyFraction=<percent>
```
设定的值是CMS垃圾收集周期在老年代空间占用达到多少百分比时启动。例如,如果你希望CMS周期在老年代空间占用达到65%时开始,可以设置-XX:CMSInitiatingOccupancyFraction=65。

另一个可以与-XX:CMSInitiatingOccupancyFraction=\<percent\>一起使用另一个Hotspot命令行选项是
```
-XX:+UseCMSInitiatingOccupancyOnly
```
-XX:+UseCMSInitiatingOccupancyOnly告知HotSpot VM总是使用-XX:CMSInitiatingOccupancyFraction设定的值作为启动CMS周期的老年代空间占用阈值。不使用-XX:+UseRs InitiatingOccupancyOnly, HotSpot VM仅在启动的第一个CMS周期里使用-XX:CMSInitiatingOccupancyFraction设定的值作为占用比率,之后的周期中又转向自适应地启动CMS周期,即第一次CMS周期之后就不再使用-XX:CMSInitiatingoccupancy Fraction设定的值。

> 过选项设置何时启动CMS周期时,最好同时使用-XX:CMSInitiatingOccupancyFraction=\<percent\>和-XX:+UseCMSInitiatingOccupancyOnly

<font color=DeepPink>**选项-XX:CMSInitiatingOccupancyFraction设定的空间占用值应该大于老年代占用空间和活跃数据大小之比。应用程序的活跃数据大小就是一次Full GC之后堆所占用的空间大小。如果使用-XX:CMSInitiatingOccupancyFraction设置的值小于活跃数据的占用百分比,CMS收集器一直运行陷入死循环。因此-XX:CMSInitiatingoccupancyFraction设置的一个通用原则是老年代占用百分比应该至少应该是活跃数据大小的1.5倍。**</font>

<font color=DeepPink>**何时(提前或推迟)启动CMS周期取决于对象从新生代提升至老年代的速率,即老年代空间的增长率。如果老年代空间消耗得比较慢,可以在稍晩的时候启动CMS周期。如果老年代空间消耗迅速,你应该在较早的时候启动CMS周期,但是也不应低于活跃数据的占用的比率。**</font>不应该将启动CMS周期的值设置得比活跃数据的大小低,解决这个问题更好的方法是增大老年代空间的大小。

### 显式的垃圾收集
使用CMS时,如果你观察到由显式调用System.gc()触发的Full GC,有2种处理的方法。

1、可以使用如下的 HotSpot VM命令行选项,指定 HotSpot VM以CMS垃圾收集周期的方式执行

-XX:+ExplicitGCInvokesConcurrent

或者

-XX:+ExplicitGCInvokesConcurrentAndUnloadsClasses

前者需要Java6及以上版本。后者需要Java6 Update4及以上版本。如果你的JDK版本支持,最好使用-XX:+ExplicitGCInvokesConcurrentAndUnloadsClasses选项。

2、也可以使用下面的命令行通知HotSpot VM忽略显式的 System.gc()调用

-XX:+DisableExplicitGC

要留意的是,使用这个命令行选项也会导致其他 HotSpot VM的垃圾收集器忽略显式的System.gc()调用。

禁用显式的垃圾收集时应该慎重,它可能会对应用程序的性能造成较大影响。还有可能出现这样的场景,你需要及时对对象引用做处理,但与之对应的垃圾收集却跟不上其节奏。使用Java RMI的应用程序尤其容易碰到这种问题。我们建议除非有非常明确的理由,否则不要轻易地禁用显式的垃圾收集。与此同时,也建议只在有明确理由的情况下才在应用程序中使用System.gc()。

```
2010-12-16T23:04:39.452-0600:[Full GC(System)
CMS:418061K->428608K(16384K),0.2539726 secs
418749K->4288608K(31168K),
[CMS Perm:32428K->32428K(65536K)],
0.2540393 secs]
[Times: user=0. 12 sys=0. 01, real=0. 25 secs]
```

请留意Full GC之后的(System)标签,它表明System.gc()触发了本次 Full GC。如果在垃圾收集日志中发现了显式的Full GC,你需要先判断为什么它会发生,之后再决定是否要禁用,是否要把该调用从代码中移除,或者是否有必要指定一个条件来触发CMS并发垃圾收集周期。

## 应用程序吞吐量调优

> 一个通用原则是使用 Throughput收集器时,垃圾收集的开销应该小于5%。如果可以将垃圾收集的开销减少到1%甚至更少,那基本上就已经到了极限,进一步优化花费的代价很大。

### 调优并行垃圾收集线程

并行垃圾收集器使用的线程数也应该依据系统上运行的应用程序数以及底层的硬件平台进行相应的调优。多个应用程序运行于同一个系统上时,建议通过命令行选项-XX:ParallelGCThreads=\<n\>将并行垃圾收集的线程数设置为小于其默认值。

否则,由于大量的垃圾收集线程同时运行,其他应用程序的性能将受到严重影响。截至Java6 Update23,默认情况下并行垃圾收集的线程数等于Java API Runtime.availableProcessors()的返回值(如果该返回值小于等于8),否则其等于8+(Runtime.availableProcessors()-8)*5/8。<font color=DeepPink>多个应用程序运行于同一系统上时设置并行垃圾收集线程的一个通用原则是用虚拟处理器的数目 (Runtime.availableProcessors()的返回值)除以该系统上运行的应用程序数。</font>这里我们假设这些应用程序的负荷及堆大小的情况相差不大。如果应用程序的负荷及Java堆大小差异很大,那么为每个Java应用设置不同权重,并据此设置并行垃圾线程数是一个比较好的方法。

### 在NUMA系统上部署

如果应用程序需要在NUMA(非一致性内存架构)系统上部署,还有一个可以与Throughput收集器一起使用的HotSpot命令行选项是:
```
-XX:+UseNUMA
```
该命令行选项根据CPU与内存位置的关系在分配线程运行的本地内存中分配对象。这里依据的假设是分配对象的线程是近期最有可能访问该对象的线程。相对于远程的内存而言,在同一线程的本地内存中分配对象用更短的时间即能访问该对象的内容。

只有当JVM的部署跨CPU、不同CPU访问内存的拓扑有所不同,导致访问时间也有所差别的环境下才选择使用-XX:+UseNUMA选项。例如,虽然JVM部署到NUMA系统的一个处理器集上,但是这个处理器集并不存在跨CPU访问内存的拓扑,没有访问时间的差别,那么就不应该使用-XX:+UseNUMA选项。
> 简而言之,支持NUMA的VM会根据NUMA节点划分堆,线程创建新的对象时,只会在该线程运行所在核的NUMA节点上分配对象,后续该线程如果需要使用这个对象,就直接从本地内存中访问。通常情况下,如果没有使用命令,臂如RHEL下使用numactl,设置CPU的亲和性(Affinity),默认就跨多个内存节点,满足-XX:+UseNUMA的使用条件。

> 注：Throughput garbage collector,实际指的是Parallel收集器

## 其它性能命令行选项

### 大页面支持

计算机系统的内存被划分成称为“页”的固定大小的块。程序访问内存的过程中会将虚拟内存地址转换成物理内存地址。虚拟地址到物理地址的转换是通过表完成的。为了减少每次内存访问时访问页表的代价,通常的做法是使用一块快速缓存,对虚拟地址到物理地址的转换进行缓存。这块缓存被称为转译快查缓存(TLB)。

使用TLB完成从虚拟地址到物理地址的映射比遍历整个页表的方式要快得多。TLB通常只能容纳固定数量的条目。TLB中的一条记录就是按页面大小统计的一块内存地址区间的映射。因此系统的页面越大,每个条目能映射的内存地址区间越大,每个TLB能管理的空间也越大。TLB代表的地址区间越大,地址转译请求在TLB中失效的可能性就越小。当一个地址转译请求无法在TLB中找到匹配项时,我们称之发生了“TLB失效”。TLB失效事件发生时常常需要遍历内存中的页表,査找虚拟地址到物理地址的映射。与在TLB中查找地址映射比较起来,遍历页表是一项非常昂贵的操作。由此可见,<font color=DeepPink>**使用大页面的好处是其减小了TLB失效的几率。**</font>

HotSpot虚拟机在Oracle solaris(这之后称为Solaris)、 Linux和 Windows上都支持大页面。页面大小还可能随着处理器的不同有所不同。另外,为了使用大页面还可能需要对操作系统进行配置。

# Java 应用的基准测试

## 基准测试所面临的挑战

### 基准测试的预热阶段
执行基准测试时使用HotSpot VM命令行选项-XX:+PrintCompilation是一个好习惯,使用该命令行选项的输岀可以判断JIT编译器何时完成了预热阶段,确保在 HotSpot编译器到达稳定态后,即已经完成它的优化工作(生成了适合基准测试的优化机器码)后再开始基准数据采样。-XX:+PrintCompilation选项通知VM为每个它优化或逆优化的函数输出一条日志。下面是在一段微基准测试中使用-XX:+PrintCompilation选项输出的日志片段:
```
11	java.util.Random:: nextInt (60 bytes)
12	java.util.Random: next (47 bytes
13	java.util.concurrent atomic Atomi CLong: get (5 bytes)
14	java.util.HashSet: contains (9 bytes)
15	java.util.HashMap: transfer (83 bytes)
16	java.util.Arrays SArrayList: set (16 bytes)
17	java.util.Arrays SArrayList: set (16 bytes)
18	java.util.Collections: swap (25 bytes)
19	java.util.Arrays SArrayList: get (7 bytes)
20	java.lang.Long: <init> (10 bytes)
21	java.lang.Integer: longvalue (6 bytes)
22	java.lang.Long: valueOf (36 bytes)
23	java.lang.Integer: stringSize (21 bytes)
24	java.lang.Integer: getChars (131 bytes)
```

<font color=DeepPink>**观察日志中已经不再有-XX:+PrintCompilation输出的信息(表明JIT编译器的优化工作已经完成)之后才正式开始采样数据。此外,基准测试还应该在不使用-XX:+PrintCompilation选项的情况下运行几次,比较其性能与使用-XX:+ PrintCompilation选项的结果是否一致。如果二者不一致,可能在创建基准测试或微基准测试时受到了其他因素的影响。**</font>

> 微基准测试中有一个惯例,即在开始采样间隔开始计时之前,先调用几次 System.gc()。多次调用 System.gc()的目的是希望通过Java对象的终结方法释放内存,而这往往需要进行多次垃圾收集才能完成。此外,当对象不可达,导致终结方法一直处于等待队列,或者部分执行队列中,调用System.runFinalization()接口可以请求JVM执行其fina1ize()方法,完成垃圾收集。

### 使用Java Time接口
引入新的System.nanoTime()接口之前,大多数的Java基准测试或微基准测试都使用System.currentTimeMillis()接口获取采样间隔的开始和终止时间,根据终止时间与开始时间的间隔得到运行关注的代码所消耗的时间使用Java的System.currentTimeMillis()和System.nanoTime()接口都有一定程度的精度问题。虽然 System.currentTimeMillis()的返回值是以亳秒计的当前时间,但毫秒级的精度却取决于操作系统。Java API Specification中对于System.currentTimeMillis()有明确的陈述:虽然该接口的返回值是毫秒,但返回值的粒度取决于底层的操作系统。这一规范为操作系统使用自身的亳秒级系统接口提供了方便,但是可能存在这样的情况,尽管使用的是毫秒计数器,但是更新间隔却过大,譬如每30毫秒更新一次。这个规范有意地规定得比较宽松,试图让Java API尽可能地支持更多的操作系统,其中就包含一些无法提供毫秒级时钟精度的操作系统。使用Java API System. nanoTime()也有类似的问题。<font color=DeepPink>**虽然该方法提供了纳秒级的精度,但接口并不保证提供纳秒级的精度: System.nanoTime()的 Java API Specification中明确提到不保证System.nanoTime()返回值的更新频度。**</font>

因此,使用System.currentTimeMillis()计算时间消耗时,采样的时间间隔应该足够大,尽量减少System, currentTimeMillis()精度带来的影响。也即是说,采样的时间间隔需要比毫秒大(譬如几秒、或者尽可能几分钟)同样的原则也适用于 System.nanoTime()。根据Java API Specification,System.nanoTime()依赖底层的操作系统,返回系统中可用的最精确时钟的当前值。然而,最精确的可用系统时钟可能也没有纳秒级的精度。进行基准测试时,建议首先摸清楚这两个Java API在对应平台或操作系统上的粒度或精度。如果你不是很清楚,但手里有源代码,可以通过查看这两个API的底层实现,了解其粒度和精度。如果你使用System.currentTimeMillis()或System.nanoTime()。而且采样时间间隔很短(相对于毫秒或纳秒来讲),要特别注意这个问题。

> 微基准测试时,使用System.nanoTime()获取启动和终止时间计算采样间隔是一种好方法。接着计算终止与启动的时间差就可以得到微基准测试的耗时,以及每次操作选代所消耗的纳秒数或者每秒所发生的迭代次数。<font color=DeepPink>**最重要的是要确保微基准测试运行的时间要足够长,确保应用程序运行已达稳定态且采样的时间也足够长。**</font>

### 剔除无效代码
为了避免微基准测试中的代码被定性为无效代码,引发过度简化的问题,可以采用下面的编程实践：
* <font color=DeepPink>**让该方法变得必不可少**</font>
* <font color=DeepPink>**在釆样阶段结束时直接输出计算的结果,或者保存该计算结果,在采样阶段结束后输出该值**</font>

要使计算有意义,就要向被测方法传入参数,并从被测方法返回计算结果。此外,在基准测试采样阶段内或在多个不同的基准测试采样阶段间变换迭代次数也是一个不错的方法,然后比较每毫秒内发生的迭代次数,判断迭代次数是否保持恒定,同时使用-XX:+PrintCompilation选项追踪记录JIT编译器的状态。

### 内联
HotSpot VM的Client和Server JIT编译器都能对方法进行内联。这意味着调用过程中,目标方法会被展开到调用方法中。这个过程是由JIT编译器完成的,JIT编译器通过降低方法调用的开销提升执行性能。此外,内联的代码可能提供更多的优化机会,整合后的代码可能更简单,或者消除了无效调用,而这些在不内联的情况下是无法实现的。内联在微基准测试中还可能实现让人眼前一亮的性能提升。
```
-XX:+PrintInlining
-XX:MaxInlineSize=N
```

### 逆优化
JIT编译器以其执行优化的能力而著称于世。但是,某些场景下JIT编译器也会进行“逆优化”。譬如,Java应用一旦开始运行,方法调用变得频繁;JIT编译器就可以根据从程序过程中了解到的信息做出优化决策。有些时候,优化的决策在后续可能被证明是错误的。当JIT编译器发现之前的优化作了错误的优化决策时就会进行逆优化。很多时候,在JIT编译器逆优化不久之后(一旦达到一定的执行次数阈值)就会接着再次进行优化。忽视发生的逆优化可能得出错误的性能结论。

> 使用-XX:+PrintCompilation选项可以帮助确定是否发生了逆优化。-XX:+Printcompilation选项的输出中如果包含“mad not entrant”,即表明之前的编译优化被丢弃了,方法将通过解释器运行,直到该方法执行足够的次数再触发优化。

<font color=DeepPink>**软件开发者应该专注于优秀的软件架构、设计以及实现,没有必要过度担忧现代JIT编译器的影响。如果对软件架构、设计或实现的修改是为了克服JIT编译器的一些性质,就应该考虑这是JIT编译器的缺陷或不足。**</font>

### 创建微基准测试的注意事项
1. 明确你需要了解的性能指标是什么,设计相应的实验回答你需要解决的回题。不要受些无关痛痒的因素影响而忽略了你真正需要解决的问题。
2. 确保采样阶段中每次使用同样的工作量。
3. 计算并收集多种性能指标,譬如消耗时间、单位时间迭代次数或每次迭代的消耗时间用在预热阶段之后,采样阶段期间记录的性能指标。留意度量时间的精度和粒度,特别是使用了System.currentTimeMi1lis()和System.nanoTime()的情况。多次运行试验,并变换采样的周期数或釆样的持续时间。之后再比较其所消耗的时间,密切注意单位时间迭代次数或每迭代消耗时间指标的变化。微基准测试经历了足够的预热、达到稳定态时,后一个指标几乎应该与釆样阶段持续时间的变化保持一致。
4. 开始釆样之前确认微基准测试已经到达稳定态。可遵循的一条通用原则是,确保微基准测试至少运行10秒以上。使用 HotSpot的-XX:+PrintCompilation选项通过插入表示微基准测试执行阶段的工具可以帮助确认基准测试已经到达稳定态。这一步的日的是确保在开始采样之前,微基准测试经过充分预热,在采样阶段不会发生进一步的优化或逆优化事件。
5. 多次运行基准测试以确保观测的结果是可重复的。多次运行可以为你最终的结论提供有力支持。
6. 运行实验及观测结果时特别要留意得到的结果是否合理。如果碰到无法解释或可疑的结果,要花时间去研究、回顾实验的设计,确保观察的结果合理。
7. 通过传递随时变化的参数到关注的方法中、返回关注方法的执行结果、在采样周期之外打印输出计算结果使计算更有意义,避免在微基准测试中创建无效代码。
8. 留意内联可能对微基准测试产生的影响。如果对结果存疑,可以通过XX:+PrintInlining和-XX:+PrintCompilation命令行选项,利用HotSpot Debug VM观察HotSpot JIT编译器进行内联决策的过程。
9. 确保执行微基准测试时其他的应用程序不会对系统造成影响。执行微基准测试时即使向桌面窗口管理器中添加很小或者很简单的应用程序(譬如天气应用或者股票行情记录软件),都会对系统性能造成影响。
10. 当你需要很明确地了解JIT编译器生成了什么样的优化代码时,可以使用Oracle Solaris Studio Performance Analyzer或者HotSpot Debug VM(使用-XX:+PrintOptoAssembly选项)查看生成的汇编代码。
11. 采用小数据集或数据结构的微基准测试受缓存的影响很大。微基准测试的结果可能每次执行都不一样,在不同的机器上运行结果也差别很大。
12. 对于采用多线程的微基准测试需要意识到线程调度可能不是确定性的,特别是在负荷较重的情况下。

PDF书籍下载地址：
https://github.com/jiankunking/books-recommendation/tree/master/Java











