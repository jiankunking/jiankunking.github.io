---
layout: w
title: Java Volatile Keyword
date: 2020-08-15 07:34:59
categories:
  - JUC
tags:
  - JUC
  - AQS
  - JDK
  - Java
  - Volatile
  - 原创
  - 翻译
---

> 翻译自：Java Volatile Keyword
> 地址：http://tutorials.jenkov.com/java-concurrency/volatile.html

<!-- more -->

Java volatile关键字用于将Java变量标记为“存储在主内存中”。更准确地说，这意味着对volatile变量的每次读取都将从计算机的主存中读取，而不是从CPU缓存中读取，而且对volatile变量的每次写入都将写入主存，而不仅仅是写入CPU缓存中。

实际上，由于Java 5 volatile关键字不仅仅保证volatile变量被写入主存和从主存中读取。我将在下面的部分中对此进行解释。

# 变量可见性问题

Java volatile关键字保证跨线程对变量的更改可见性。这听起来可能有点抽象，所以让我来详细说明一下。

在对非volatile变量进行操作的多线程应用程序中，出于性能原因，每个线程在处理变量时可能会将它们从主存复制到CPU缓存中。如果您的计算机包含多个CPU，则每个线程可以在不同的CPU上运行。这意味着，每个线程可以将这些变量复制到不同CPU的CPU缓存中。如图所示:

![](/images/java-volatile-keyword/java-volatile-1.png)

对于volatile变量，无法保证Java虚拟机(JVM)何时将数据从主存读入CPU缓存，或何时将数据从CPU缓存写入主存。这可能会导致几个问题，我将在下面几节中解释这些问题。想象这样一种情况:两个或多个线程访问一个共享对象，该对象包含一个这样声明的计数器变量:

```
public class SharedObject {
    public int counter = 0;
}
```

再想象一下，只有线程1增加了计数器变量，但是线程1和线程2都可以不时地读取计数器变量。如果计数器变量未声明为volatile，则无法保证何时将计数器变量的值从CPU缓存写入主存。这意味着，CPU缓存中的计数器变量值可能与主存中的不同。这里说明了这种情况:

![](/images/java-volatile-keyword/java-volatile-2.png)

线程看不到变量的最新值，因为它还没有被另一个线程写回主存，这种问题称为“可见性”问题。一个线程的更新对其他线程是不可见的。

# Java volatile可见性保证

Java volatile关键字旨在解决可变可见性问题。通过声明volatile计数器变量，所有对计数器变量的写操作都将立即写回主存。另外，对计数器变量的所有读取都将直接从主存中读取。

下面是volatile声明计数器变量的样子:
```
public class SharedObject {
    public volatile int counter = 0;
}
```

将变量声明为volatile可以保证其他写入该变量的线程的可见性。

在上面给出的场景中，一个线程(T1)修改计数器，而另一个线程(T2)读取计数器(但从不修改它)，因此声明计数器变量为volatile就足以保证T2写入计数器变量时的可见性。

但是，如果T1和T2都在递增计数器变量，那么将计数器变量声明为volatile是不够的。稍后会详细介绍。

# 完整的volatile可见性保证

实际上，Java volatile的可见性保证超出了volatile变量本身。可见性保证如下:
* <font color=DeepPink>**如果线程A写入了一个volatile变量，而线程B随后又读取了同一个volatile变量，那么线程A在写入该volatile变量之前可见的所有变量，在线程B读取了该volatile变量之后也将可见。**</font>
* <font color=DeepPink>**如果线程A读取一个volatile变量，那么线程A在读取该volatile变量时可见的所有变量也将从主存中重新读取。**</font>


让我用一个代码示例来说明:
```
public class MyClass {
    private int years;
    private int months
    private volatile int days;

    public void update(int years, int months, int days){
        this.years  = years;
        this.months = months;
        this.days   = days;
    }
}
```

udpate()方法写入三个变量，其中只有days是volatile变量。

完整的volatile可见性保证意味着，当一个值写入到days时，所有对线程可见的变量也会写入到主存中。这意味着，当一个值被写入days时，years和months的值也被写入主存。

当读取years、months、days的值时，可以这样做:

```
public class MyClass {
    private int years;
    private int months
    private volatile int days;

    public int totalDays() {
        int total = this.days;
        total += months * 30;
        total += years * 365;
        return total;
    }

    public void update(int years, int months, int days){
        this.years  = years;
        this.months = months;
        this.days   = days;
    }
}
```

注意，totalDays()方法首先将days的值读入total变量。当读取days的值时，months和years的值也被读入主存。因此，通过上述读取序列，您可以保证看到最新的days、months和years的值。

# 指令重新排序的挑战

出于性能原因，允许Java VM和CPU对程序中的指令重新排序，只要指令的语义意义保持不变。例如，看看下面的说明:

```
int a = 1;
int b = 2;

a++;
b++;
```

