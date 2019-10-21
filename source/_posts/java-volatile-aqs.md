---
title: Java Volatile的内存语义与AQS锁内存可见性
categories:
  - JUC
tags:
  - JUC
  - AQS
  - JDK
  - Java
  - Volatile
  - 原创
abbrlink: 49298
date: 2018-05-23 19:51:35
---

提到volatile首先想到就是：

* 保证此变量对所有线程的可见性，这里的 “可见性”是指当一条线程修改了这个变量的值，新值对于其他线程来说是可以立即得知的。
* 禁止指令重排序优化。

到这里大家感觉自己对volatile理解了吗？ 

如果理解了，大家考虑这么一个问题：ReentrantLock（或者其它基于AQS实现的锁）是如何保证代码段中变量（变量主要是指共享变量，存在竞争问题的变量）的可见性？
```
private static ReentrantLock reentrantLock = new ReentrantLock();
private static intcount = 0;
//...
// 多线程 run 如下代码
reentrantLock.lock();
try
{
    count++;
} 
finally
{
    reentrantLock.unlock();
}
//...
```
既然提到了可见性，那就先熟悉几个概念：
# 1、JMM
JMM：Java Memory Model 即 Java 内存模型

>The Java Memory Model describes what behaviors are legal in multithreaded code, and how threads may interact through memory.

>It describes the relationship between variables in a program and the low-level details of storing and retrieving them to and from memory or registers in a real computer system.

>It does this in a way that can be implemented correctly using a wide variety of hardware and a wide variety of compiler optimizations.

<font color=DeepPink>**Java内存模型的主要目标是定义程序中各个变量的访问规则，即在虚拟机中将变量存储到内存和从内存中取出变量这样的底层细节。**</font>此处的变量主要是指共享变量，存在竞争问题的变量。Java内存模型规定所有的变量都存储在主内存中，而每条线程还有自己的工作内存，线程的工作内存中保存了该线程使用到的变量的主内存副本拷贝，线程对变量的所有操作（读取、赋值等）都必须在工作内存中进行，而不能直接读写主内存中的变量（<font color=DeepPink>**根据Java虚拟机规范的规定，volatile变量依然有共享内存的拷贝，但是由于它特殊的操作顺序性规定——从工作内存中读写数据前，必须先将主内存中的数据同步到工作内存中，所有看起来如同直接在主内存中读写访问一般，因此这里的描述对于volatile也不例外**</font>）。不同线程之间也无法直接访问对方工作内存中的变量，线程间变量值得传递均需要通过主内存来完成。
# 2、重排序
在执行程序时，为了提高性能，编译器和处理器常常会对指令做重排序。重排序分3种类型：
* 编译器优化的重排序。编译器在不改变单线程程序语义的前提下，可以重新安排语句的执行顺序。
* 指令级并行的重排序。现代处理器采用了指令级并行技术（Instruction-Level Parallelism，ILP）来将多条指令重叠执行。如果不存在数据依赖性，处理器可以改变语句对应机器指令的执行顺序。
* 内存系统的重排序。由于处理器使用缓存和读/写缓冲区，这使得加载和存储操作看上去可能是在乱序执行。

从Java源代码到最终实际执行的指令序列，会分别经历下面3种重排序：

![](/images/java-aqs-voliate/重排序.png)

对于编译器，JMM的编译器重排序规则会禁止特定类型的编译器重排序（不是所有的编译器重排序都要禁止）。对于处理器重排序，JMM的处理器重排序规则会要求Java编译器在生成指令序列时，插入特定类型的内存屏障（Memory Barriers，Intel称之为Memory Fence）指令，通过内存屏障指令来禁止特定类型的处理器重排序。 

JMM属于语言级的内存模型，它确保在不同的编译器和不同的处理器平台之上，通过禁止特定类型的编译器重排序和处理器重排序，为程序员提供一致的内存可见性保证。

# 3、happens-before

* 程序顺序规则：一个线程中的每个操作，happens-before于该线程中的任意后续操作。
* 监视器锁规则：对一个锁的解锁，happens-before于随后对这个锁的加锁。
* volatile变量规则：对一个volatile域的写，happens-before于任意后续对这个volatile域的读。（对一个volatile变量的读，总是能看到【任意线程】对这个volatile变量最后的写入）
* 传递性：如果A happens-before B，且B happens-before C，那么A happens-before C。

>两个操作之间具有happens-before关系，并不意味着前一个操作必须要在后一个操作之前执行！happens-before仅仅要求前一个操作（执行的结果）对后一个操作可见，且前一个操作按顺序排在第二个操作之前（the first is visible to and ordered before the second）。

# 4、内存屏障

