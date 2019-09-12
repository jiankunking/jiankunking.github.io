---
layout: w
title: Java ForkJoin 解析
date: 2019-08-10 10:20:56
categories:
  - Java
tags:
  - Java
  - ForkJoin
  - JUC
  - 原创
---

> 本文主要想了解两个地方：如何窃取任务、task如何等待（join）
代码基于 OpenJDK 12

<!-- more -->

# 窃取算法（work-stealing）

从<a href="/attachments/ForkJoin-Paper-DougLea.pdf" target="_blank">ForkJoin-Paper-DougLea</a>中可以看出:
* 每个队列创建一个单独的线程来执行队列里的任务，线程和队列一一对应。
* 队列使用的是双端队列，支持LIFO、FIFO。
* 子任务会被放到线程（不一定是当前线程）的队列中。
* 工作线程按照LIFO的顺序处理自己队列中数据。
* 当一个工作线程处理完自己队列中数据的时候，会随机挑选一个工作线程，并“窃取”的该工作线程队列队尾的task。

![](/images/java-forkjoin/steal.png)

到了这里就可以知道，窃取任务从其他线程队列的尾部窃取的了。

## 窃取算法优缺点

工作窃取算法的优点：充分利用线程进行并行计算，减少了线程间的竞争。
工作窃取算法的缺点：在某些情况下还是存在竞争，比如双端队列里只有一个任务时。并且该算法会消耗了更多的系统资源，比如创建多个线程和多个双端队列。

# Task 等待（join）

Join方法的主要作用是阻塞当前线程并等待获取结果。具体代码如下：
```
public final V join() {
    int s;
    if (((s = doJoin()) & ABNORMAL) != 0)
        reportException(s);
    return getRawResult();
}
```
首先，它调用了doJoin()方法，通过doJoin()方法得到当前任务的状态来判断返回什么结果，任务状态有4种：已完成（NORMAL）、被取消（CANCELLED）、信号（SIGNAL）和出现异常（EXCEPTIONAL）。
* 如果任务状态是已完成，则直接返回任务结果。
* 如果任务状态是被取消，则直接抛出CancellationException。
* 如果任务状态是抛出异常，则直接抛出对应的异常。

让我们再来分析一下doJoin()方法的实现代码:
```
/**
 * Implementation for join, get, quietlyJoin. Directly handles
 * only cases of already-completed, external wait, and
 * unfork+exec.  Others are relayed to ForkJoinPool.awaitJoin.
 *
 * @return status upon completion
 */
private int doJoin() {
    int s; Thread t; ForkJoinWorkerThread wt; ForkJoinPool.WorkQueue w;
    return 
        //已完成,返回status
    	(s = status) < 0 ? s :
    	//未完成,如果当前线程是ForkJoinWorkerThread,从该线程中取出workQueue,并尝试将
        //当前task出队然后执行,执行的结果是完成则返回状态,否则使用当线程池所在的ForkJoinPool的awaitJoin方法等待
        ((t = Thread.currentThread()) instanceof ForkJoinWorkerThread) ?
        (w = (wt = (ForkJoinWorkerThread)t).workQueue).tryUnpush(this) && (s = doExec()) < 0 ? s : wt.pool.awaitJoin(w, this, 0L) :
        //当前线程不是ForkJoinWorkerThread,调用externalAwaitDone方法
        //externalAwaitDone: Blocks a non-worker-thread until completion.
        externalAwaitDone();
}
/**
 * Pops the given task only if it is at the current top.
 */
final boolean tryUnpush(ForkJoinTask<?> task) {
    boolean popped = false;
    int s, cap; ForkJoinTask<?>[] a;
    if ((a = array) != null && (cap = a.length) > 0 &&
        (s = top) != base &&
        (popped = QA.compareAndSet(a, (cap - 1) & --s, task, null)))
        TOP.setOpaque(this, s);
    return popped;
}
/**
 * Primary execution method for stolen tasks. Unless done, calls
 * exec and records status if completed, but doesn't wait for
 * completion otherwise.
 *
 * @return status on exit from this method
*/
final int doExec() {
    int s; boolean completed;
    // 仅未完成的任务会运行,其他情况会忽略.
    if ((s = status) >= 0) {
        try {
            //exec是abstract方法
            //调用ForkJoinTask子类中exec
            completed = exec();
        } catch (Throwable rex) {
            completed = false;
            s = setExceptionalCompletion(rex);
        }
        if (completed)
            s = setDone();
        }
        return s;
}
```
在doJoin()方法里，首先通过查看任务的状态，看任务是否已经执行完成，如果执行完成，则直接返回任务状态；如果没有执行完，则从任务队列中取出任务并执行。如果任务顺利执行完成，则设置任务状态为NORMAL，如果出现异常，则记录异常，并将任务状态设置为EXCEPTIONAL。