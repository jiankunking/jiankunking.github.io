---
title: Java AQS Condition的实现分析
categories:
  - JUC
tags:
  - JUC
  - AQS
  - JDK
  - Java
  - Condition
abbrlink: 36553
date: 2018-10-27 20:28:55
---


> 本文整理自《Java并发编程的艺术》第五章 作者：方腾飞　魏鹏　程晓明

<!-- more -->

AQS:AbstractQueuedSynchronizer

ConditionObject是同步器AQS的内部类，因为Condition的操作需要获取相关联的锁，所以作为同步器的内部类也较为合理。每个Condition对象都包含着一个队列（以下称为等待队列），该队列是Condition对象实现等待/通知功能的关键。

下面将分析Condition的实现，主要包括：等待队列、等待和通知，下面提到的Condition如果不加说明均指的是ConditionObject。

# 1、等待队列

等待队列是一个FIFO的队列，在队列中的每个节点都包含了一个线程引用，该线程就是在Condition对象上等待的线程，如果一个线程调用了Condition.await()方法，那么该线程将会释放锁、构造成节点加入等待队列并进入等待状态。事实上，节点的定义复用了同步器中节点的定义，也就是说，同步队列和等待队列中节点类型都是同步器的静态内部类AbstractQueuedSynchronizer.Node。

一个Condition包含一个等待队列，Condition拥有首节点（firstWaiter）和尾节点（lastWaiter）。当前线程调用Condition.await()方法，将会以当前线程构造节点，并将节点从尾部加入等待队列，等待队列的基本结构如图5-9所示。
![](/images/java-juc-aqs-condition/59.png)

如图所示，Condition拥有首尾节点的引用，而新增节点只需要将原有的尾节点nextWaiter指向它，并且更新尾节点即可。上述节点引用更新的过程并没有使用CAS保证，原因在于<font color=DeepPink>调用await()方法的线程必定是获取了锁的线程，也就是说该过程是由锁来保证线程安全的。 </font>

在Object的监视器模型上，一个对象拥有一个同步队列和等待队列，而<font color=DeepPink>并发包中的Lock（更确切地说是同步器\）拥有一个同步队列和多个等待队列</font>，其对应关系如图5-10所示。

![](/images/java-juc-aqs-condition/510.png)
# 2、等待

<font color=DeepPink>**调用Condition的await()方法（或者以await开头的方法），会使当前线程进入等待队列并释放锁，同时线程状态变为等待状态。当从await()方法返回时，当前线程一定获取了Condition相关联的锁。**</font>

如果从队列（同步队列和等待队列）的角度看await()方法，当调用await()方法时，相当于同步队列的首节点（获取了锁的节点）移动到Condition的等待队列中。

Condition的await()方法，如下所示：
```
public final void await() throws InterruptedException {
        if (Thread.interrupted())
            throw new InterruptedException();
        // 当前线程加入等待队列
        Node node = addConditionWaiter();
        // 释放同步状态，也就是释放锁
        int savedState = fullyRelease(node);
        int interruptMode = 0;
        while (!isOnSyncQueue(node)) {
            LockSupport.park(this);
            if ((interruptMode = checkInterruptWhileWaiting(node)) != 0)
                break;
        }
        if (acquireQueued(node, savedState) && interruptMode != THROW_IE)
            interruptMode = REINTERRUPT;
        if (node.nextWaiter != null)
            unlinkCancelledWaiters();
        if (interruptMode != 0)
            reportInterruptAfterWait(interruptMode);
    }
```
调用该方法的线程成功获取了锁的线程，也就是同步队列中的首节点，该方法会将当前线程构造成节点并加入等待队列中，然后释放同步状态，唤醒同步队列中的后继节点，然后当前线程会进入等待状态。

当等待队列中的节点被唤醒，则唤醒节点的线程开始尝试获取同步状态。如果不是通过其他线程调用Condition.signal()方法唤醒，而是对等待线程进行中断，则会抛出InterruptedException。

如果从队列的角度去看，当前线程加入Condition的等待队列，该过程如图5-11示。

如图所示，同步队列的首节点并不会直接加入等待队列，而是通过addConditionWaiter()方法把当前线程构造成一个新的节点并将其加入等待队列中。
# 3、通知
调用Condition的signal()方法，将会唤醒在等待队列中等待时间最长的节点（首节点），在唤醒节点之前，会将节点移到同步队列中。

Condition的signal()方法，如代码清单5-23所示。
![](/images/java-juc-aqs-condition/511.png)
代码清单5-23　ConditionObject的signal方法
```
 public final void signal() {
        //isHeldExclusively() AQS 子类实现
        if (!isHeldExclusively())
            throw new IllegalMonitorStateException();
        Node first = firstWaiter;
        if (first != null)
            doSignal(first);
    }
```
<font color=DeepPink>**调用该方法的前置条件是当前线程必须获取了锁，可以看到signal()方法进行了isHeldExclusively()检查，也就是当前线程必须是获取了锁的线程。**</font>接着获取等待队列的首节点，将其移动到同步队列并使用LockSupport唤醒节点中的线程。

节点从等待队列移动到同步队列的过程如图5-12所示。

![](/images/java-juc-aqs-condition/512.png)
通过调用同步器的enq(Node node)方法，等待队列中的头节点线程安全地移动到同步队列。当节点移动到同步队列后，当前线程再使用LockSupport唤醒该节点的线程。

被唤醒后的线程，将从await()方法中的while循环中退出（isOnSyncQueue(Node node)方法返回true，节点已经在同步队列中），进而调用同步器的acquireQueued()方法加入到获取同步状态的竞争中。

成功获取同步状态（或者说锁）之后，被唤醒的线程将从先前调用的await()方法返回，此时该线程已经成功地获取了锁。

Condition的signalAll()方法，相当于对等待队列中的每个节点均执行一次signal()方法，效果就是将等待队列中所有节点全部移动到同步队列中，并唤醒每个节点的线程。