* 硬件层的内存屏障分为两种：Load Barrier 和 Store Barrier即读屏障和写屏障。
* <font color=DeepPink>**对于Load Barrier来说，在指令前插入Load Barrier，可以让高速缓存中的数据失效，强制从新从主内存加载数据；**</font>
* <font color=DeepPink>**对于Store Barrier来说，在指令后插入Store Barrier，能让写入缓存中的最新数据更新写入主内存，让其他线程可见。**</font>
* 内存屏障有两个作用：
    * 阻止屏障两侧的指令重排序；
    * 强制把写缓冲区/高速缓存中的数据等写回主内存，让缓存中相应的数据失效。
# 5、volatile的内存语义

从JSR-133开始（即从JDK5开始），volatile变量的写-读可以实现线程之间的通信。

<font color=DeepPink>**从内存语义的角度来说，volatile的写-读与锁的释放-获取有相同的内存效果**</font>：
* volatile写和锁的释放有相同的内存语义；
* volatile读与锁的获取有相同的内存语义。

>volatile仅仅保证对单个volatile变量的读/写具有原子性，而锁的互斥执行的特性可以确保对整个临界区代码的执行具有原子性。在功能上，锁比volatile更强大；在可伸缩性和执行性能上，volatile更有优势。

volatile变量自身具有下列特性：
* 可见性。对一个volatile变量的读，总是能看到（任意线程）对这个volatile变量最后的写入。
* 原子性：对任意单个volatile变量的读/写具有原子性，即使是64位的long型和double型变量，只要它是volatile变量，对该变量的读/写就具有原子性。如果是多个volatile操作或类似于volatile++这种复合操作，这些操作整体上不具有原子性。

volatile写和volatile读的内存语义：
* <font color=DeepPink>**线程A写一个volatile变量，实质上是线程A向接下来将要读这个volatile变量的某个线程发出了（其对共享变量所做修改的）消息。**</font>
* <font color=DeepPink>**线程B读一个volatile变量，实质上是线程B接收了之前某个线程发出的（在写这个volatile变量之前对共享变量所做修改的）消息。**</font>
* <font color=DeepPink>**线程A写一个volatile变量，随后线程B读这个volatile变量，这个过程实质上是线程A通过主内存向线程B发送消息。**</font>

JMM针对编译器制定的volatile重排序规则表

![](/images/java-aqs-voliate/JMM针对编译器制定的volatile重排序规则表.png)

* <font color=DeepPink>**当第二个操作是volatile写时，不管第一个操作是什么，都不能重排序。这个规则确保volatile写之前的操作不会被编译器重排序到volatile写之后。**</font>
* <font color=DeepPink>**当第一个操作是volatile读时，不管第二个操作是什么，都不能重排序。这个规则确保volatile读之后的操作不会被编译器重排序到volatile读之前。**</font>
* <font color=DeepPink>**当第一个操作是volatile写，第二个操作是volatile读时，不能重排序。**</font>

为了实现volatile的内存语义，编译器在生成字节码时，会在指令序列中插入内存屏障来禁止特定类型的处理器重排序。**对于编译器来说，发现一个最优布置来最小化插入屏障几乎是不可能的。为此，JMM采取保守策略。下面是基于保守策略的JMM内存屏障插入策略。**
* 在每个volatile写操作的前面插入一个StoreStore屏障。
* 在每个volatile写操作的后面插入一个StoreLoad屏障。
* 在每个volatile读操作的后面插入一个LoadLoad屏障。
* 在每个volatile读操作的后面插入一个LoadStore屏障。

>LoadLoad屏障：对于这样的语句Load1; LoadLoad; Load2，在Load2及后续读取操作要读取的数据被访问前，保证Load1要读取的数据被读取完毕。

>StoreStore屏障：对于这样的语句Store1; StoreStore; Store2，在Store2及后续写入操作执行前，保证Store1的写入操作对其它处理器可见。  LoadStore屏障：对于这样的语句Load1; LoadStore; Store2，在Store2及后续写入操作被刷出前，保证Load1要读取的数据被读取完毕。

>StoreLoad屏障：对于这样的语句Store1; StoreLoad; Load2，在Load2及后续所有读取操作执行前，保证Store1的写入对所有处理器可见。它的开销是四种屏障中最大的。在大多数处理器的实现中，这个屏障是个万能屏障，兼具其它三种内存屏障的功能。
上述内存屏障插入策略非常保守，但它可以保证在任意处理器平台，任意的程序中都能得到正确的volatile内存语义。

下面是保守策略下，volatile写插入内存屏障后生成的指令序列示意图. 

![](/images/java-aqs-voliate/volatile写插入内存屏障后生成的指令序列示意图.png)

图中的StoreStore屏障可以保证在volatile写之前，其前面的所有普通写操作已经对任意处理器可见了。这是因为**StoreStore屏障将保障上面所有的普通写在volatile写之前刷新到主内存。**

