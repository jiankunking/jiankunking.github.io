---
title: JRockit权威指南深入理解JVM 笔记
categories:
  - Java
tags:
  - Java
  - GC
  - JVM
  - JRockit
  - 读书笔记
abbrlink: 62415
date: 2019-08-03 17:10:30
---
本文整理自：《JRockit权威指南深入理解JVM》 

作者：Marcus Hirt , Marcus Lagergren

出版时间：2018-12-10

<!-- more -->

# 起步
## 将应用程序迁移到JRockit
### 命令行选项

在<font color=DeepPink>**JRockit JVM中,主要有3类命令行选项,分别是系统属性、标准选项(以-X开头)和非标准选项(以-XX开头)。**</font>

1、系统属性

设置JVM启动参数的方式有多种。以-D开头的参数会作为系统属性使用,这些属性可以为Java类库(如RMI等)提供相关的配置信息。例如,在启动的时候,如果设置了-Dcom.Rockin.mc.debug=true参数,则JRockit Mission Control会打印出调试信息。不过,R28之后的JRockit JVM版本废弃了很多之前使用过的系统属性,转而采用非标准选项和类似 HotSpot中虚拟机标志(VM flag)的方式设置相关选项。

2、标准选项

以-X开头的选项是大部分JVM厂商都支持的通用设置。例如,用于设置堆大小最大值的选项-Xmx在包括 JRockit在内的大部分JVM中都是相同的。当然,也存在例外,如JRockit中的选项-Xverbose会打印出可选的子模块日志信息,而在 HotSpot中,类似的(但实际上有更多的限制)选项是-verbose。

3、非标准选项

以-XX开头的命令行选项是各个JVM厂商自己定制的。这些选项可能会在将来的某个版本中被废弃或修改。如果JVM的参数配置中包含了以-XX开头的命令行选项,则在将Java应用程序从一种JVM迁移到另一种时,应该在启动M之前去除这些非标准选项确定了新的VM选项后才可以启动Java应用程序。

