---
title: Java AQS 实现原理（图文）分析
categories:
  - JUC
tags:
  - JUC
  - AQS
  - JDK
  - Java
  - 原创
abbrlink: 47370
date: 2018-03-03 20:01:45
---

AQS：AbstractQueuedSynchronizer
# 1、AQS设计简介
* AQS的实现是基于一个FIFO的等待队列。
* <font color=DeepPink>**使用单个原子变量来表示获取、释放锁状态（final int）改变该int值使用的是CAS。**</font>（思考：为什么一个int值可以保证内存可见性？）
* <font color=DeepPink>**子类应该定义一个非公开的内部类继承AQS，并实现其中方法。**</font>
* AQS支持exclusive与shared两种模式。
* 内部类ConditionObject用于支持子类实现exclusive模式
* 子类需要重写：
    * tryAcquire
    * tryRelease
    * tryReleaseShared
    * isHeldExclusively等方法，并确保是线程安全的。

贯穿全文的图（核心）：

![](/images/java-juc-aqs/AQS图解.png)

> 模板方法设计模式：定义一个操作中算法的骨架，而将一些步骤的实现延迟到子类中。

# 2、类结构
* ConditionObject类
* Node类
* N多方法

![](/images/java-juc-aqs/AQS类结构.png)

# 3、FIFO队列

等待队列是CLH（Craig, Landin, and Hagersten）锁队列。

**通过节点中的“状态”字段来判断一个线程是否应该阻塞。当该节点的前一个节点释放锁的时候，该节点会被唤醒。** 

![](/images/java-juc-aqs/AQS队列.png)

```
private transient volatile Node head;
private transient volatile Node tail;
//The synchronization state.
//在互斥锁中它表示着线程是否已经获取了锁，0未获取，1已经获取了，大于1表示重入数。
private volatile int state;
```
AQS维护了一个volatile int state（代表共享资源）和一个FIFO线程等待队列（多线程争用资源被阻塞时会进入此队列）。

state的访问方式有三种:

* getState()
* setState()
* compareAndSetState()

AQS定义两种资源共享方式：Exclusive（独占，只有一个线程能执行，如ReentrantLock）和Share（共享，多个线程可同时执行，如Semaphore/CountDownLatch）。

不同的自定义同步器争用共享资源的方式也不同。<font color=DeepPink>**自定义同步器在实现时只需要实现共享资源state的获取与释放方式即可**</font>，至于具体线程等待队列的维护（如获取资源失败入队/唤醒出队等），AQS已经在顶层实现好了。

自定义同步器实现时主要实现以下几种方法：
* isHeldExclusively()：该线程是否正在独占资源。只有用到condition才需要去实现它。
* tryAcquire(int)：独占方式。尝试获取资源，成功则返回true，失败则返回false。
* tryRelease(int)：独占方式。尝试释放资源，成功则返回true，失败则返回false。
* tryAcquireShared(int)：共享方式。尝试获取资源。负数表示失败；0表示成功，但没有剩余可用资源；正数表示成功，且有剩余资源。
* tryReleaseShared(int)：共享方式。尝试释放资源，如果释放后允许唤醒后续等待结点返回true，否则返回false。

以ReentrantLock为例，state初始化为0，表示未锁定状态。A线程lock()时，会调用tryAcquire()独占该锁并将state+1。此后，其他线程再tryAcquire()时就会失败，直到A线程unlock()到state=0（即释放锁）为止，其它线程才有机会获取该锁。当然，释放锁之前，A线程自己是可以重复获取此锁的（state会累加），这就是可重入的概念。但要注意，<font color=DeepPink>**获取多少次就要释放多么次，这样才能保证state是能回到零态的。**</font>

再以CountDownLatch以例，任务分为N个子线程去执行，state也初始化为N（注意N要与线程个数一致）。这N个子线程是并行执行的，每个子线程执行完后countDown()一次，state会CAS减1。等到所有子线程都执行完后(即state=0)，会unpark()主调用线程，然后主调用线程就会从await()函数返回，继续后续动作。



一般来说，自定义同步器要么是独占方法，要么是共享方式，他们也只需实现：
* tryAcquire-tryRelease
* tryAcquireShared-tryReleaseShared

中的一种即可。

当然AQS也支持自定义同步器同时实现独占和共享两种方式，如ReentrantReadWriteLock。

> 以下部分来自源码注释：