这里比较有意思的是，volatile写后面的StoreLoad屏障。此屏障的作用是避免volatile写与后面可能有的volatile读/写操作重排序。因为编译器常常无法准确判断在一个volatile写的后面是否需要插入一个StoreLoad屏障（比如，一个volatile写之后方法立即return）。为了保证能正确实现volatile的内存语义，JMM在采取了保守策略：在每个volatile写的后面，或者在每个volatile读的前面插入一个StoreLoad屏障。从整体执行效率的角度考虑，JMM最终选择了在每个volatile写的后面插入一个StoreLoad屏障。因为volatile写-读内存语义的常见使用模式是：一个写线程写volatile变量，多个读线程读同一个volatile变量。当读线程的数量大大超过写线程时，选择在volatile写之后插入StoreLoad屏障将带来可观的执行效率的提升。从这里可以看到JMM在实现上的一个特点：首先确保正确性，然后再去追求执行效率。

下面是在保守策略下，volatile读插入内存屏障后生成的指令序列示意图: 
![](/images/java-aqs-voliate/volatile读插入内存屏障后生成的指令序列示意图.png)
图中的LoadLoad屏障用来禁止处理器把上面的volatile读与下面的普通读重排序。LoadStore屏障用来禁止处理器把上面的volatile读与下面的普通写重排序。 

上述volatile写和volatile读的内存屏障插入策略非常保守。在实际执行时，只要不改变volatile写-读的内存语义，编译器可以根据具体情况省略不必要的屏障。

# 6、AQS

对于AQS需要了解这么几点： 
* 锁的状态通过volatile int state来表示。 
* 获取不到锁的线程会进入AQS的队列等待。 
* 子类需要重写tryAcquire、tryRelease等方法。

AQS 详解参见：[面试必备：Java AQS 实现原理（图文）分析](https://www.jiankunking.com/java-aqs.html) 

# 7、ReentrantLock
以公平锁为例，看看 ReentrantLock 获取锁 & 释放锁的关键代码：
```
/**
 * The synchronization state.
 */
private volatile int state;
/**
 * Returns the current value of synchronization state.
 * This operation has memory semantics of a {@code volatile} read.
 * @return current state value
 */
protected final int getState() {
    return state;
}
protected final boolean tryRelease(int releases) {
    int c = getState() - releases;
    if (Thread.currentThread() != getExclusiveOwnerThread())
        throw new IllegalMonitorStateException();
    boolean free = false;
    if (c == 0) {
        free = true;
        setExclusiveOwnerThread(null);
    }
    setState(c);// 释放锁的最后，写volatile变量state
    return free;
}
 protected final boolean tryAcquire(int acquires) {
        final Thread current = Thread.currentThread();
        int c = getState();// 获取锁的开始，首先读volatile变量state
        if (c == 0) {
            if (!hasQueuedPredecessors() &&
                compareAndSetState(0, acquires)) {
                setExclusiveOwnerThread(current);
                return true;
            }
        }
        else if (current == getExclusiveOwnerThread()) {
            int nextc = c + acquires;
            if (nextc < 0)
                throw new Error("Maximum lock count exceeded");
            setState(nextc);
            return true;
        }
        return false;
}
```
<font color=DeepPink>**公平锁在释放锁的最后写volatile变量state，在获取锁时首先读这个volatile变量。根据volatile的happens-before规则，释放锁的线程在写volatile变量之前可见的共享变量，在获取锁的线程读取同一个volatile变量后将立即变得对获取锁的线程可见。从而保证了代码段中变量（变量主要是指共享变量，存在竞争问题的变量）的可见性。**</font>

# 8、小结

如果我们仔细分析concurrent包的源代码实现，会发现一个通用化的实现模式。 
* 首先，<font color=DeepPink>**声明共享变量为volatile。**</font>
* 然后，<font color=DeepPink>**使用CAS的原子条件更新来实现线程之间的同步。**</font>
* 同时，<font color=DeepPink>**配合以volatile的读/写和CAS所具有的volatile读和写的内存语义来实现线程之间的通信。**</font>
> 前文我们提到过，编译器不会对volatile读与volatile读后面的任意内存操作重排序；编译器不会对volatile写与volatile写前面的任意内存操作重排序。组合这两个条件，意味着为了同时实现volatile读和volatile写的内存语义，编译器不能对CAS与CAS前面和后面的任意内存操作重排序。

本文参考： 

1、《Java并发编程的艺术》 方腾飞　魏鹏　程晓明　著

2、[Java 可重入锁内存可见性分析](https://mp.weixin.qq.com/s?__biz=MzI3ODcxMzQzMw==&mid=2247485795&idx=2&sn=73d5bcd83378f6176f9593d33dc402dc&chksm=eb538c55dc240543df3cd113cb3e586e98d3ccd0a93c6a87829a04e296b990a554596338046e#rd) 
