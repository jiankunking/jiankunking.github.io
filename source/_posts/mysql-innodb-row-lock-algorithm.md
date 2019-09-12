---
title: MySQL InnoDB存储引擎：行锁的3种算法
categories:
  - MySQL
tags:
  - MySQL
  - InnoDB
abbrlink: 7999
date: 2018-10-17 08:17:32
---
# 行锁的三种算法
InnoDB存储引擎有3种行锁的算法，其分别是：
* Record Lock：单个行记录上的范围
* <font color=DeepPink>**Gap Lock：间隙锁，锁定一个范围，但不包含记录本身**</font>
* <font color=DeepPink>**Next-Key Lock：Gap Lock + Record Lock，锁定一个范围，并且锁定记录本身**</font>

Record Lock总是会锁住索引记录，如果InnoDB存储引擎建立的时候没有设置任何一个索引，这时InnoDB存储引擎会使用隐式的主键来进行锁定。

<font color=DeepPink>**Next-Key Lock是结合了Gap Lock和Record Lock的一种锁定算法，在Next-Key Lock算法下，innodb对于行的查询都是采用这种锁定算法。**</font>例如一个索引有9,11,13,20这4个值，那么该索引可能被Next-Key Locking的范围为（左开右闭 ）：
(- &，9]
(9,11]
(13,20]
(20,+ &)

采用Next-Key Lock的锁定技术称为Next-Key Locking。这种设计的目的是为了解决幻读（Phantom Problem）。利用这种锁定技术，锁定的不是单个值，而是一个范围。

>当查询的索引含有唯一属性时，innodb存储引擎会对Next-Key Lock进行优化，将其降级为Record Lock，即锁住索引记录本身，而不再是范围。
对于唯一索引，其加上的是Record Lock，仅锁住记录本身。但也有特别情况，那就是唯一索引由多个列组成，而查询仅是查找多个唯一索引列中的其中一个，那么加锁的情况依然是Next-key lock。

```
DROP TABLE
IF EXISTS t;

CREATE TABLE t (a INT PRIMARY KEY);

INSERT INTO t
VALUES
	(1),
	(2),
	(5);
```
![](/images/mysql-innodb-row-lock-algorithm/唯一索引的锁定示例.png)
表t中共有1、2、5三个值。在上面的例子中，在会话A中首先对a=5进行X锁定。而由于a是主键且唯一，因此锁定的仅是5这个值，而不是(2,5)这个范围，这样在会话B中插入值4而不会阻塞，可以立即插入并返回。即锁定由Next-Key Lock算法降级为了Record Lock，从而提高应用的并发性。正如前面所介绍的，<font color=DeepPink>**Next-Key降级为Record Lock仅在查询的列是唯一索引的情况下。若是辅助索引，则情况会完全不同。**</font>同样，首先根据如下代码创建测试表z：
```
CREATE TABLE Z (
	a INT,
	b INT,
	PRIMARY KEY (a),
	KEY (b)
);

INSERT INTO Z
VALUES
	(1, 1),
	(3, 1),
	(5, 3),
	(7, 6),
	(10, 8);
```
表z的列b是辅助索引，若在**会话A**中执行下面的SQL语句：
```
SELECT * FROM Z WHERE b=3 FOR UPDATE;
```
很明显，这时SQL语句通过索引列b进行查询，因此其使用传统的Next-Key Locking技术加锁，并且由于**有两个索引，其需要分别进行锁定**。**对于聚集索引，其仅对列a等于5的索引加上Record Lock。而对于辅助索引，其加上的是Next-Key Locking，锁定的范围是(1,3)**,特别需要注意的是，<font color=DeepPink>**InnoDB存储引擎会对辅助索引下一个键值加上gap lock，即还有一个辅助索引范围为(3,6)的锁**</font>。 因此，若在新**会话B**中运行下面的SQL语句，都会被阻塞：
```
SELECT * FROM Z WHERE a=5 LOCK IN SHARE MODE;
INSERT INTO Z SELECT 4,2;
INSERT INTO Z SELECT 6,5;
```
第一个SQL语句不能执行，因为在会话A中执行的SQL语句已经聚集索引中列a=5的值加上X锁，因此执行会被阻塞。第二个SQL语句，主键插入4，没有问题，但是插入的辅助索引值2在锁定的范围（1，3）中因此执行同样会被阻塞。第三个SQL语句，插入的主键6没有被锁定，5也不在范围（1，3）之间。但插入的值5在另一个锁定范围（3，6）中，故同样需要等待。而下面的SQL语句，不会被阻塞，可以立即执行：
```
INSERT INTO Z SELECT 8,6;
INSERT INTO Z SEELCT 2,0;
INSERT INTO Z SELECT 6,7;
```
从上面的例子中可以看到，<font color=DeepPink>**Gap Lock的作用是为了阻止多个事务将记录插入到同一个范围内，而这会导致Phantom Problem问题的产生。**</font> 例如在上面的例子中，会话A中用户已经锁定了b=3的记录。若此时没有Gap Lock锁定（3，6），那么用户可以插入索引b列为3的记录，这会导致会话A中的用户再次执行同样查询时会返回不同的记录，导致Phantom Problem问题的产生。

