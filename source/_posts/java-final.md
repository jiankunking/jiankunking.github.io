---
title: Java Final
categories:
  - Java
tags:
  - Final
  - JDK
  - Java
  - 原创
abbrlink: 20523
date: 2019-10-21 14:03:08
---

> Java Final 内存语义

<!-- more -->

# 读
初次读对象引用与初次读该对象包含的final域，这两个操作之间存在间接依赖关系。由于编译器遵守间接依赖关系，因此编译器不会重排序这两个操作。大多数处理器也会遵守间接依赖，也不会重排序这两个操作。但有少数处理器允许对存在间接依赖关系的操作做重排序（比如alpha处理器），这个规则就是专门用来针对这种处理器的。

# 写
在引用变量为任意线程可见之前，该引用变量指向的对象的final域已经在构造函数中被正确初始化过了。其实，要得到这个效果，还需要一个保证：在构造函数内部，不能让这个被构造对象的引用为其他线程所见，也就是对象引用不能在构造函数中“逸出”。

# 拓展

[final-keyword-and-jvm-memory-impact](https://dzone.com/articles/final-keyword-and-jvm-memory-impact)

在线JSR：<a href="/attachments/jsr133.pdf" target="_blank">JSR 133:3.2 Final Fields（第九页）</a>