每次进入CLH队列时，需要对尾节点进入队列过程，是一个原子性操作。在出队列时，我们只需要更新head节点即可。在节点确定它的后继节点时， 需要花一些功夫，用于处理那些，由于等待超时时间结束或中断等原因， 而取消等待锁的线程。

节点的前驱指针，主要用于处理，取消等待锁的线程。如果一个节点取消等待锁，则此节点的前驱节点的后继指针，要指向，此节点后继节点中，非取消等待锁的线程（有效等待锁的线程节点）。

我们用next指针连接实现阻塞机制。每个节点均持有自己线程，节点通过节点的后继连接唤醒其后继节点。

CLH队列需要一个傀儡结点作为开始节点。我们不会再构造函数中创建它，因为如果没有线程竞争锁，那么，努力就白费了。取而代之的方案是，当有第一个竞争者时，我们才构造头指针和尾指针。

线程通过同一节点等待条件，但是用另外一个连接。条件只需要放在一个非并发的连接队列与节点关联，因为只有当线程独占持有锁的时候，才会去访问条件。当一个线程等待条件的时候，节点将会插入到条件队列中。当条件触发时，节点将会转移到主队列中。用一个状态值，描述节点在哪一个队列上。

# 4、Node
```
static final class Node {
    //该等待节点处于共享模式
    static final Node SHARED = new Node();
    //该等待节点处于独占模式
    static final Node EXCLUSIVE = null;
    
    //表示节点的线程是已被取消的
    static final int CANCELLED =  1;
    //表示当前节点的后继节点的线程需要被唤醒
    static final int SIGNAL    = -1;
    //表示线程正在等待某个条件
    static final int CONDITION = -2;
    //表示下一个共享模式的节点应该无条件的传播下去
    static final int PROPAGATE = -3;

    //状态位 ，分别可以使CANCELLED、SINGNAL、CONDITION、PROPAGATE、0 
    volatile int waitStatus;

    volatile Node prev;//前驱节点
    volatile Node next;//后继节点
    volatile Thread thread;//等待锁的线程

    //ConditionObject链表的后继节点或者代表共享模式的节点。
    //因为Condition队列只能在独占模式下被能被访问,我们只需要简单的使用链表队列来链接正在等待条件的节点。
    //然后它们会被转移到同步队列（AQS队列）再次重新获取。
    //由于条件队列只能在独占模式下使用，所以我们要表示共享模式的节点的话只要使用特殊值SHARED来标明即可。
    Node nextWaiter;
    //Returns true if node is waiting in shared mode
    final boolean isShared() {
            return nextWaiter == SHARED;
    }
    .......
}
```
waitStatus不同值含义：
* SIGNAL(-1)：当前节点的后继节点已经 (或即将)被阻塞（通过park） , 所以当当前节点释放或则被取消时候，一定要unpark它的后继节点。为了避免竞争，获取方法一定要首先设置node为signal，然后再次重新调用获取方法，如果失败，则阻塞。
* CANCELLED(1)：当前节点由于超时或者被中断而被取消。一旦节点被取消后，那么它的状态值不在会被改变，且当前节点的线程不会再次被阻塞。
* CONDITION(-2) ：该节点的线程处于等待条件状态,不会被当作是同步队列上的节点,直到被唤醒(signal),设置其值为0,重新进入阻塞状态.
* PROPAGATE(-3：)共享模式下的释放操作应该被传播到其他节点。该状态值在doReleaseShared方法中被设置的。
* 0：以上都不是

该状态值为了简便使用，所以使用了数值类型。非负数值意味着该节点不需要被唤醒。所以，大多数代码中不需要检查该状态值的确定值。

一个正常的Node，它的waitStatus初始化值是0。如果想要修改这个值，可以使用AQS提供CAS进行修改。

# 5、独占模式与共享模式

在锁的获取时，并不一定只有一个线程才能持有这个锁（或者称为同步状态），所以此时有了独占模式和共享模式的区别，也就是在Node节点中由nextWaiter来标识。比如ReentrantLock就是一个独占锁，只能有一个线程获得锁，而WriteAndReadLock的读锁则能由多个线程同时获取，但它的写锁则只能由一个线程持有。

