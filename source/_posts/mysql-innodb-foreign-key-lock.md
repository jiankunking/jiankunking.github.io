---
title: MySQL InnoDB存储引擎：外键与锁
abbrlink: 14775
date: 2018-10-17 08:23:17
categories:
  - MySQL
tags:
  - MySQL
  - InnoDB
  - 读书笔记
---
本文整理自：《MySQL技术内幕:InnoDB存储引擎》 第二版 

作者：姜承尧

出版时间：2013-05

<!-- more -->
外键主要用于引用完整性的约束检查<font color=DeepPink>**在InnoDB存储引擎中，对于一个外键列，如果没有显式地对这个列加索引，InnoDB存储引擎会自动对其加一个索引，因为这样可以避免表锁。**</font> 这比Oracle数据库做得好，Oracle数据库不会自动添加索引，用户必须自己手动添加，这也导致了Oracle数据库中可能产生死锁。

<font color=DeepPink>**对于外键值的插入或更新，首先需要检查父表中的记录，既SELECT父表。但是对于父表的SELECT操作，不是使用一致性非锁定读的方式，因为这会发生数据不一致的问题，因此这时使用的是SELECT…LOCK IN SHARE MODE方式，即主动对父表加一个S锁。**</font>如果这时父表上已经这样加X锁，子表上的操作会被阻塞，如下：
![](/images/mysql-innodb-foreign-key-lock/外键测试用例.png)
在上述的例子中，两个会话中的事务都没有进行COMMIT或ROLLBACK操作，而会话B的操作会被阻塞。这是因为 id为3的父表在会话 A中已经加了一个X锁，而此时在会话 B中用户又需要对父表中 id为3的行加一个 S锁，这时 INSERT的操作会被阻塞。设想如果访问父表时，使用的是一致性的非锁定读，这时Session B会读到父表有id=3的记录，可以进行插入操作。但是如果会话A对事务提交了，则父表中就不存在id为3的记录。数据在父、子表就会存在不一致的情况。
