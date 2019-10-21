---
title: MySQL InnoDB存储引擎：一致性锁定读
categories:
  - MySQL
tags:
  - MySQL
  - InnoDB
  - 读书笔记
abbrlink: 10876
date: 2018-10-11 21:22:47
---

本文整理自：《MySQL技术内幕:InnoDB存储引擎》 第二版 

作者：姜承尧

出版时间：2013-05

<!-- more -->

在[前一小节](https://www.jiankunking.com/mysql-innodb-consistent-nonlocking-read.html)中讲到，在默认配置下，即事务的隔离级别为 REPEATABLE READ 模式下， InnoDB 存储引擎的 SELECT 操作使用一致性非锁定读。但是在某些情况下，用户需要显式地对数据库读取操作进行加锁以保证数据逻辑的一致性。而这要求数据库支持加锁语句，即使是对于SELECT的只读操作。InnoDB存储引擎对于SELECT语句支持两种一致性的锁定读（locking read)操作：
```
SELECT......FOR UPDATE
SELECT......LOCK IN SHARE MODE
```
<font color=DeepPink>**SELECT…FOR UPDATE对读取的行记录加一个X锁，其他事务不能对已锁定的行加上任何锁。**</font>
<font color=DeepPink>**SELECT…LOCK IN SHARE MODE对读取的行记录加一个S锁，其他事务可以向被锁定的行加S锁，但是如果加X锁，则会被阻塞。**</font>

对于一致性非锁定读，即使读取的行已被执行了 SELECT…FOR UPDATE,也是可以进行读取的，这和之前讨论的情况一样。此外，SELECT…FOR UPDATE, SELECT…LOCK IN SHARE MODE必须在一个事务中，当事务提交了，锁也就释放了。因此在使用上述两句SELECT锁定语句时，务必加上BEGIN,START TRANSACTION 或者SET AUTOCOMMIT =0 。