# 自适应代码生成
## Java虚拟机
### 字节码格式
[Opcodes for the Java Virtual Machine](https://github.com/jiankunking/JVM-opcode)

#### 常量池

程序,包含数据和代码两部分,其中数据作为操作数使用。对于字节码程序来说,如果操作数非常小或者很常用(如常量0),则这些操作数是直接内嵌在字节码指令中的。

较大块的数据,例如常量字符串或比较大的数字,是存储在class文件开始部分的常量池(constant pool)中的。当使用这类数据作为操作数时,使用的是常量池中数据的索引位置,而不是实际数据本身。

此外,<font color=DeepPink>**Java程序中的方法、属性和类的元数据等也作为clas文件的组成部分,存储在常量池中。**</font>

## 自适应代码生成

### 优化动态程序
在汇编代码中,方法调用是通过call指令完成的。不同平台上call指令的具体形式不尽相同,不同类型的call指令,其具体格式也不尽相同。

<font color=DeepPink>**在面向对象的语言中,虚拟方法分派通常被编译为对分派表(dispatch table)中地址的间接调用(indirect call,即需要从内存中读取真正的调用地址)。这是因为,根据不同的类继承结构分派虚拟调用时可能会有多个接收者。每个类中都有一个分派表,其中包含了其虚拟调用的接收者信息。静态方法和确知只有一个接收者的虚拟方法可以被编译为对固定调用地址的直接调用(direct call)。一般来说,这可以大大加快执行速度。**</font>
![](/images/java-jrockit-note/直接调用虚拟调用.png)

假设应用程序是使用C++开发的,对代码生成器来说,在编译时已经可以获取到程序的所有结构性信息。例如,由于在程序运行过程中,代码不会发生变化,所以在编译时就可以从代码中判断出,某个虚拟方法是否只有一种实现。正因如此,编译器不仅不需要因为废弃代码而记录额外的信息,还可以将那些只有一种实现的虚拟方法转化为静态调用。

假如应用程序是使用Java开发的,起初某个虚拟方法可能只有一种实现,但Java允许在程序运行过程中修改方法实现。当JIT编译器需要编译某个虚拟方法时,更喜欢的是那些永远只存在一种实现的,这样编译器就可以像前面提到的C++编译器一样做很多优化,例如将虚拟调用转化为直接调用。但是,由于Java允许在程序运行期间修改代码,如果某个方法没有声明final修饰符,那它就有可能在运行期间被修改,即使它看起来几乎不可能有其他实现,编译器也不能将之优化为直接调用。

在Java世界中,有一些场景现在看起来一切正常,编译器可以大力优化代码,但是如果某天程序发生了改变的话,就需要将相关的优化全部撤销。对于Java来说,为了能够媲美C++程序的执行速度,就需要一些特殊的优化措施。

JVM使用的策略就是“赌”。JVM代码生成策略的假设条件是,正在运行的代码永远不变。事实上,大部分时间里确实如此。但如果正在运行的代码发生了变化,违反了代码优化的假设条件,就会触发其簿记系统(bookkeeping system)的回调功能。此时,基于原先假设条件生成的代码就需要被废弃掉,重新生成,例如为已经转化为直接调用的虚拟调用重新生成相关代码。因此,“赌输”的代价是很大的,但如果“赌赢”的概率非常高,则从中获得的性能提升就会非常大,值得一试。

一般来说,JVM和JIT编译器所做的典型假设包括以下几点：
* 虚拟方法不会被覆盖。由于某个虚拟方法只存在一种实现,就可以将之优化为一个直接调用。
* 浮点数的值永远不会是NaN。大部分情况下,可以使用硬件指令来替换对本地浮点数函数库的调用。
* 某些try语句块中几乎不会抛出异常。因此,可以将catch语句块中的代码作为冷方法对待。
* 对于大多数三角函数来说,硬件指令fsin都能够达到精度要求。如果真的达不到,就抛出异常,调用本地浮点数函数库完成计算。
* 锁竞争并不会太激烈,初期可以使用自旋锁(spinlock)替代。
* 锁可能会周期性地被同一个线程获取和释放,所以,可以将对锁的重复获取操作和重复释放操作直接省略掉。

## 深入JIT编译器

### 优化字节码

> 有些时候,对Java源代码做优化会适得其反。绝大部分写出可读性很差的代码的人都声称是为了优化性能,其实就是照着一些基准测试报告的结论写代码,而这些性能测试往往只涉及了字节码解释执行,没有经过JIT编译器优化,所以并不能代表应用程序在运行时的真实表现。例如,某个服务器端应用程序中包含了大量对数组元素的迭代访问操作,程序员参考了那些报告中的结论,没有设置循环条件,而是写一个无限for循环,置于try语句块中,并在catch语句块中捕获ArrayIndexOutOfBoundsException异常。这种糟糕的写法不仅使代码可读性极差,而且一旦运行时对之优化编译的话,其执行效率反而比普通循环方式低得多。原因在于,JVM的基本假设之一就是“异常是很少发生的”。基于这种假设,JVM会做一些相关优化,所以当真的发生异常时,处理成本就很高。

## 代码流水线
### 代码生成概述

> 在生成优化代码时,如何分配寄存器非常重要。编译器教材上都将寄存器分配问题作为图的着色问题处理,这是因为同时用到的两个变量不能共享同一个寄存器,从这点上讲,与着色问题相同。同时使用的多个变量可以用图中相连接的节点来表示,这样,寄存器分配问题就可以被抽象为“如何为图中的节点着色,才能使相连节点有不同的颜色”。这里可用颜色的数量等于指定平台上可用寄存器的数量。不过,遗憾的是,从计算复杂性上讲,着色问题是NP-hard的,也就是说现在还没有一个高效的算法(指可以在多项式时间内完成计算)能解决这个问题。但是,着色问题可以在线性对数时间内给出近似解,因此大多数编译器都使用着色算法的某个变种来处理寄存器分配问题。

# 自适应内存管理
## 堆管理基础
### 对象的分配与释放
<font color=DeepPink>**一般来说,为对象分配内存时,并不会直接在堆上划分内存,而是先在线程局部缓冲(thread local buffer)或其他类似的结构中找地方放置对象,然后随着应用程序的运行、新对象的不断分配,垃圾回收逐次执行,这些对象可能最终会被提升到堆中保存,也有可能会当作垃圾被释放掉。**</font>

为了能够在堆中给新创建的对象找一个合适的位置,内存管理系统必须知道堆中有哪些地方是空闲的,即还没有存活对象占用。内存管理系统使用空闲列表(free list)—串联起内存中可用内存块的链表,来管理内存中可用的空闲区域,并按照某个维度的优先级排序。

在空闲列表中搜索足够存储新对象的空闲块时,可以选择大小最适合的空闲块,也可以选择第一个放得下的空闲块。这其中会用到几种不同的算法去实现,各有优劣,后文会详细讨论。

## 垃圾回收算法
<font color=DeepPink>**在后文中,根集合(root set)专指上述搜索算法的初始输入集合,即开始执行引用跟踪时的存活对象集合。一般情况下,根集合中包括了因为执行垃圾回收而暂停的应用程序的当前栈帧中所有的对象,包含了可以从当前线程上下文的用户栈和寄存器中能得到的所有信息。此外,根集合中还包含全局数据,例如类的静态属性。简单来说就是,根集合中包含了所有无须跟踪引用就可以得到的对象。**</font>

Java使用的是准确式垃圾回收器(exact garbage collector),可以将对象指针类型数据和其他类型的数据区分开,只需要将元数据信息告知垃圾回收器即可,这些元数据信息,一般可以从Java方法的代码中得到。

近些年,使用信号来暂停线程的方式受到颇多争议。实践发现,在某些操作系统上,尤以Linux为例,应用程序对信号的使用和测试很不到位,还有一些第三方的本地库不遵守信号约定,导致信号冲突等事件的发生。因此,与信号相关的外部依赖已经不再可靠。

### 分代垃圾回收

事实上,将堆划分为两个或多个称为代(generation)的空间,并分别存放具有不同长度生命周期的对象,可以提升垃圾回收的执行效率。<font color=DeepPink>**在JRockit中,新创建(young)的对象存放在称为新生代(nursery)的空间中,一般来说,它的大小会比老年代(old collections)小很多,随着垃圾回收的重复执行,生命周期较长的对象会被提升(promote)到老年代中。**</font>因此,新生代垃圾回收和老年代垃圾回收两种不同的垃圾回收方式应运而生,分别用于对各自空间中的对象执行垃圾回收。

新生代垃圾回收的速度比老年代快几个数量级,即使新生代垃圾回收的频率更高,执行效率也仍然比老年代垃圾回收强,这是因为大多数对象的生命周期都很短,根本无须提升到老年代。理想情况下,新生代垃圾回收可以大大提升系统的吞吐量,并消除潜在的内存碎片。

#### 写屏障
在实现分代式垃圾回收时,大部分JVM都是用名为写屏障(write barrier)的技术来记录执行垃圾回收时需要遍历堆的哪些部分。当对象A指向对象B时,即对象B成为对象A的属性的值时,就会触发写屏障,在完成属性域赋值后执行一些辅助操作。

写屏障的传统实现方式是将堆划分成多个小的连续空间(例如每块512字节),每块空间称为卡片(card),于是,堆被映射为一个粗粒度的卡表(card table)。当Java应用程序将某个对象赋值给对象引用时,会通过写屏障设置脏标志位(dirty bit),将该对象所在的卡片标记为脏。

这样,遍历从老年代指向新生代的引用时间得以缩短,垃圾回收器在做新生代垃圾回收时只需要检查老年代中被标记为脏的卡片所对应的内存区域即可。

### JRockit中的垃圾回收
#### 老年代垃圾回收
JRockit不仅将卡表应用于分代式垃圾回收,还用在并发标记阶段结束时的清理工作,避免搜索整个存活对象图。这是因为JRockit需要找出在执行并发标记操作时,应用程序又创建了哪些对象。修改引用关系时通过写屏障可以更新卡表,存活对象图中的每个区域使用卡表中的一个卡片表示,卡片的状态可以是干净或者脏,有新对象创建或者对象引用关系修改了的卡片会被标记为脏。在并发标记阶段结束时,垃圾回收器只需要检查那些标记为脏的卡片所对应的堆中区域即可,这样就可以找到在并发标记期间新创建的和被更新过引用关系的对象。

## 性能与伸缩性
### 线程局部分配
<font color=DeepPink>**在JRockit中,使用了名为线程局部分配(thread local allocation)的技术来大幅加速对象的分配过程。正常情况下,在线程内的缓冲区中为对象分配内存要比直接在需要同步操作的堆上分配内存快得多。垃圾回收器在堆上直接分配内存时是需要对整个堆加锁的,对于多线程竞争激烈的应用程序来说,这将会是一场灾难。**</font>因此,如果每个Java线程能够有一块局部对象缓冲区那么绝大部分的对象分配操作只需要移动一下指针即可完成,在大多数硬件平台上,只需要一条汇编指令就行了。这块转为分配对象而保留的区域,就称为线程局部缓冲区(thread local area,TLA)。

为了更好地利用缓存,达到更高的性能,一般情况下,TLA的大小介于16KB到128KB之间,当然,也可以通过命令行参数显式指定。<font color=DeepPink>**当TLA被填满时,垃圾回收器会将TLA中的内容提升到堆中。因此,可以将TLA看作是线程中的新生代内存空间**</font>。

当Java源代码中有new操作符,并且JIT编译器对内存分配执行高级优化之后,内存分配的伪代码如下所示：
```
object allocateNewobject(Class objectclass){
	Thread current getcurrentThread():
	int objectSize=alignedSize(objectclass)
	if(current.nextTLAOffset+objectSize> TLA_SIZE){
		current.promoteTLAToHeap();//慢,而且是同步操作
		current.nextTLAOffset=0;
	}
	Object ptr= current.TLAStart+current.nextTLAOffset:
	current.nextTLAOffset + objectSize;
	return ptr:	
}
```
>为了说明内存分配问題,在上面的伪代码中省略了很多其他关联操作。例如如果待分配的对象非常大,超过了某个阈值,或对象太大导致无法存放在TLA中,则会直接在堆中为对象分配内存。

### NUMA架构

NUMA(non-uniform memory access,非统一内存访问模型)架构的出现为垃圾回收带来了更多挑战。<font color=DeepPink>**在NUMA架构下,不同的处理器核心通常访问各自的内存地址空间,这是为了避免因多个CPU核心访问同一内存地址造成的总线延迟。**</font>每个CPU核心都配有专用的内存和总线，因此CPU核心在访问其专有内存时速度很快,而要访问相邻CPU核心的内存时就会相对慢些,CPU核心相距越远,访问速度越慢(也依赖于具体配置)传统上,多核CPU是按照UMA(uniform memory access,统一内存访问模型)架构运行的,所有的CPU核心按照统一的模式无差别地访问所有内存。

为了更好地利用NUMA架构,垃圾回收器线程的组织结构应该做相应的调整。如果某个CPU核心正在运行标记线程,那么该线程所要访问的那部分堆内存最好能够放置在该CPU的专有内存中,这样才能发挥NUMA架构的最大威力。在最坏情况下,如果标记线程所要访问的对象位于其他NUMA节点的专有内存中,这时垃圾回收器通常需要一个启发式对象移动算法。这是为了保证使用时间上相近的对象在存储位置上也能相近,如果这个算法能够正确工作,还是可以带来不小的性能提升的。这里所面临的主要问题是如何避免对象在不同NUMA节点的专有内存中重复移动。理论上,自适应运行时系统应该可以很好地处理这个问题。

### 大内存页
内存分配是通过操作系统及其所使用的页表完成的。操作系统将物理内存划分成多个页来管理,从操作系统层面讲,页是实际分配内存的最小单位。传统上,页的大小是以4KB为基本单位划分的,页操作对进程来说是透明的,进程所使用的是虚拟地址空间,并非真正的物理地址。为了便于将虚拟页面转换为实际的物理内存地址,可使用名为旁路转换缓冲(translation lookaside buffer,TLB)的缓存来加速地址的转换操作。从实现上看,如果页面的容量非常小的话,会导致频繁出现旁路转换缓冲丢失的情况。

修复这个问题的一种方法就是将页面的容量调大几个数量级,例如以MB为基本单位。现代操作系统普遍倾向于支持这种大内存页机制。

很明显,当多个进程分别在各自的寻址空间中分配内存,而页面的容量又比较大时,随着使用的页面数量越来越多,碎片化的问题就愈发严重,像进程要分配的内存比页面容量稍微大一点的情况,就会浪费很多存储空间。对于在进程内自己管理内存分配回收、并有大量内存空间可用的运行时来说,这不算什么问题,因为运行时可以通过抽象出不同大小的虚拟页面来解决。

> 通常情况下,对于那些内存分配和回收频繁的应用程序来说,使用大内存页可以使系统的整体性能至少提升10%。 JRockit对大内存页有很好的支持。

## 近实时垃圾回收
### JRockit Real Time
<font color=DeepPink>**低延迟的代价是垃圾回收整体时间的延长**</font>。相比于并行垃圾回收,在程序运行的同时并发垃圾回收的难度更大,而频繁中断垃圾回收则可能带来更多的麻烦。事实上,这并非什么大问题,因为大多数使用JRockit Real Time的<font color=DeepPink>**用户更关心系统的可预测性,而不是减少垃圾回收的总体时间。大多数用户认为暂停时间的突然增长比垃圾回收总体时间的延长更具危害性**</font>。

#### 软实时的有效性
软实时是JRockit Real Time的核心机制。但<font color=DeepPink>**非确定性系统如何提供指定程度的确定性,例如像垃圾回收器这样的系统如何保证应用程序的暂停时间不会超过某个阈值?严格来说,无法提供这样的保证**</font>,但由于这样的极端案例很少,所以也就无关紧要了。

当然,没有什么万全之策,确实存在无法保证暂停时间的场景。但实践证明,对于那些堆中存活对象约占30%-50%的应用程序来说, JRockit Real Time的表现可以满足服务需要,而且随着JRockit Real Time各个版本的发行,30%-50%这个阈值在不断提升,可支持的暂停时间阈值则不断降低。

#### 工作原理
* 高效的并行执行
* 细分垃圾回收过程,将之变成几个可回滚、可中断的子任务(work packet)
* 高效的启发式算法

<font color=DeepPink>**事实上,实现低延迟的关键仍是尽可能多让Java应用程序运行,保持堆的使用率和碎片化程度在一个较低的水平**</font>。在这一点上, JRockit Real Time使用的是贪心策略,即尽可能推迟STW式的垃圾回收操作,希望问题能够由应用程序自身解决,或者能够减少不得不执行STW式操作的情况,最好在具体执行的时候需要处理的对象也尽可能少一些。

JRockit Real Time中,垃圾回收器的工作被划分为几个子任务。如果在执行其中某个子任务时(例如整理堆中的某一部分内存),应用程序的暂停时间超过了阈值,那么就放弃该子任务恢复应用程序的执行。用户根据业务需要指定可用于完成垃圾回收的总体时间,有些时候,某些子任务已经完成,但没有足够的时间完成整个垃圾回收工作,这时为了保证应用程序的运行,不得不废弃还未完成的子任务,待到下次垃圾回收的时候再重新执行,指定的响应时间越短,则废弃的子任务可能越多。

前面介绍过的标记阶段的工作比较容易调整,可以与应用程序并发执行。但清理和整理阶段则需要暂停应用程序线程(STW)。幸运的是,标记阶段会占到垃圾回收总体时间的90%。如果暂停应用程序的时间过长,则不得不终止当前垃圾回收任务,重新并发执行,期望问题可以自动解决。之所以将垃圾回收划分为几个子任务就是为了便于这一目标的实现。

## 内存操作相关API
### 析构方法
> Java中的析构函数的设计就是一个失误,应避免使用。

这不仅仅是我们的意见,也是Java社区的一致意见。

### JVM的行为差异
对于JVM来说,一定谨记,编程语言只能提醒垃圾回收器工作。就Java而言,在设计上它本身并不能精确控制内存系统。例如,假设两个JVM厂商所实现软引用在缓存中具有相同的存活时间,这本就是不切实际的。

另外一个问题就是大量用户对System.gc()方法的错误使用。<font color=DeepPink>**System.gc()方法仅仅是提醒运行时“现在可以做垃圾回收了”。在某些JVM实现中,频繁调用该方法导致了频繁的垃圾回收操作,而在某些JVM实现中,大部分时间忽略了该调用。**</font>

我过去任职为性能顾问期间,多次看到该方法被滥用。很多时候,只是去掉对 System.gc方法的几次调用就可以大幅提升性能,这也是 JRock中会有命令行参数-xx:AllowSystemGC=False来禁用System,gc方法的原因。

## 陷阱与伪优化

部分开发人员在写代码时,有时会写一些“经过优化的”的代码,期望可以帮助完成垃圾回收的工作,但实际上,这只是他们的错觉。记住,过早优化是万恶之源。就Java来说,很难在语言层面控制垃圾回收的行为。这里的主要问题时,开发人员误以为垃圾回收器有固定的运行模式,并妄图去控制它。

除了垃圾回收外,对象池(object poll)也是Java中常见的伪优化(false optimization)。有人认为,保留一个存活对象池来重新使用已创建的对象可以提升垃圾回收的性能,但实际上,对象池不仅增加了应用程序的复杂度,还很容易出错。对于现代垃圾收集器来说,使用java.lang.ref.Reference系列类实现缓存,或者直接将无用对象的引用置为null就好了,不用多操心。

事实上,基于现代VM,如果能够合理利用书本上的技巧,例如正确使用java.lang.ref.Reference系列类,注意Java的动态特性,完全可以写出运行良好的应用程序。<font color=DeepPink>**如果应用程序真的有实时性要求,那么一开始就不该用Java编写,而应该使用那些由程序员手动控制内存的静态编程语言来实现应用程序。**</font>

## JRockit中的内存管理
<font color=DeepPink>**需要注意的是,花大力气鼓捣JVM参数并不一定会使应用程序性能有多么大的提升,而且反而可能会干扰JVM的正常运行。**</font>

# 线程与同步
## 基本概念
每个对象都持有与同步操作相关的信息,例如当前对象是否作为锁使用,以及锁的具体实现等。一般情况下,为了便于快速访问,这些信息被保存在每个对象的对象头的锁字(lock word)中。JRockit使用锁字中的一些位来存储垃圾回收状态信息,虽然其中包含了垃圾回收信息,但是本书还是称之为锁字。

对象头还包含了指向类型信息的指针,在 JRockit中,这称为类块(class block)下图是 JRockit中Java对象在不同的CPU平台上的内存布局。为了节省内存,并加速解引用操作,对象头中所有字的长度是32位。类块是一个32位的指针,指向另一个外部结构,该结构包含了当前对象的类型信息和虚分派表(virtual dispatch table)等信息。

![](/images/java-jrockit-note/对象头布局.png)
就目前来看,在绝大部分JVM(包括JRockit)中,对象头是使用两个32位长的字来表示的。在JRockit中,偏移为0的对象指针指向当前对象的类型信息,接下来是4字节的锁字。在SPARC平台上,对象头的布局刚好反过来,因为在使用原子指令操作指针时,如果没有偏移的话,效率会更高。与锁字不同,类块并不为原子操作所使用,因此在SPARC平台上,类块被放在锁字后面。

> 原子操作(atomic operation)是指全部执行或全部不执行的本地指令。当原子指令全部执行时,其操作结果需要对所有潜在访问者可见。

<font color=DeepPink>**原子操作用于读写锁字,具有排他性,这是实现JVM中同步块的基础。**</font>

### 难以调试
> 死锁是指两个线程都在等待对方释放自己所需的资源,结果导致两个线程都进入休眠状态。很明显,它们再也醒不过来了。活锁的概念与死锁类似,区别在于线程在竟争时会采取主动操作,但无法获取锁。这就像两个人面对面前进,在一个很窄的走廊相遇,为了能继续前进,他们都向侧面移动,但由于移动的方向相反导致还是无法前进。

## Java API
### synchronized关键字
在Java中,关键字synchronized用于定义一个临界区,既可以是一段代码块,也可以是个完整的方法,如下所示:
```
public synchronized void setGadget(Gadget g){
	this.gadget = g;
}
```
上面的方法定义中包含synchronized关键字,因此每次只能有一个线程修改给定对象的gadget域。

<font color=DeepPink>**在同步方法中,监视器对象是隐式的,即当前对象this,而对静态同步方法来说,监视器对象是当前对象的类对象。**</font>上面的示例代码与下面的代码是等效的：
```
public void setGadget(Gadget g){
	synchronized(this){
		this.gadget = g;
	}
}
```
### java.lang.Thread类
Java中的线程也有优先级概念,但是否真的起作用取决于JVM的具体实现。setPriority方法用于设置线程的优先级,提示JVM该线程更加重要或不怎么重要。当然,对于大多数JVM来说,显式地修改线程优先级没什么大帮助。当运行时“有更好的方案”时, JRockit JVM甚至会忽略Java线程的优先级。

正在运行的线程可以通过调用yield方法主动放弃剩余的时间片,以便其他线程运行,自身休眠(调用wait方法)或等待其他线程结束再运行(调用join方法)。

### volatile 关键字
在多线程环境下,对某个属性域或内存地址进行写操作后,其他正在运行的线程未必能立即看到这个结果。在某些场景中,要求所有线程在执行时需要得知某个属性最新的值,为此,Java提供了关键字volatile来解决此问题。

<font color=DeepPink>**使用volatile修饰属性后,可以保证对该属性域的写操作会直接作用到内存中。原本,数据操作仅仅将数据写到CPU缓存中,过一会再写到内存中,正因如此,在同一个属性域上,不同的线程可能看到不同的值。目前,JVM在实现volatile关键字时,是通过在写属性操作后插入内存屏障代码来实现的,只不过这种方法有一点性能损耗。**</font>

人们常常难以理解“为什么不同的线程会在同一个属性域上看到不同的值”。<font color=DeepPink>**一般来说,目前的机器的内存模型已经足够强,或者应用程序的本身结构就不容易使非volatile属性出现这个问题。但是,考虑到JIT优化编译器可能会对程序做较大改动,如果开发人员不留心的话,还是会出现问题的。**</font>下面的示例代码解释了在Java程序中,为什么内存语义如此重要,尤其是当问题还没表现出来的时候。
```
public class My Thread extends Thread{
	private volatile boolean finished;
	public void run(){
		while(!finished){
   			//
		}
	}
	public void signalDone(){
		this.finished = true
	}
}
```
如果定义变量finished时没有加上volatile关键字,那么在理论上,JIT编译器在优化时,可能会将之修改为只在循环开始前加载一次finished的值,但这就改变了代码原本的含义如果finished的值是false,那么程序就会陷入无限循环,即使其他线程调用了signalDone方法也没用。<font color=DeepPink>**Java语言规范指明,如果编译器认为合适的话,可以为非 volatile变量在线程内创建副本以便后续使用。**</font>

> 由于一般会使用内存屏障来实现volatile关键字的语义,会导致CPU缓存失效,降低应用程序整体性能,使用的时候要谨慎。

## Java中线程与同步机制的实现
### Java内存模型
现在CPU架构中,普遍使用了数据缓存机制以大幅提升CPU对数据的读写速度,减轻处理器总线的竞争程度。正如所有的缓存系统一样,这里也存在一致性问题,对于多处理器系统来说尤其重要,因为多个处理器有可能同时访问内存中同一位置的数据内存模型定义了不同的CPU,在同时访问内存中同一位置时,是否会看到相同的值的情况。

强内存模型(例如x86平台)是指,当某个CPU修改了某个内存位置的值后,其他的CPU几乎自动就可以看到这个刚刚保存的值。在这种内存模型之下,内存写操作的执行顺序与代码中的排列顺序相同。弱内存模型(例如IA-64平台)是指,当某个CPU修改了某个内存位置的值后其他的CPU不一定可以看到这个刚刚保存的值(除非CPU在执行写操作时附有特殊的内存屏障类指令),更普遍的说,所有由Java程序引起的内存访问都应该对其他所有CPU可见,但事实上却不能保证立即可见。

### 同步的实现

#### 原生机制

从计算机最底层CPU结构来说,同步是使用原子指令实现的,各个平台的具体实现可能有所不同。以x86平台为例,它使用了专门的锁前缀(lock prefix)来实现多处理器环境中指令的原子性。

在大多数CPU架构中,标准指令(例如加法和减法指令)都可以实现为原子指令。

在微架构( micro- architecture)层面,原子指令的执行方式在各个平台上不尽相同。一般情况下,它会暂停CPU流水线的指令分派,直到所有已有的指令都完成执行,并将操作结果刷入到内存中。此外,该CPU还会阻止其他CPU对相关缓存行的访问,直到该原子指令结束执行。在现代x86硬件平台上,如果屏障指令(fence instruction)中断了比较复杂的指令执行,则该原子指令可能需要等上很多个时钟周期才能完成执行。<font color=DeepPink>**因此,不仅是过多的临界区会影响系统性能锁的具体实现也会影响性能,当频繁对较小的临界区执行加锁、解锁操作时,性能损耗更是巨大。**</font>

### 同步在字节码中的实现

Java字节码中有两条用于实现同步的指令,分别是monitorenter和monitorexit,它们都会从执行栈中弹出一个对象作为其操作数。使用javac编译源代码时,若遇到显式使用监视器对象的同步代码,则为之生成相应的monitorenter指令和monitorexit指令。

## 对于线程与同步的优化

### 锁膨胀与锁收缩
>默认情况下, JRockit使用一个小的自旋锁来实现刚膨胀的胖锁,只持续很短的时间。乍看之下,这不太符合常理,但这么做确实是很有益处的。如果锁的竟争确实非常激烈,而导致线程长时间自旋的话,可以使用命令行参数-XX:UseFatSpin=false禁用此方式。作为胖锁的一部分,自旋锁也可以利用自适应运行时获取到的反馈信息,这部分功能默认是禁用的,可以使用命令行参数-XX:UseAdaptiveFatSpin=true来开启。

### 延迟解锁
如何分析很多线程局部的解锁,以及重新加锁的操作只会降低程序执行效率?这是否是程序运行的常态?运行时是否可以假设每个单独的解锁操作实际上都是不必要的?

如果某个锁每次被释放后又立刻都被同一个线程获取,则运行时可以做上述假设。但只要有另外某个线程试图获取这个看起来像是未被加锁的监视器对象(这种情况是符合语义的),这种假设就不再成立了。这时为了使这个监视器对象看起来像是一切正常,原本持有该监视器对象的线程需要强行释放该锁。这种实现方式称为延迟解锁,在某些描述中也称为偏向锁(biased locking)。

即使某个锁完全没有竞争,执行加锁和解锁操作的开销仍旧比什么都不做要大。而使用原子指令会使该指令周围的Java代码都产生额外的执行开销。

从以上可以看出,假设大部分锁都只在线程局部起作用而不会出现竞争情况,是有道理的。在这种情况下,使用延迟解锁的优化方式可以提升系统性能。当然,天下没有免费的午餐,如果某个线程试图获取某个已经延迟解锁优化的监视器对象,这时的执行开销会被直接获取普通监视器对象大得多,因为这个看似未加锁的监视器对象必须要先被强行释放掉因此,不能一直假设解锁操作是不必要的,需要对不同的运行时行为做针对性的优化。

1.实现

实现延迟解锁的语义其实很简单。

实现 monitorenter指令。
* <font color=DeepPink>**如果对象是未锁定的,则加锁成功的线程将继续持有该锁,并标记该对象为延迟加锁的。**</font>
* <font color=DeepPink>**如果对象已经被标记为延迟加锁的**</font>：
	* <font color=DeepPink>**如果对象是被同一个线程加锁的,则什么也不做(大体上是一个递归锁)**</font>
	* <font color=DeepPink>**如果对象是被另一个线程加锁的,则暂停该线程对锁的持有状态,检查该对象真实的加锁状态,即是已加锁的还是未加锁的,这一步操作代价高昂,需要遍历调用栈。如果对象是已加锁的,则将该锁转换为瘦锁,否则强制释放该锁,以便可以被新线程获取到。**</font>

实现monitorexit指令:如果是延迟加锁的对象,则什么也不做,保留其已加锁状态,即执行延迟解锁。

为了能解除线程对锁的持有状态,必须要先暂停该线程的执行,这个操作有不小的开销。在释放锁之后,锁的实际状态会通过检查线程栈中的锁符号来确定。延迟解锁使用自己的锁符号,以表示“该对象是被延迟锁定的”。

如果延迟锁定的对象从来也没有被撤销过,即所有的锁都只在线程局部内发挥作用,那么使用延迟锁定就可以大幅提升系统性能。但在实际应用中,如果我们的假设不成立,运行时就不得不一遍又一遍地释放已经被延迟加锁的对象,这种性能消耗实在承受不起。因此,运行时需要记录下监视器对象被不同线程获取到的次数,这部分信息存储在监视器对象的锁字中,称为转移位(transfer bit)。

如果监视器对象在不同的线程之间转移的次数过多,那么该对象、其类对象或者其类的所有实例都可能会被禁用延迟加锁,只会使用标准的胖锁和瘦锁来处理加锁或解锁操作。

正如之前介绍过的,对象首先是未加锁状态的,然后线程T1执行monitorenter指令,使之进入延迟加锁状态。但<font color=DeepPink>**如果线程T1在该对象上执行了monitorexit指令,这时系统会假装已经解锁了,但实际上仍是锁定状态,锁对象的锁字中仍记录着线程T1的线程ID**</font>。在此之后线程T1如果再执行加锁操作,就不用再执行相关操作了。

<font color=DeepPink>**如果另一个线程T2试图获取同一个锁,则之前所做“该锁绝大部分被线T1程使用”的假设不再成立,会受到性能惩罚,将锁字中的线程ID由线程T1的ID替换为线程T2的**</font>。如果这情况经常出现,那么可能会禁用该对象作为延迟锁,并将该对象作为普通的瘦锁使用。

## 陷阱与伪优化
### Thread.stop、Thread.resume和Thread.suspend

永远不要使用Thread.stop方法、Thread.resume方法或Thread.suspend方法并小心处理使用这些方法的历史遗留代码。

普遍建议使用wait方法、notify方法或volatile变量来做线程间的同步处理。

### 双检查锁
如果对内存模型和CPU架构缺乏理解的话,即使使用平遇到问题。以下面的代码为例,其目的是实现单例模式。
```
public class Gadget Holder{
	private Gadget theGadget;	
	public synchronized Gadget cetGadget(){
		if (this.theGadget == null){
			this.theGadget = new Gadget();
		}
		return this.theGadget;
	}
}

```
上面的代码是线程安全的,因为getGadget方法是同步但当Gadget类的构造函数已经执行过一次之后,再执行同优化性能,将之改造为下面的代码。
```
public Gadget getGadget(){
	if (this.theGadget == null){
		synchronized(this){
			if(this.theGadget == null)){
				this.theGadget = new Gadget();
			}
		}
	}
	return this.theGadget;
}
```
上面的代码使用了一个看起来很“聪明”的技巧,如果行同步操作,而是直接返回已有的对象;如果对象还未创建值。这样可以保证“线程安全”。

上述代码就是所谓的双检查锁(double checked locking),下面分析一下这段代码的问题。<font color=DeepPink>**假设某个线程经过内层的空值检查,开始初始化theGadget字段的值,该线程需要为新对象分配内存,并对theGadget字段赋值。可是,这一系列操作并不是原子的,且执行顺序无法保证。如果在此时正好发生线程上下文切换,则另一个线程看到的theGadget字段的值可能是未经完整初始化的,有可能会导致外层的控制检查失效,并返回这个未经完整初始化的对象。不仅仅是创建对象可能会出问题,处理其他类型数据时也要小心。例如,在32位平台上,写入一个long型数据通常需要执行两次32位数据的写操作,而写入int数据则无此顾虑。**</font>

上述问题可以通过将 theGadget字段声明为 volatile来解决(注意,只在新版本的内存模型下才有效),增加的执行开销尽管比使用synchronized方法的小,但还是有的。如果不确定当前版本的内存模型是否实现正确,不要使用双检查锁。网上有很多文章介绍了为什么不应该使用双检查锁,不仅限于Java,其他语言也是。

<font color=DeepPink>**双检查锁的危险之处在于,在强内存模型下,它很少会使程序崩溃。Intel IA-64平台就是个典型示例,其弱内存模型臭名远扬,原本好好运行的Java应用程序却出现故障。如果某个应用程序在x86平台运行良好,在x64平台却出问题,人们很容易怀疑是JVM的bug,却忽视了有可能是Java应用程序自身的问题。**</font>

使用静态属性来实现单例模式可以实现同样的语义,而无须使用双检查锁,如下所示:
```
public class GadgetMaker{
	public static Gadget theGadget= new Gadget();
}
```
<font color=DeepPink>**Java语言保证类的初始化是原子操作, GadgetMaker类中没有其他的域,因此,在首次主动使用该类时会自动创建 Gadget类的实例。并赋值给theGadget字段。这种方法在新旧两种内存模型下均可正常工作。**</font>

总之,使用Java做并行程序开发有很多需要小心的地方,如果能够正确理解Java内存模型那么是可以避开这些陷阱的。开发人员往往不太关心当前的硬件架构,但如果不能理解Java内存模型,迟早会搬起石头砸自己的脚。

# 基准测试与性能调优
## wait方法、notify方法与胖锁
### Java并非万能的
Java是一门强大的通用编程语言,因其友好的语义和内建的内的开发进度,但Java不是万能的,这里来谈谈不宜使用Java解决的场景：
* 要开发一个有近实时性要求的电信应用程序,并且其中会有其中会有成千上万的线程并发执行。
* 应用程序的数据库层所返回的数据经常是20MB的字节数组。
* 应用程序性能和行为的确定性,完全依赖于底层操作系统的调度器，即使调度器有微小变化也会对应用程序性能产生较大影响。
* 开发设备驱动程序。
* 使用 C/Fortran/COBOL等语言开发的历史遗留代码太多,目前团队手中还没有好用的工具可以将这些代码转换为Java代码。

除了上面的示例外,还有其他很多场景不适宜使用Java。通过JVM对底层操作系统的抽象Java实现了“一次编写,到处运行”,也因此受到了广泛关注。但夸大一点说,ANSI C也能做到这一点,只不过在编写源代码时,要花很多精力来应对可移植性问题。因此要结合实际场景选择合适的工具。Java是好用,但也不要滥用。


PDF书籍下载地址：
https://github.com/jiankunking/books-recommendation/tree/master/Java
















































