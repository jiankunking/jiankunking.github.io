---
title: '[译]Java Concurrent Atomic Package详解'
abbrlink: 55741
date: 2019-08-04 16:51:43
categories:
  - JDK
tags:
  - JDK
  - Concurrent
  - Atomic
  - 原创
  - Java
---

> 翻译自：Package java.util.concurrent.atomic

<!-- more -->

> 地址：
> https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/package-summary.html#package.description
> 翻译JDK8而不是12的原因是JDK8对与内存语义部分讲解更加详细。

**Package java.util.concurrent.atomic 对于单个变量支持无锁、线程安全操作的工具类。**

类摘要：

|  类名   | 描述  |
|  ----  | ----  |
| AtomicBoolean  | 可以原子性更新的boolean值。 |
| AtomicInteger  | 可以原子性更新的int值。 |
| AtomicIntegerArray  | 一个int数组，其中的元素可以原子性更新。 |
| AtomicIntegerFieldUpdater<T>  | 基于反射，可以对指定类的指定 volatile int 字段进行原子更新。 |
| AtomicLong  | 可以原子性更新的long值。 |
| AtomicLongArray  | 一个long数组，其中的元素可以原子性更新。 |
| AtomicLongFieldUpdater<T>  | 基于反射，可以对指定类的指定 volatile long 字段进行原子更新。 |
| AtomicMarkableReference<V>  | 维护带有标记位的对象引用，可以原子方式对其进行更新。 |
| AtomicReference<V>  | 可以原子性更新的对象引用 |
| AtomicReferenceArray<E>  | 一个对象引用数组，其中的元素可以原子性更新。 |
| AtomicReferenceFieldUpdater<T,V>  | 基于反射，可以对指定类的指定 volatile reference 字段进行原子更新。 |
| AtomicStampedReference<V>  | 维护带有整数版本标志的对象引用，可以原子方式对其进行更新。 |
| DoubleAccumulator  | One or more variables that together maintain a running double value updated using a supplied function.|
| DoubleAdder  | One or more variables that together maintain an initially zero double sum.|
| LongAccumulator  | One or more variables that together maintain a running long value updated using a supplied function. |
| LongAdder  | One or more variables that together maintain an initially zero long sum.|

> DoubleAccumulator、DoubleAdder、LongAccumulator、LongAdder 均是Striped64的子类，内部维护的是一个数组，当并发更新时，每个线程操作的是数组中的元素，从而降低锁的粒度。

本质上，该package下的类扩展了volatile值、字段、数组元素的概念，提供以下形式的原子更新操作：
```
 boolean compareAndSet(expectedValue, updateValue);
```
该方法（在不同类中的参数类型不同）原子地将变量设置为updateValue，如果它当前持有expectedValue，更新成功返回true。该包中的类还包含获取和无条件设置（set）值的方法。

这些方法的规范使实现能够采用当代处理器上可用的高效机器级原子指令。然而，<font color=DeepPink>**在某些平台上，支持可能需要某种形式的内部锁定。因此，这些方法不是严格保证是非阻塞的（线程可能在执行操作之前暂时阻塞）。**</font>

AtomicBoolean、AtomicInteger、AtomicLong和AtomicReference类的实例都提供对对应类型的单个变量的访问和更新。每个类还提供了适用于该类型的实用方法。例如，类AtomicLong和AtomicInteger提供原子增量方法。 一个应用是生成序列号，如：
```
 class Sequencer {
   private final AtomicLong sequenceNumber = new AtomicLong(0);
   public long next() {
     return sequenceNumber.getAndIncrement();
   }
 }
```

