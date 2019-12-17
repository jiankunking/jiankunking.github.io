---
title: Java Synchronized 解析
date: 2019-12-14 09:52:31
categories:
  - Java
tags:
  - Synchronized
  - Java
  - 原创
abbrlink: 61490
---

# Synchronized Methods

代码示例：

```
public class SynchronizedCounter {
    private int c = 0;

    public synchronized void increment() {
        c++;
    }

    public synchronized void decrement() {
        c--;
    }

    public synchronized int value() {
        return c;
    }
}
```
查看编译后代码命令：
```
javap -c SynchronizedCounter.class
```

编译后内容：
```
Compiled from "SynchronizedCounter.java"
public class sy.SynchronizedCounter {
  public sy.SynchronizedCounter();
    Code:
       0: aload_0
       1: invokespecial #1                  // Method java/lang/Object."<init>":<>V
       4: aload_0
       5: iconst_0
       6: putfield      #7                  // Field c:I
       9: return

  public synchronized void increment();
    Code:
       0: aload_0
       1: dup
       2: getfield      #7                  // Field c:I
       5: iconst_1
       6: iadd
       7: putfield      #7                  // Field c:I
      10: return

  public synchronized void decrement();
    Code:
       0: aload_0
       1: dup
       2: getfield      #7                  // Field c:I
       5: iconst_1
       6: isub
       7: putfield      #7                  // Field c:I
      10: return

  public synchronized int value();
    Code:
       0: aload_0
       1: getfield      #7                  // Field c:I
       4: ireturn
}
```