用户可以通过以下两种方式来显式地关闭Gap Lock：
* 将事务的隔离级别设置为READ COMMITTED
* 将参数innodb_locks_unsafe_for_binlog设置为1

在上述的配置下，除了外键约束和唯一性检查依然需要的Gap Lock，其余情况仅使用Record Lock进行锁定。但需要牢记的是，上述设置破坏了事务的隔离性，并且对于replication，可能会导致主从数据的不一致。此外，从性能上来看，READ COMMITTED也不会优于默认的事务隔离级别READ REPEATABLE。

在InnoDB存储引擎中，对于INSERT的操作，其会检查插入记录的下一条记录是否被锁定，若已被锁定，则不允许查询。对于上面的例子，会话A已经锁定了表z中b=3的记录，即已经锁定了（1，3）的范围，这时若在其他会话中进行如下的插入同样会导致阻塞：
```
INSERT INTO Z SELECT 2,2;
```
因为在辅助索引列b上插入值为2的记录时，会监测到下一个记录3已经被索引。而将插入修改为如下的值，可以立即执行：
```
INSERT INTO Z SELECT 2,0;
```
> 最后再次提醒的是，对于唯一键值的锁定,Next-Key Lock降级为Record Lock仅存在于查询所有的唯一索引一列。若唯一索引由多个列组成，而查询是查找多个唯一索引列中的其中一个，那么查询其实是range类型查询，而不是point类型查询故InnoDB存储引擎依然使用Next-Key Lock进行锁定。

# 解决 Phantom Problem

在默认的事务隔离级别下，即REPEATABLE READ下，InnoDB存储引擎采用
Next-Key Locking机制来避免Phantom Problem (幻像问题）。这点可能不同于与其他的数据库，如Oracle数据库，因为其可能需要在SERIALIZABLE的事务隔离级别下才能解决 Phantom Problem。

**Phantom Problem是指在<font color=DeepPink>**同一事务**</font>下，连续执行两次同样的SQL语句可能导致不同的结果，第二次的SQL语句可能会返回之前不存在的行。**

下面将演示这个例子，使用前一小节所创建的表t。表t由1、2、5这三个值组成：
```
DROP TABLE
IF EXISTS t;

CREATE TABLE t (a INT PRIMARY KEY);

INSERT INTO t
VALUES
	(1),
	(2),
	(5);
```

若这时事务T1执行如下的SQL语句:
```
SELECT * FROM t WHERE a> 2 FOR UPDATE;
```
注意这时事务T1并没有进行提交操作，上述应该返回5这个结果。若与此同时,另一个事务T2插入了 4这个值，并且数据库允许该操作，那么事务T1再次执行上述SQL语句会得到结果4和5。这与第一次得到的结果不同，违反了事务的隔离性，即当前事务能够看到其他事务的结果。其过程如表6-13所示：
![](/images/mysql-innodb-row-lock-algorithm/幻读问题演示.png)
InnoDB存储引擎采用Next-Key Locking的算法避免Phantom Problem。对于上述的SQL语句SELECT * FROM t WHERE a>2 FOR UPDATE,其锁住的不是5这单个值，而是对（2, +〇〇)这个范围加了 X锁。因此任何对于这个范围的插入都是不被允许的，从而避免 Phantom Problem。

InnoDB存储引擎默认的事务隔离级别是REPEATABLE READ,在该隔离级别下,
其采用Next-Key Locking的方式来加锁。而在事务隔离级别READ COMMITTED下,其仅采用Record Lock，因此在上述的示例中，会话A需要将事务的隔离级别设置为READ COMMITTED。

此外，<font color=DeepPink>**用户可以通过InnoDB存储引擎的Next-Key Locking机制在应用层面实现唯一性的检查。**</font> 例如：
```
SELECT * FROM table WHERE col=xxx LOCK IN SHARE MODE;
If not found any row:
# unique for insert value
INSERT INTO table VALUES (...);
```
如果用户通过索引査询一个值，并对该行加上一个SLock，那么即使査询的值不在，其锁定的也是一个范围，因此若没有返回任何行，那么新插人的值一定是唯一的。也许有读者会有疑问，如果在进行第一步SELECT •••LOCK IN SHARE MODE操作时，有多个事务并发操作，那么这种唯一性检査机制是否存在问题。其实并不会，因为这时会导致死锁，只有一个事务的插人操作会成功，而其余的事务会抛出死锁的错误，如表6-14所示。
![](/images/mysql-innodb-row-lock-algorithm/唯一性检查.png)