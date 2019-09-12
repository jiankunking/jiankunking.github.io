---
title: ReentrantReadWriteLock原理解析
categories:
  - JUC
tags:
  - JUC
  - AQS
  - JDK
  - Java
  - ReentrantReadWriteLock
  - 原创
abbrlink: 11087
date: 2018-11-11 20:39:01
---

>Java JDK 11 ReentrantReadWriteLock 原理分析

<!-- more -->

# 1、前言
希望在阅读本文之前，建议先看一下以下三篇文章：

1、[面试必备：Java AQS 实现原理（图文）分析](https://juejin.im/post/5d37019a51882564c966add6) 

2、[面试必备：Java AQS Condition的实现分析](https://juejin.im/post/5d3848e951882556d1684532) 

3、[面试必备：Java volatile的内存语义与AQS锁内存可见性](https://juejin.im/post/5d3952bff265da1b7c615dba) 

读完了以上三篇文章，先看一下ReentrantReadWriteLock的代码路径：
```
package java.util.concurrent.locks;
```
来先猜一下ReentrantReadWriteLock会如何实现？

都在java.util.concurrent包下，那么可以明确一点，那就是关于锁的实现，应该用的就是AQS，那么，读锁、写锁会不会对应的就是AQS中的共享模式与独占模式？

# 2、读写锁使用场景
读是多于写（比如cache）
> 一般情况下，读写锁的性能都会比排它锁好，因为大多数场景读是多于写的。在读多于写的情况下，读写锁能够提供比排它锁更好的并发性和吞吐量。

# 3、读写锁接口：ReadWriteLock
代码地址：[ReadWriteLock](https://github.com/jiankunking/openjdk11/blob/master/src/java.base/share/classes/java/util/concurrent/locks/ReadWriteLock.java)
```
public interface ReadWriteLock {
    /**
     * Returns the lock used for reading.
     *
     * @return the lock used for reading
     */
    Lock readLock();

    /**
     * Returns the lock used for writing.
     *
     * @return the lock used for writing
     */
    Lock writeLock();
}
```
4、读写锁的接口与示例

ReadWriteLock仅定义了获取读锁和写锁的两个方法，即readLock()方法和writeLock()方法，而其实现：ReentrantReadWriteLock，除了接口方法之外，还提供了一些便于外界监控其内部工作状态的方法，这些方法以及描述如表所示：

![](/images/java-reentrantreadwritelock/ReadWriteLock接口.png)
接下来，通过一个缓存示例说明读写锁的使用方式，示例代码如下：
```

public class Cache {
    static Map<String, Object> map = new HashMap<String, Object>();
    static ReentrantReadWriteLock rwl = new ReentrantReadWriteLock();
    static Lock r = rwl.readLock();
    static Lock w = rwl.writeLock();

    // 获取一个key对应的value
    public static final Object get(String key) {
        r.lock();

        try {
            return map.get(key);
        } finally {
            r.unlock();
        }
    }

    // 设置key对应的value，并返回旧的value
    public static final Object put(String key, Object value) {
        w.lock();

        try {
            return map.put(key, value);
        } finally {
            w.unlock();
        }
    }

    // 清空所有的内容
    public static final void clear() {
        w.lock();

        try {
            map.clear();
        } finally {
            w.unlock();
        }
    }
}
```
上述示例中，Cache组合一个非线程安全的HashMap作为缓存的实现，同时使用读写锁的读锁和写锁来保证Cache是线程安全的。在读操作get(String key)方法中，需要获取读锁，这使得并发访问该方法时不会被阻塞。写操作put(String key,Object value)方法和clear()方法，在更新HashMap时必须提前获取写锁，当获取写锁后，其他线程对于读锁和写锁的获取均被阻塞，而只有写锁被释放之后，其他读写操作才能继续。Cache使用读写锁提升读操作的并发性，也保证每次写操作对所有的读写操作的可见性，同时简化了编程方式。

# 5、ReentrantReadWriteLock脉络梳理
代码地址：[ReentrantReadWriteLock](https://github.com/jiankunking/openjdk11/blob/master/src/java.base/share/classes/java/util/concurrent/locks/ReentrantReadWriteLock.java)

先看一下继承结构：

![](/images/java-reentrantreadwritelock/读写锁接口继承关系.png)
再看一下代码结构：

![](/images/java-reentrantreadwritelock/代码结构.png)
图中可以看出ReentrantReadWriteLock的实现还是比较复杂的，所以接下来主要分析ReentrantReadWriteLock实现关键点，包括：
* 读写状态的设计
* 写锁的获取与释放
* 读锁的获取与释放
* 锁降级

## 5.1 读写状态的设计

读写锁同样依赖自定义同步器来实现同步功能，而读写状态就是其同步器的同步状态。回想ReentrantLock中自定义同步器的实现，同步状态表示锁被一个线程重复获取的次数，而读写锁的自定义同步器需要在同步状态（一个整型变量）上维护多个读线程和一个写线程的状态，使得该状态的设计成为读写锁实现的关键。

如果在一个整型变量上维护多种状态，就一定需要“按位切割使用”这个变量，读写锁将变量切分成了两个部分，高16位表示读，低16位表示写，划分方式如下图所示:

![](/images/java-reentrantreadwritelock/32位读写标识.png)

当前同步状态表示一个线程已经获取了写锁，且重进入了两次，同时也连续获取了两次读锁。读写锁是如何迅速确定读和写各自的状态呢？

答案是通过位运算。假设当前同步状态值为S，写状态等于S&0x0000FFFF（将高16位全部抹去），读状态等于S>>>16（无符号补0右移16位）。当写状态增加1时，等于S+1，当读状态增加1时，等于S+(1<<16)，也就是S+0x00010000。

>1、0x0000FFFF=00000000000000001111111111111111（16个0 16个1）

> 2、>>>： 无符号右移，忽略符号位，空位都以0补齐

> 3、0x00010000=10000000000000000（1个1 16个0）

根据状态的划分能得出一个推论：S不等于0时，当写状态（S&0x0000FFFF）等于0时，则读状态（S>>>16）大于0，即读锁已被获取。
## 5.2 写锁的获取与释放
写锁是一个支持重进入的排它锁。如果当前线程已经获取了写锁，则增加写状态。如果当前线程在获取写锁时，读锁已经被获取（读状态不为0）或者该线程不是已经获取写锁的线程，则当前线程进入等待状态，获取写锁的代码如代码如下：
```
protected final boolean tryAcquire(int acquires) {
            /*
             * Walkthrough:
             * 1. If read count nonzero or write count nonzero
             *    and owner is a different thread, fail.
             * 2. If count would saturate, fail. (This can only
             *    happen if count is already nonzero.)
             * 3. Otherwise, this thread is eligible for lock if
             *    it is either a reentrant acquire or
             *    queue policy allows it. If so, update state
             *    and set owner.
             */
            Thread current = Thread.currentThread();
            int c = getState();
            int w = exclusiveCount(c);
            if (c != 0) {
               // 存在读锁或者当前获取线程不是已经获取写锁的线程
                if (w == 0 || current != getExclusiveOwnerThread())
                    return false;
                if (w + exclusiveCount(acquires) > MAX_COUNT)
                    throw new Error("Maximum lock count exceeded");
                // Reentrant acquire
                setState(c + acquires);
                return true;
            }
            if (writerShouldBlock() ||
                !compareAndSetState(c, c + acquires))
                return false;
            setExclusiveOwnerThread(current);
            return true;
        }
```
该方法除了重入条件（当前线程为获取了写锁的线程）之外，增加了一个读锁是否存在的判断。<font color=DeepPink>**如果存在读锁，则写锁不能被获取，原因在于：读写锁要确保写锁的操作对读锁可见，如果允许读锁在已被获取的情况下对写锁的获取，那么正在运行的其他读线程就无法感知到当前写线程的操作。因此，只有等待其他读线程都释放了读锁，写锁才能被当前线程获取，而写锁一旦被获取，则其他读写线程的后续访问均被阻塞。**</font>

<font color=DeepPink>**写锁的释放与ReentrantLock的释放过程基本类似，每次释放均减少写状态，当写状态为0时表示写锁已被释放，从而等待的读写线程能够继续访问读写锁，同时前次写线程的修改对后续读写线程可见。**</font>

## 5.3 读锁的获取与释放

读锁是一个支持重进入的共享锁，它能够被多个线程同时获取，在没有其他写线程访问（或者写状态为0）时，读锁总会被成功地获取，而所做的也只是（线程安全的）增加读状态。如果当前线程已经获取了读锁，则增加读状态。如果当前线程在获取读锁时，写锁已被其他线程获取，则进入等待状态。获取读锁的实现从Java 5到Java 6变得复杂许多，主要原因是新增了一些功能，例如getReadHoldCount()方法，作用是返回当前线程获取读锁的次数。读状态是所有线程获取读锁次数的总和，而每个线程各自获取读锁的次数只能选择保存在ThreadLocal中，由线程自身维护，这使获取读锁的实现变得复杂。因此，这里将获取读锁的代码做了删减，保留必要的部分，如代码如下：
```
protected final int tryAcquireShared(int unused) {
          for (;;) {
                  int c = getState();
                  int nextc = c + (1 << 16);
                  if (nextc < c)
                    throw new Error("Maximum lock count exceeded");
                  if (exclusiveCount(c) != 0 && owner != Thread.currentThread())
                    return -1;
                  if (compareAndSetState(c, nextc))
                    return 1;
  }
}
```
在tryAcquireShared(int unused)方法中，如果其他线程已经获取了写锁，则当前线程获取读锁失败，进入等待状态。<font color=DeepPink>**如果当前线程获取了写锁或者写锁未被获取，则当前线程（线程安全，依靠CAS保证）增加读状态，成功获取读锁。**</font>

读锁的每次释放（线程安全的，可能有多个读线程同时释放读锁）均减少读状态，减少的值是（1<<16）。
## 5.4 锁降级

锁降级指的是写锁降级成为读锁。如果当前线程拥有写锁，然后将其释放，最后再获取读锁，这种分段完成的过程不能称之为锁降级。锁降级是指把持住（当前拥有的）写锁，再获取到读锁，随后释放（先前拥有的）写锁的过程。

接下来看一个锁降级的示例。因为数据不常变化，所以多个线程可以并发地进行数据处理，当数据变更后，如果当前线程感知到数据变化，则进行数据的准备工作，同时其他处理线程被阻塞，直到当前线程完成数据的准备工作，如代码如下所示：
```

public void processData() {
        readLock.lock();
        if (!update) {
            // 必须先释放读锁
            readLock.unlock();
            // 锁降级从写锁获取到开始
            writeLock.lock();
            try {
                if (!update) {
                    // 准备数据的流程（略）
                    update = true;
                }
                readLock.lock();
            } finally {
                writeLock.unlock();
            }
            // 锁降级完成，写锁降级为读锁
        }
        try {
            // 使用数据的流程（略）
        } finally {
            readLock.unlock();
        }
    }
```
上述示例中，当数据发生变更后，update变量（布尔类型且volatile修饰）被设置为false，此时所有访问processData()方法的线程都能够感知到变化，但只有一个线程能够获取到写锁，其他线程会被阻塞在读锁和写锁的lock()方法上。当前线程获取写锁完成数据准备之后，再获取读锁，随后释放写锁，完成锁降级。

<font color=DeepPink>**锁降级中读锁的获取是否必要呢？答案是必要的。主要是为了保证数据的可见性，如果当前线程不获取读锁而是直接释放写锁，假设此刻另一个线程（记作线程T）获取了写锁并修改了数据，那么当前线程无法感知线程T的数据更新。如果当前线程获取读锁，即遵循锁降级的步骤，则线程T将会被阻塞，直到当前线程使用数据并释放读锁之后，线程T才能获取写锁进行数据更新。**</font>

<font color=DeepPink>**RentrantReadWriteLock不支持锁升级（把持读锁、获取写锁，最后释放读锁的过程）。目的也是保证数据可见性，如果读锁已被多个线程获取，其中任意线程成功获取了写锁并更新了数据，则其更新对其他获取到读锁的线程是不可见的。**</font>

# 6、小结
RentrantReadWriteLock的具体流程梳理完了，回过头来想一下前言的问题，好像并没有得到答案，那么来到ReentrantReadWriteLock代码中，此处主要看一下读锁的获取、释放是否对应AQS中的共享模式。

## 6.1 读锁的获取、释放
```
   public void lock() {
            //看到这里是不是就明白了，我们的猜想是正确的
            sync.acquireShared(1);
        }
       public void unlock() {
            //看到这里是不是就明白了，我们的猜想是正确的
            sync.releaseShared(1);
        }
```
先来看一下ReadLock的具体实现，在ReentrantReadWriteLock初始化的时候，会在构造函数中初始化ReadLock、WriteLock，具体代码如下：
```
 public ReentrantReadWriteLock() {
        this(false);
    }
    public ReentrantReadWriteLock(boolean fair) {
        sync = fair ? new FairSync() : new NonfairSync();
        readerLock = new ReadLock(this);
        writerLock = new WriteLock(this);
    }
```
从ReentrantReadWriteLock构造函数的代码中，可以看到ReadLock初始化的参数是ReentrantReadWriteLock，那么ReadLock需要ReentrantReadWriteLock来做什么呢？

来看一下ReadLock：
```
  private final Sync sync;
      protected ReadLock(ReentrantReadWriteLock lock) {
          sync = lock.sync;
      }
```
从ReadLock的构造函数中，可以看出，ReadLock需要获取到Sync，那么Sync是谁，又是用来做什么的？
> 其实，如果看过JUC下面代码的话，看到Sync，就明白它应该就是AQS的实现类，通过它来实现相关锁的操作。

来看一下代码验证一下：
```
/**
     * Synchronization implementation for ReentrantReadWriteLock.
     * Subclassed into fair and nonfair versions.
     */
    abstract static class Sync extends AbstractQueuedSynchronizer {
    //具体代码略
    }
```
看到这里可以大体得出这么一个结果：ReadLock获取锁的时候，是通过ReentrantReadWriteLock 内部Sync类来获取的共享锁，也就是读锁的获取是对应AQS中的共享模式。

点进 sync.acquireShared(1)方法，可以看到是调用Sync的父类AQS中方法：
```
public final void acquireShared(int arg) {
        if (tryAcquireShared(arg) < 0)
            doAcquireShared(arg);
    }
```

看到这里，也就明白为啥AQS子类需要重写：

* tryAcquire
* tryRelease
* tryReleaseShared
* isHeldExclusively

等方法了。

# 7、参考资料

本文第4、5小节整理自：《Java并发编程的艺术》
