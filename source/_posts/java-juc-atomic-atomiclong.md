---
title: Java JUC Atomic AtomicLong
categories:
  - JDK
tags:
  - JDK
  - Concurrent
  - Atomic
  - AtomicLong
  - 原创
abbrlink: 57432
date: 2019-08-04 11:17:52
---

> 基于OpenJDK 12
> 本文的目的是为后续文章解析LongAdder做一个引子，以便两者对比。

<!-- more -->

[Atomic Package解析参考（比如lazySet原理解析）](http://www.jiankunking.com/译-Java-Concurrent-Atomic-Package-详解.html)

AtomicLong的常用方法如下：
* long addAndGet(long delta)：以原子方式将输入的数值与实例中的值（AtomicLong里的
value）相加，并返回结果。
* compareAndSet(long expectedValue, long newValue)：如果输入的数值等于预期值，则以原子方
式将该值设置为输入的值。
* long getAndIncrement()：以原子方式将当前值加1，注意，这里返回的是自增前的值。
* void lazySet(long newValue)：最终会设置成newValue，<font color=DeepPink>**使用lazySet设置值后，可能导致其他
线程在之后的一小段时间内还是可以读到旧的值**</font>。
* long getAndSet(long newValue)：以原子方式设置为newValue的值，并返回旧值。

AtomicLong示例代码如下：
```
public class AtomicLongTest {
    static AtomicLong ai = new AtomicLong(1);
    public static void main(String[] args) {
        System.out.println(ai.getAndIncrement());
        System.out.println(ai.get());
    }
}
```
输出结果如下:
```
1
2
```
那么getAndIncrement是如何实现原子操作的呢？让我们一起分析其实现原理，getAndIncrement的源码如下：
```
public final long getAndIncrement() {
   return U.getAndAddLong(this, VALUE, 1L);
}
@HotSpotIntrinsicCandidate
public final long getAndAddLong(Object o, long offset, long delta) {
    long v;
    do {
        v = getLongVolatile(o, offset);
    } while (!weakCompareAndSetLong(o, offset, v, v + delta));
    return v;
}
/** Volatile version of {@link #getLong(Object, long)}  */
@HotSpotIntrinsicCandidate
public native long getLongVolatile(Object o, long offset);

@HotSpotIntrinsicCandidate
public final boolean weakCompareAndSetLong(Object o, long offset,
                                           long expected,
                                           ong x) {
    return compareAndSetLong(o, offset, expected, x);
}
/**
 * Atomically updates Java variable to {@code x} if it is currently
 * holding {@code expected}.
 *
 * <p>This operation has memory semantics of a {@code volatile} read
 * and write.  Corresponds to C11 atomic_compare_exchange_strong.
 *
 * @return {@code true} if successful
 */
@HotSpotIntrinsicCandidate
public final native boolean compareAndSetLong(Object o, long offset,
                                              long expected,
                                              long x);
```
> @HotSpotIntrinsicCandidate JDK的源码中，被@HotSpotIntrinsicCandidate标注的方法，在HotSpot中都有一套高效的实现，该高效实现基于CPU指令，运行时，HotSpot维护的高效实现会替代JDK的源码实现，从而获得更高的效率。

源码getAndAddLong(Object o, long offset, long delta)中do while循环体是实现的关键所在，其逻辑是：
第一步先取得AtomicLong里存储的数值，
第二步对AtomicLong的当前数值进行加1操作，
第三步调用weakCompareAndSetLong方法来进行原子更新操作，该方法先检查当前数值是否等于v，等于意味着AtomicLong的值没有被其他线程修改过，则将weakCompareAndSetLong的当前数值更新成v+delta的值，如果不等于v，weakCompareAndSetLong方法会返回false，<font color=DeepPink>**程序会进入do while循环重新进行**</font>weakCompareAndSetLong操作。

<font color=DeepPink>**这里隐含了一个问题，当对于共享变量（假设变量名字是a）的竞争非常激烈的时候，在当前线程读取a、改变a之间，a的值会被别的线程改变，从而导致当前线程一直重试（自旋），一直占用CPU。**</font>

<font color=DeepPink>**这就引出另一个问题，对于锁抢占很激烈的时候，串行是最好的解决办法。比如使用synchronized。**</font>

> java.util.concurrent.atomic中的原子操作基本是基于Unsafe或者VarHandle实现的。

[AtomicLong源码](https://github.com/jiankunking/openjdk12/blob/master/src/java.base/share/classes/java/util/concurrent/atomic/AtomicLong.java)

> 本文参考 《Java并发编程的艺术》 作者：方腾飞　魏鹏　程晓明