## 5.1、独占模式
### 5.1.1 独占模式同步状态的获取
```
//忽略中断的（即不手动抛出InterruptedException异常）独占模式下的获取方法。
//该方法在成功返回前至少会调用一次tryAcquire()方法(该方法是子类重写的方法，如果返回true则代表能成功获取).
//否则当前线程会进入队列排队，重复的阻塞和唤醒等待再次成功获取后返回, 
//该方法可以用来实现Lock.lock
public final void acquire(int arg) {
       if (!tryAcquire(arg) &&
            acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
            selfInterrupt();
    }
```
该方法首先尝试获取锁(tryAcquire(arg)的具体实现定义在了子类中),如果获取到,则执行完毕,否则通过addWaiter(Node.EXCLUSIVE), arg)方法把当前节点添加到等待队列末尾,并设置为独占模式。
```
private Node addWaiter(Node mode) {
        //把当前线程包装为node,设为独占模式
        Node node = new Node(Thread.currentThread(), mode);
        // 尝试快速入队，即无竞争条件下肯定成功。如果失败，则进入enq自旋重试入队
        Node pred = tail;
        if (pred != null) {
            node.prev = pred;
            //CAS替换当前尾部。成功则返回
            if (compareAndSetTail(pred, node)) {
                pred.next = node;
                return node;
            }
        }
        enq(node);
        return node;
    }
//插入节点到队列中，如果队列未初始化则初始化，然后再插入。
private Node enq(final Node node) {
        for (;;) {
            Node t = tail;
            if (t == null) { // Must initialize
                if (compareAndSetHead(new Node()))
                    tail = head;
            } else {
                node.prev = t;
                if (compareAndSetTail(t, node)) {
                    t.next = node;
                    return t;
                }
            }
        }
    }
```
如果tail节点为空,执行enq(node);重新尝试,最终把node插入.在把node插入队列末尾后,它并不立即挂起该节点中线程,因为在插入它的过程中,前面的线程可能已经执行完成,所以它会先进行自旋操作acquireQueued(node, arg),尝试让该线程重新获取锁!当条件满足获取到了锁则可以从自旋过程中退出，否则继续。
```
final boolean acquireQueued(final Node node, int arg) {
        boolean failed = true;
        try {
            boolean interrupted = false;
            for (;;) {
                final Node p = node.predecessor();
                //如果它的前继节点为头结点,尝试获取锁,获取成功则返回           
                if (p == head && tryAcquire(arg)) {
                    setHead(node);
                    p.next = null; // help GC
                    failed = false;
                    return interrupted;
                }
                //判断当前节点的线程是否应该被挂起，如果应该被挂起则挂起。
                //等待release唤醒释放
                if (shouldParkAfterFailedAcquire(p, node) &&
                    parkAndCheckInterrupt())
                    interrupted = true;
            }
        } finally {
            if (failed)
                //在队列中取消当前节点
                cancelAcquire(node);
        }
    }
```
如果没获取到锁,则判断是否应该挂起,而这个判断则得通过它的前驱节点的waitStatus来确定:
```
private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
        int ws = pred.waitStatus;
        //该节点如果状态如果为SIGNAL。则返回true，然后park挂起线程
        if (ws == Node.SIGNAL)
            return true;
       //表明该节点已经被取消，向前循环重新调整链表节点
        if (ws > 0) {
            /*
             * Predecessor was cancelled. Skip over predecessors and
             * indicate retry.
             */
            do {
                node.prev = pred = pred.prev;
            } while (pred.waitStatus > 0);
            pred.next = node;
        } else {
            //执行到这里代表节点是0或者PROPAGATE，然后标记他们为SIGNAL，但是
            //还不能park挂起线程。需要重试是否能获取，如果不能，则挂起。
            compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
        }
        return false;
    }
   
//挂起当前线程，且返回线程的中断状态
private final boolean parkAndCheckInterrupt() {
        LockSupport.park(this);
        return Thread.interrupted();
    }
```

最后,我们对获取独占式锁过程对做个总结:

AQS的模板方法acquire通过调用子类自定义实现的tryAcquire获取同步状态失败后->将线程构造成Node节点(addWaiter)->将Node节点添加到同步队列对尾(addWaiter)->节点以自旋的方法获取同步状态(acquirQueued)。在节点自旋获取同步状态时，只有其前驱节点是头节点的时候才会尝试获取同步状态，如果该节点的前驱不是头节点或者该节点的前驱节点是头节点单获取同步状态失败，则判断当前线程需要阻塞，如果需要阻塞则需要被唤醒过后才返回。

