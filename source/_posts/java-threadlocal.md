---
title: Java ThreadLocal
abbrlink: 7394
date: 2019-08-08 13:54:25
categories:
  - Java
tags:
  - ThreadLocal
  - Java
  - 原创
---

> 基于OpenJDK 12

<!-- more -->

# 引

本文主要想了解两个地方：
1. ThreadLocal实例看起来是在多个线程共享，但实际上是彼此独立的，这个是怎么实现的？
2. ThreadLocal使用不当真的会OOM吗？如果会，那么原因是啥？

先看一下[ThreadLocal的官方API](https://docs.oracle.com/en/java/javase/12/docs/api/java.base/java/lang/ThreadLocal.html)解释为：

> 该类提供了线程局部 (thread-local) 变量。这些变量不同于它们的普通对应物，因为访问某个变量（通过其 get 或 set 方法）的每个线程都有自己的局部变量，它独立于变量的初始化副本[原文：These variables differ from their normal counterparts in that each thread that accesses one (via its get or set method) has its own, independently initialized copy of the variable.]。ThreadLocal 实例通常是类中的 private static 字段，它们希望将状态与某一个线程（例如，用户 ID 或事务 ID）相关联。

大概的意思有两点：

* <font color=DeepPink>**ThreadLocal提供了一种访问某个变量的特殊方式：访问到的变量属于当前线程，即保证每个线程的变量不一样，而同一个线程在任何地方拿到的变量都是一致的，这就是所谓的线程隔离。**</font>
* <font color=DeepPink>**如果要使用ThreadLocal，通常定义为private static类型，在我看来最好是定义为private static final类型。**</font>

看一段代码：
```
// 代码来自：
// http://tutorials.jenkov.com/java-concurrency/threadlocal.html
public class ThreadLocalExample {
    public static class MyRunnable implements Runnable {

        private ThreadLocal<Integer> threadLocal = new ThreadLocal<Integer>();

        @Override
        public void run() {
            //注意这里 set的值是run函数的内部变量，如果是MyRunnable的全局变量
            //则无法起到线程隔离的作用
            threadLocal.set((int) (Math.random() * 100D));
            try {
                //sleep两秒的作用是让thread2 set操作在thread1的输出之前执行
                //如果线程之间是共用threadLocal，则thread2 set操作会覆盖掉thread1的set操作
                //从而两者的输出都是thread2 set的值
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                System.out.println(e);
            }
            System.out.println(threadLocal.get());
        }
    }

    public static void main(String[] args) throws InterruptedException {
        MyRunnable sharedRunnableInstance = new MyRunnable();

        Thread thread1 = new Thread(sharedRunnableInstance);
        Thread thread2 = new Thread(sharedRunnableInstance);

        thread1.start();
        thread2.start();

        thread1.join(); //wait for thread 1 to terminate
        thread2.join(); //wait for thread 2 to terminate
    }
}
```
输出结果：
```
thread1 start
thread2 start
38
thread1 join
78
thread2 join
```
MyRunnable run中sleep两秒的作用是让thread2 set操作在thread1的输出之前执行，如果线程之间是共用threadLocal，则thread2 set操作会覆盖掉thread1的set操作，两者的输出都是thread2 set的值，从而输出的应该是同一个值。

但从代码执行结果来看，thread1、thread2的threadLocal是不同的，也就是实现了线程隔离。


# ThreadLocal实例在线程间是如何独立的？
看一眼ThreadLocal set方法：
```
public void set(T value) {
    //currentThread是个native方法，会返回对当前执行线程对象的引用。
    Thread t = Thread.currentThread();
    //getMap 返回线程自身的threadLocals
    ThreadLocalMap map = getMap(t);
    if (map != null) {
        //把value set到线程自身的ThreadLocalMap中了
        map.set(this, value);
    } else {
        //线程自身的ThreadLocalMap未初始化，则先初始化，再set
        createMap(t, value);
    }
}
ThreadLocalMap getMap(Thread t) {
    return t.threadLocals;
}
//Thread类中
//ThreadLocalMapset的set方法未执行深拷贝，需要注意传递值的类型
ThreadLocal.ThreadLocalMap threadLocals = null;
```
从代码中可以看到，在set的时候，会根据Thread对象的引用来将值添加到各自线程中。但set的值value还是同一个对象,既然传递的是同一个对象，那就涉及到另一个问题：参数值传递、引用传递的问题了。

## 基本类型
```
public class ThreadLocalExample {
    public static class MyRunnable implements Runnable {

        private ThreadLocal<Object> threadLocal = new ThreadLocal<>();

        // MyRunnable 全局变量
        int random;

        @Override
        public void run() {
            random = (int) (Math.random() * 100D);
            threadLocal.set(random);
            try {
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                System.out.println(e);
            }

            System.out.println(threadLocal.get());
        }
    }

    public static void main(String[] args) throws InterruptedException {
        MyRunnable sharedRunnableInstance = new MyRunnable();

        Thread thread1 = new Thread(sharedRunnableInstance);
        Thread thread2 = new Thread(sharedRunnableInstance);

        thread1.start();
        System.out.println("thread1 start");
        thread2.start();
        System.out.println("thread2 start");

        thread1.join(); //wait for thread 1 to terminate
        System.out.println("thread1 join");
        thread2.join(); //wait for thread 2 to terminate
        System.out.println("thread2 join");
    }
}
```
输出结果：
```
thread1 start
thread2 start
//两个值不同
16
thread1 join
75
thread2 join
```

从输出可以看出两者隔离了。

## 引用类型

### 全局引用
```
public class ThreadLocalExample {
    public static class MyRunnable implements Runnable {

        private ThreadLocal<Object> threadLocal = new ThreadLocal<>();

        // MyRunnable 全局变量
        Obj obj = new Obj();

        @Override
        public void run() {
            obj.value = (int) (Math.random() * 100D);
            threadLocal.set(obj);
            try {
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                System.out.println(e);
            }

            System.out.println(((Obj) threadLocal.get()).value);
        }

        class Obj {
            int value;
        }
    }

    public static void main(String[] args) throws InterruptedException {
        MyRunnable sharedRunnableInstance = new MyRunnable();

        Thread thread1 = new Thread(sharedRunnableInstance);
        Thread thread2 = new Thread(sharedRunnableInstance);

        thread1.start();
        System.out.println("thread1 start");
        thread2.start();
        System.out.println("thread2 start");

        thread1.join(); //wait for thread 1 to terminate
        System.out.println("thread1 join");
        thread2.join(); //wait for thread 2 to terminate
        System.out.println("thread2 join");
    }
}
```
输出结果：
```
thread1 start
thread2 start
//两个值相同
36
36
thread1 join
thread2 join
```
从输出结果来看，当set操作的值是MyRunnable的全局变量，并且是引用类型的时候，无法起到隔离的作用。

### 局部引用
```
public class ThreadLocalExample {
    public static class MyRunnable implements Runnable {

        private ThreadLocal<Object> threadLocal = new ThreadLocal<>();

        //Obj obj = new Obj();
        @Override
        public void run() {
            Obj obj = new Obj();
            obj.value = (int) (Math.random() * 100D);
            threadLocal.set(obj);
            try {
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                System.out.println(e);
            }

            System.out.println(((Obj) threadLocal.get()).value);
        }

        class Obj {
            int value;
        }
    }

    public static void main(String[] args) throws InterruptedException {
        MyRunnable sharedRunnableInstance = new MyRunnable();

        Thread thread1 = new Thread(sharedRunnableInstance);
        Thread thread2 = new Thread(sharedRunnableInstance);

        thread1.start();
        System.out.println("thread1 start");
        thread2.start();
        System.out.println("thread2 start");

        thread1.join(); //wait for thread 1 to terminate
        System.out.println("thread1 join");
        thread2.join(); //wait for thread 2 to terminate
        System.out.println("thread2 join");
    }
}
```
输出结果：
```
thread1 start
thread2 start
//两个值不同
12
19
thread1 join
thread2 join
```
从输出结果看，局部引用，可以相互隔离。

<font color=DeepPink>**到这里可以看出ThreadLocal，只是把set值或引用绑定到了当前线程，但却没有进行相应的深拷贝，所以ThreadLocal要想做的线程隔离，必须是基本类型或者run的局部变量。**</font>

# ThreadLocal OOM ？
看一下ThreadLocalMap内部Entry：
```
static class Entry extends WeakReference<ThreadLocal<?>> {
    /** The value associated with this ThreadLocal. */
    Object value;

    Entry(ThreadLocal<?> k, Object v) {
        super(k);
        value = v;
    }
}
```
从代码中看到，Entry继承了WeakReference，并将ThreadLocal设置为了WeakReference，value设置为强引用。也就是：当没有强引用指向ThreadLocal变量时，它可被回收。

但是，还有一个问题：<font color=DeepPink>**ThreadLocalMap维护ThreadLocal变量与具体实例的映射，当ThreadLocal变量被回收后，该映射的key变为 null，而该Entry还是在ThreadLocalMap中，从而这些无法清理的Entry，会造成内存泄漏。**</font>

> ThreadLocal自带的remove、set方法，都无法处理ThreadLocal自身为null的情况，因为代码中都直接取ThreadLocal的threadLocalHashCode属性了，所以如果ThreadLocal自身已经是null，这时调用remove、set会报空指针异常（java.lang.NullPointerException）的。

所以，在使用ThreadLocal的时候，在使用完毕记得remove（remove方法会将Entry的value及Entry自身设置为null并进行清理）。

JDK 12 ThreadLocal代码地址：
https://github.com/jiankunking/openjdk12/blob/master/src/java.base/share/classes/java/lang/ThreadLocal.java
