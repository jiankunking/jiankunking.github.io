---
title: ReentrantLock 重入与重试
categories:
  - JUC
tags:
  - JUC
  - AQS
  - JDK
  - Java
  - ReentrantLock
  - 原创
abbrlink: 30602
date: 2020-08-12 09:12:40
---
>Java JDK 12 ReentrantLock

<!-- more -->

今天突然想起了个问题：
1、ReentrantLock在获取锁的时候，会不会自旋？如果自旋的话，会自旋多少次？
2、ReentrantLock可重入次数会有上限控制吗？

1、看一下ReentrantLock中锁的实现：

非公平锁：
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
```

公平锁：
```
         /**
         * Fair version of tryAcquire.  Don't grant access unless
         * recursive call or no waiters or is first.
         */
        @ReservedStackAccess
        protected final boolean tryAcquire(int acquires) {
            final Thread current = Thread.currentThread();
            int c = getState();
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
    }
```

从代码中可以看到不管是公平锁还是非公平锁再获取不到锁的时候，都没有自旋。区别在于非公平锁在获取锁的时候，会先获取一下锁，而公平锁会先判断队列中有没有。

同时在代码中也没有看到获取不到锁就入队，难道会在外面自旋重试？看下AbstractQueuedSynchronizer中代码：

```
     /**
     * Acquires in exclusive mode, ignoring interrupts.  Implemented
     * by invoking at least once {@link #tryAcquire},
     * returning on success.  Otherwise the thread is queued, possibly
     * repeatedly blocking and unblocking, invoking {@link
     * #tryAcquire} until success.  This method can be used
     * to implement method {@link Lock#lock}.
     *
     * @param arg the acquire argument.  This value is conveyed to
     *        {@link #tryAcquire} but is otherwise uninterpreted and
     *        can represent anything you like.
     */
    public final void acquire(int arg) {
        if (!tryAcquire(arg) &&
            acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
            selfInterrupt();
    }
```

从这里可以看到获取不到锁，就直接入队了。


2、因为AQS中的state使用int类型存储，最大到2^31-1。