<font color=DeepPink>**获取锁的过程：**</font>
* <font color=DeepPink>**当线程调用acquire()申请获取锁资源，如果成功，则进入临界区。**</font>
* <font color=DeepPink>**当获取锁失败时，则进入一个FIFO等待队列，然后被挂起等待唤醒。**</font>
* <font color=DeepPink>**当队列中的等待线程被唤醒以后就重新尝试获取锁资源，如果成功则进入临界区，否则继续挂起等待。**</font>

### 5.1.2 独占模式同步状态的释放

既然是释放,那肯定是持有锁的该线程执行释放操作,即head节点中的线程释放锁.

AQS中的release释放同步状态和acquire获取同步状态一样，都是模板方法，tryRelease释放的具体操作都有子类去实现，父类AQS只提供一个算法骨架。
```
public final boolean release(int arg) {
    if (tryRelease(arg)) {
        Node h = head;
        if (h != null && h.waitStatus != 0)
            unparkSuccessor(h);
        return true;
    }
    return false;
}
//如果node的后继节点不为空且不是作废状态,则唤醒这个后继节点,
//否则从末尾开始寻找合适的节点,如果找到,则唤醒
private void unparkSuccessor(Node node) {
        int ws = node.waitStatus;
        if (ws < 0)
            compareAndSetWaitStatus(node, ws, 0);
        Node s = node.next;
        if (s == null || s.waitStatus > 0) {
            s = null;
            for (Node t = tail; t != null && t != node; t = t.prev)
                if (t.waitStatus <= 0)
                    s = t;
        }
        if (s != null)
            LockSupport.unpark(s.thread);
    }
```
过程：首先调用子类的tryRelease()方法释放锁，然后唤醒后继节点，在唤醒的过程中，需要判断后继节点是否满足情况，如果后继节点不为空且不是作废状态，则唤醒这个后继节点，否则从tail节点向前寻找合适的节点，如果找到，则唤醒。

<font color=DeepPink>**释放锁过程：**</font>
* <font color=DeepPink>**当线程调用release()进行锁资源释放时，如果没有其他线程在等待锁资源，则释放完成。**</font>
* <font color=DeepPink>**如果队列中有其他等待锁资源的线程需要唤醒，则唤醒队列中的第一个等待节点（先入先出）。**</font>

## 5.2、共享模式
### 5.2.1 共享模式同步状态的获取

* <font color=DeepPink>**当线程调用acquireShared()申请获取锁资源时，如果成功，则进入临界区。**</font>
* <font color=DeepPink>**当获取锁失败时，则创建一个共享类型的节点并进入一个FIFO等待队列，然后被挂起等待唤醒。**</font>
* <font color=DeepPink>**当队列中的等待线程被唤醒以后就重新尝试获取锁资源，如果成功则唤醒后面还在等待的共享节点并把该唤醒事件传递下去，即会依次唤醒在该节点后面的所有共享节点，然后进入临界区，否则继续挂起等待。**</font>

### 5.2.2 共享模式同步状态的释放

* <font color=DeepPink>**当线程调用releaseShared()进行锁资源释放时，如果释放成功，则唤醒队列中等待的节点，如果有的话。**</font>

# 6. AQS小结

java.util.concurrent中的很多可阻塞类（比如ReentrantLock）都是基于AQS来实现的。<font color=DeepPink>**AQS是一个同步框架，它提供通用机制来原子性管理同步状态、阻塞和唤醒线程，以及维护被阻塞线程的队列。**</font>

JDK中AQS被广泛使用，基于AQS实现的同步器包括：
* ReentrantLock
* Semaphore
* ReentrantReadWriteLock（后续会出文章讲解）
* CountDownLatch
* FutureTask

每一个基于AQS实现的同步器都会包含两种类型的操作，如下：
* 至少一个acquire操作。这个操作阻塞调用线程，除非/直到AQS的状态允许这个线程继续执行。
* 至少一个release操作。这个操作改变AQS的状态，改变后的状态可允许一个或多个阻塞线程被解除阻塞。

<font color=DeepPink>**基于“复合优先于继承”的原则，基于AQS实现的同步器一般都是：声明一个内部私有的继承于AQS的子类Sync，对同步器所有公有方法的调用都会委托给这个内部子类。**</font>

# 7.后续