这些指令可以被重新排序到以下序列，而不会失去程序的语义意义:
```
int a = 1;
a++;

int b = 2;
b++;
```

但是，当其中一个变量是volatile变量时，指令重新排序就会带来挑战。让我们看看之前Java volatile教程中的例子中的MyClass:

```
public class MyClass {
    private int years;
    private int months
    private volatile int days;

    public void update(int years, int months, int days){
        this.years  = years;
        this.months = months;
        this.days   = days;
    }
}
```

update()方法将值写入days之后，将新写入years和months的值也写入主存。但是，如果Java VM重新排序指令，像这样:

```
public void update(int years, int months, int days){
    this.days   = days;
    this.months = months;
    this.years  = years;
}
```

修改days变量时，months和years的值仍然会写入主存，但这一次是在新值写入months和years之前。因此，不能正确地使新值对其他线程可见。重新排序的指令的语义已经改变。

Java有一个解决这个问题的方案，我们将在下一节中看到。

# Java volatile Happens-Before Guarantee

为了解决指令重新排序的问题，Java volatile关键字除了提供可见性保证外，还提供了“happens-before”保证。The happens-before guarantee保证:

* <font color=DeepPink>**如果读/写是在写volatile变量之前发生的，那么对其他变量的读和写操作不能在写volatile变量之后重新排序。在对volatile变量进行写操作之前的读/写操作保证会“happen before”对volatile变量进行写操作之前。注意，它仍然是可能的，例如，对其他变量的读/写，位于写入一个volatile之后，重新排序发生在写入volatile之前。**</font>只是不是反过来。允许从后到前，但不允许从前到后。
* <font color=DeepPink>**如果最初的读/写发生在读volatile变量之后，那么对其他变量的读和写操作就不能在读volatile变量之前重新排序。请注意，对于在volatile变量读取之前发生的其他变量的读取，可以重新排序为在volatile变量读取之后发生。只是不是反过来。**</font>允许从前到后，但不允许从后到前。

以上happens-before保证确保执行volatile关键字的可见性保证。

# volatile 不适用的场景

即使volatile关键字保证对volatile变量的所有读操作都直接从主存中读取，并且对volatile变量的所有写操作都直接写入主存中，仍然存在声明volatile变量是不够的情况。

在前面解释的只有线程1写入共享计数器变量的情况下，将计数器变量声明为volatile就足以确保线程2总是看到最新的写入值。

事实上，如果写入变量的新值不依赖于它以前的值，多个线程甚至可以写入共享volatile变量，并且仍然将正确的值存储在主内存中。换句话说，如果一个线程向共享volatile变量写入一个值，那么它不需要首先读取它的值来计算下一个值。

一旦线程需要首先读取volatile变量的值，并根据该值为共享volatile变量生成一个新值，那么volatile变量就不再足以保证正确的可见性。读取volatile变量与写入新值之间的时间间隔很短，这造成了竞争状态，其中多个线程可能会读取volatile变量的相同值，为该变量生成一个新值，以及在写入该值时 返回主内存-覆盖彼此的值。

多个线程递增同一个计数器的情况恰恰是一个volatile变量不够用的情况。下面几节将更详细地解释这种情况。

设想一下，如果线程1将一个值为0的共享计数器变量读入其CPU缓存，将其增量为1，并且不将更改后的值写回主存。然后，线程2可以从主存中读取相同的计数器变量(该变量的值仍然为0)到它自己的CPU缓存中。然后，线程2也可以将计数器增加到1，并且不将计数器写回主存。这一情况如下图所示:

![](/images/java-volatile-keyword/java-volatile-3.png)

线程1和线程2现在实际上是不同步的。共享计数器变量的实际值应该是2，但是每个线程的CPU缓存中该变量的值都是1，而在主存中该值仍然是0。真是一团糟!即使线程最终将共享计数器变量的值写回主存，该值也将是错误的。

# volatile 适用的场景

如前所述，如果两个线程同时读取和写入共享变量，那么使用volatile关键字是不够的。在这种情况下，需要使用synchronized来保证对变量的读写是原子性的。读或写volatile变量不会阻塞线程的读或写。要做到这一点，您必须在关键部分周围使用synchronized关键字。

作为同步块的替代方法，您还可以使用java.util.concurrent中找到的许多原子数据类型之一。例如，AtomicLong或AtomicReference或其他的一个。

如果只有一个线程读取和写入volatile变量的值，而其他线程只读取该变量，那么读取的线程将确保看到写入volatile变量的最新值。如果不使用volatile变量，这将无法得到保证。

volatile关键字可以保证在32位和64位变量上工作。

# volatile 性能

对volatile变量的读写会导致该变量被读写到主存中。从主存读取和写入比访问CPU缓存开销更大。访问volatile变量还会阻止指令重排序，而指令重排序是一种普通的性能增强技术。因此，只有在真正需要增强变量的可见性时，才应该使用volatile变量。