原子性访问和更新内存效果，与volatiles遵循同样的规则，如[The Java Language Specification (17.4 Memory Model)](https://docs.oracle.com/javase/specs/jls/se7/html/jls-17.html#jls-17.4)所述：
* get与volatile读效果一样
* set与volatile写效果一样
* lazySet与写入(分配)volatile变量的效果一样【写操作不会与之前的任何写操作重新排序】，但它可能被后续操作重排【也就是，<font color=DeepPink>**在volatile写或者同步操作之前，可能对于其它线程不可见**</font>】。
* compareAndSet和所有其他读取和更新操作(如getAndIncrement)一样，与volatile变量读取和写入具有相同的内存效果。

> lazySet是使用Unsafe.putOrderedObject方法，这个方法在对低延迟代码是很有用的，它能够实现非阻塞的写入，这些写入不会被Java的JIT重新排序指令(instruction reordering)，这样它使用快速的存储-存储(store-store) barrier, 而不是较慢的存储-加载(store-load) barrier, 后者总是用在volatile的写操作上，这种性能提升是有代价的，虽然便宜，也就是写后结果并不会被其他线程看到，甚至是自己的线程，通常是几纳秒后被其他线程看到，这个时间比较短，所以代价可以忍受。
> 设想如下场景: 设置一个 volatile 变量为 null，让这个对象被 GC 掉，volatile write 是消耗比较大（store-load 屏障）的，但是 putOrderedInt 只会加 store-store 屏障，损耗会小一些。

添加lazySet方法的原因:https://bugs.java.com/bugdatabase/view_bug.do?bug_id=6275329
```
As probably the last little JSR166 follow-up for Mustang,
we added a "lazySet" method to the Atomic classes
(AtomicInteger, AtomicReference, etc). This is a niche
method that is sometimes useful when fine-tuning code using
non-blocking data structures. The semantics are
that the write is guaranteed not to be re-ordered with any
previous write, but may be reordered with subsequent operations
(or equivalently, might not be visible to other threads) until
some other volatile write or synchronizing action occurs).

The main use case is for nulling out fields of nodes in
non-blocking data structures solely for the sake of avoiding
long-term garbage retention; it applies when it is harmless
if other threads see non-null values for a while, but you'd
like to ensure that structures are eventually GCable. In such
cases, you can get better performance by avoiding
the costs of the null volatile-write. There are a few
other use cases along these lines for non-reference-based
atomics as well, so the method is supported across all of the
AtomicX classes.

For people who like to think of these operations in terms of
machine-level barriers on common multiprocessors, lazySet
provides a preceeding store-store barrier (which is either
a no-op or very cheap on current platforms), but no
store-load barrier (which is usually the expensive part
of a volatile-write).
```

> weakCompareAndSet JDK 9之后Deprecated，本文已跳过。

除了表示单个值的类之外，package中还包含Updater类，可用于在类的volatile字段上执行compareAndSet操作。 AtomicReferenceFieldUpdater、AtomicIntegerFieldUpdater和AtomicLongFieldUpdater是基于反射的，可提供对相关字段类型的访问。这些主要用于原子数据结构，同一节点的几个volatile字段（例如，树节点的链接）独立地原子更新。**这些类在如何以及何时使用原子更新方面提供了更大的灵活性，但代价是更加笨拙的基于反射的设置、更不方便的使用和更弱的保证。**

AtomicIntegerArray、AtomicLongArray和AtomicReferenceArray类进一步将原子操作支持扩展到这些类型的数组。这些类还**提供了数组元素的volatile访问语义，这是普通数组不支持的。**

AtomicMarkableReference类将单个布尔值与引用相关联。 例如，该位可能在数据结构中使用，表示被引用的对象在逻辑上已被删除。 AtomicStampedReference类将整数值与引用相关联。 例如，这可以用于表示与一系列更新相对应的版本号。

原子类主要设计为用于实现非阻塞数据结构和相关基础结构类的构建。 compareAndSet方法不是锁定的一般替代方法。 仅当对象的关键更新仅限于单个变量时，它才适用。

原子类不是java.lang.Integer和相关类的通用替换。它们没有定义equals，hashCode和compareTo等方法（由于原子变量预期会发生变化，所以它们不适合作为哈希表键）。

> 后续会出文章解析：AtomicLong、Striped64、LongAdder
> 本文的目的主要是从大体上了解atomic及其内存语义

> JDK 12 
> https://docs.oracle.com/en/java/javase/12/docs/api/java.base/java/util/concurrent/atomic/package-summary.html