后面会推出以下有关AQS的文章，已加深对于AQS的理解
* [AQS ConditionObject对象解析](https://www.jiankunking.com/java-aqs-condition.html)
* [AQS 应用案例 ReentrantReadWriteLock解析](https://www.jiankunking.com/java-reentrantreadwritelock.html)
* [Java Volatile的内存语义与AQS锁内存可见性](https://www.jiankunking.com/java-volatile-aqs.html)

# 8.思考

## 多人抢锁

多个线程同时取争取一个锁（在争取之前资源未被锁定），这时候如何保证，只有一个人能获取到？
下面以非公平锁来看一下
```
        /**
         * Performs non-fair tryLock.  tryAcquire is implemented in
         * subclasses, but both need nonfair try for trylock method.
         */
        @ReservedStackAccess
        final boolean nonfairTryAcquire(int acquires) {
            final Thread current = Thread.currentThread();
            int c = getState();
            if (c == 0) {
                if (compareAndSetState(0, acquires)) {
                    setExclusiveOwnerThread(current);
                    return true;
                }
            }
            else if (current == getExclusiveOwnerThread()) {
                int nextc = c + acquires;
                if (nextc < 0) // overflow
                    throw new Error("Maximum lock count exceeded");
                setState(nextc);
                return true;
            }
            return false;
        }

     /**
     * Atomically sets synchronization state to the given updated
     * value if the current state value equals the expected value.
     * This operation has memory semantics of a {@code volatile} read
     * and write.
     *
     * @param expect the expected value
     * @param update the new value
     * @return {@code true} if successful. False return indicates that the actual
     *         value was not equal to the expected value.
     */
    protected final boolean compareAndSetState(int expect, int update) {
        return STATE.compareAndSet(this, expect, update);
    }

     /**
     * Atomically sets the value of a variable to the {@code newValue} with the
     * memory semantics of {@link #setVolatile} if the variable's current value,
     * referred to as the <em>witness value</em>, {@code ==} the
     * {@code expectedValue}, as accessed with the memory semantics of
     * {@link #getVolatile}.
     *
     * <p>The method signature is of the form {@code (CT1 ct1, ..., CTn ctn, T expectedValue, T newValue)boolean}.
     *
     * <p>The symbolic type descriptor at the call site of {@code
     * compareAndSet} must match the access mode type that is the result of
     * calling {@code accessModeType(VarHandle.AccessMode.COMPARE_AND_SET)} on
     * this VarHandle.
     *
     * @param args the signature-polymorphic parameter list of the form
     * {@code (CT1 ct1, ..., CTn ctn, T expectedValue, T newValue)}
     * , statically represented using varargs.
     * @return {@code true} if successful, otherwise {@code false} if the
     * witness value was not the same as the {@code expectedValue}.
     * @throws UnsupportedOperationException if the access mode is unsupported
     * for this VarHandle.
     * @throws WrongMethodTypeException if the access mode type does not
     * match the caller's symbolic type descriptor.
     * @throws ClassCastException if the access mode type matches the caller's
     * symbolic type descriptor, but a reference cast fails.
     * @see #setVolatile(Object...)
     * @see #getVolatile(Object...)
     */
    public final native
    @MethodHandle.PolymorphicSignature
    @HotSpotIntrinsicCandidate
    boolean compareAndSet(Object... args);
```

从代码中可以看出通过compareAndSetState来保证只会有一个线程获取到锁。

## LockSupport(park/unpark)

### 实现
Unsafe.park和Unsafe.unpark的底层实现原理
在Linux系统下，是用的Posix线程库pthread中的mutex（互斥量），condition（条件变量）来实现的。
mutex和condition保护了一个_counter的变量，当park时，这个变量被设置为0，当unpark时，这个变量被设置为1。

### Object类的wait/notify和LockSupport(park/unpark)s的区别
park函数是将当前调用Thread阻塞，而unpark函数则是将指定线程Thread唤醒。

与Object类的wait/notify机制相比，park/unpark有两个优点：

* 以thread为操作对象更符合阻塞线程的直观定义
* 操作更精准，可以准确地唤醒某一个线程。

区别是:notify随机唤醒一个线程，notifyAll唤醒所有等待的线程,增加了灵活性

### synchronized 实现

可以参考下这个：

https://xiaomi-info.github.io/2020/03/24/synchronized/


# 9.感谢
本文很多内容整理自网络，参考文献：
https://segmentfault.com/a/1190000011376192
https://segmentfault.com/a/1190000011391092
https://zhuanlan.zhihu.com/p/27134110
https://blog.csdn.net/wojiaolinaaa/article/details/50070031
https://www.cnblogs.com/waterystone/p/4920797.html

FIFO队列:https://www.cnblogs.com/waterystone/p/4920797.html
