---
title: MySQL InnoDB存储引擎：一致性非锁定读
categories:
  - MySQL
tags:
  - MySQL
  - InnoDB
abbrlink: 31879
date: 2018-10-11 21:13:47
---
本文整理自：《MySQL技术内幕:InnoDB存储引擎》 第二版 作者：姜承尧

出版时间：2013-05

<!-- more -->

**一致性的非锁定行读（consistent nonlocking read）是指InnoDB存储引擎通过行多版本控制（multi versioning）的方式来读取当前执行时间数据库中行的数据。如果读取的行正在执行DELETE、UPDATE操作，这是读取操作不会因此而会等待行上锁的释放，相反，InnoDB会去读取行的一个快照数据。**

下图直观展示了一致性的非锁定行读：
![](/images/mysql-innodb-consistent-nonlocking-read/一致性的非锁定行读.png)

**之所以称其为非锁定读，因为不需要等待访问的行上X锁的释放。快照数据是指该行的之前版本的数据，该实现是通过undo段来完成。而undo段用来在此事务中回滚数据，因此快照数据本身是没有额外的开销。此外，读取快照数据是不需要上锁的，因为没有事务需要对历史的数据进行修改操作。**

可以看到，非锁定读机制极大地提髙了数据库的并发性。**在InnoDB存储引擎的默认设置下，这是默认的读取方式，即读取不会占用和等待表上的锁。但是在不同事务隔离级别下，读取的方式不同，并不是在每个事务隔离级别下都是采用非锁定的一致性读。此外，即使都是使用非锁定的一致性读，但是对于快照数据的定义也各不相同。**

通过图6-4可以知道，快照数据其实就是当前行数据之前的历史版本，每行记录可能有多个版本。就图6-4所显示的，**一个行记录可能有不止一个快照数据，一般称这种技术为行多版本技术。由此带来的并发控制，称之为多版本并发控制（MultiVersionConcurrencyControl MVCC）。**

在事务隔离级别READ COMMITTED和REPEATABLE READ(InnoDB存储引擎的默认事务隔离级别）下，InnoDB存储引擎使用非锁定的一致性读。然而，对于快照数据的定义却不相同。<font color=DeepPink>**在READ COMMITTED事务隔离级别下，对于快照数据，非一致性读总是读取被锁定行的最新一份快照数据。而在REPEATABLE READ事务隔离级别下，对于快照数据，非一致性读总是读取事务开始时的行数据版本（关键在于事务之间的隔离性）。**</font>来看下面的一个例子，首先在当前MySQL数据库的连接会话A中执行如下SQL语句：
```
# Session A
mysql> BEGIN;
Query OK, 0 rows affected (0.00 sec)

Sql> SELECT * FROM parent WHERE id =1;
+----+
| id |
+----+
| 1 |
+----+
1 row in set (0.00 sec)
```
会话A中已通过显式地执行命令BEGIN开启了一个事务，并读取了表parent中id为1的数据，但是事务并没有结束。与此同时，用户再开启另一个会话B，这样可以模拟并发的情况，然后对会话B做如下的操作：
```
mysql> BEGIN;
Query OK, 0 rows affected (0.00 sec)

mysql> UPDATE parent SET id=3 WHERE id=l;
Query OK, 1 row affected (0.00 sec)
Rows matched: 1 Changed: 1 warnings: 0
```
在会话B中将事务表parent中id为1的记录修改为id=3，但是事务同样没有提交，这样id=1的行其实加了一个X锁。这时如果在会话A中再次读取id为1的记录，根据InnoDB存储引擎的特性，即在READ COMMITTED和REPEATETABLE READ的事务隔离级别下会使用非锁定的一致性读。回到之前的会话A,接着上次未提交的事务，执行SQL语句SELECT * FROM parent WHERE id=1的操作，这时不管使用READ COMMITTED还是REPEATABLE READ的事务隔离级别，显示的数据应该都是：
```
mysql> SELECT FROM parent WHERE id =l;
+----+
| id |
+----+
| 1  |
+----+
1 row in set (0.00 sec)
```
由于当前id=1的数据被修改了1次，因此只有一个行版本的记录。接着，在会话B中提交上次的事务。
```
# Session B
mysql> commit
Query OK, 0 rows affected (0.01 sec)
```
在会话B提交事务后，这时在会话A中再运行SELECT * FROM parent WHERE id=1的SQL语句，在READ COMMITTED和REPEATABLE事务隔离级别下得到结果 就不一样了。对于READ COMMITTED的事务隔离级别，它总是读取行的最新版本，如果行被锁定了，则读取该行版本的最新一个快照（fresh snapshot）。在上述例子中，因为会话B已经提交了事务，所以READ COMMITTED事务隔离级别下会得到如下结果：
```
mysql>SELECT @@tx_isolation\G;
**************************** 1.row ****************************
@@tx_isolation: READ-COMMITTED
1 row in set (0.00 sec)

mysql> SELECT FROM parent WHERE id=1:
Empty set (0.00 sec)
```
而对于REPEATETABLE 的事务隔离级别，总是读取事务开始时的行数据。因此对于REPEATETABLE READ事务隔离级别,其得到的结果如下：
```
mysql> SELECT @@tx_isolation\G;
**************************** 1.row ****************************
@@tx_isolation: REPEATABLE-READ
1 row in set (0.00 sec)

mysql> SELECT FROM parent WHERE id=1;
+----+
| id |
+----+
| 1  |
+----+
1 row in set (0.00 sec)
```
下面将从时间的角度展现上述演示的示例过程，如表6-8所示。需要特别注意的是，对于READ COMMITTED 的事务隔离级别而言，从数据库理论的角度来看，其违反了事务ACID中的I的特性，即隔离性。
![](/images/mysql-innodb-consistent-nonlocking-read/表68.png)