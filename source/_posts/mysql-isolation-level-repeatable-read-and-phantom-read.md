---
title: MySQL 可重复读隔离级别与幻读
categories:
  - MySQL
tags:
  - MySQL
  - InnoDB
  - 读书笔记
abbrlink: 9561
date: 2022-03-14 08:31:09
---

> 在MySQL可重复读的隔离级别下，能很大程度上避免幻读，而不能完全避免。

<!-- more -->

# 场景复现
环境信息：
```
MySQL版本：5.7.23-log
隔离级别：REPEATABLE-READ
```

测试数据：
```
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for app_record_lock_test
-- ----------------------------
DROP TABLE IF EXISTS `app_record_lock_test`;
CREATE TABLE `app_record_lock_test`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `hash` bigint(20) NOT NULL DEFAULT 0,
  `cluster` varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `namespace` varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL DEFAULT '',
  `service` varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL DEFAULT '',
  `pod` varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL DEFAULT '',
  `created_at` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `cluster_hash`(`cluster`, `hash`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 120236026 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of app_record_lock_test
-- ----------------------------
INSERT INTO `app_record_lock_test` VALUES (120236012, 1, 'cluster', 'namespace', 'service', 'pod', '2022-02-18 14:14:59', '2022-02-09 10:00:00');
INSERT INTO `app_record_lock_test` VALUES (120236013, 2, 'cluster', 'namespace', 'service', 'pod', '2022-02-18 14:14:59', '2022-02-09 10:00:00');
INSERT INTO `app_record_lock_test` VALUES (120236014, 3, 'cluster', 'namespace', 'service', 'pod', '2022-02-18 14:14:59', '2022-02-09 10:00:00');

SET FOREIGN_KEY_CHECKS = 1;

```

复现流程：

| 时间 | 会话A(T1) | 会话B(T2) |
| :-----:| :----: | :----: |
| 1 | START TRANSACTION; |   |
| 2 |   | START TRANSACTION; |
| 3 | SELECT * FROM app_record_lock_test WHERE cluster = 'cluster1'; | |
| 4 |  | INSERT INTO app_record_lock_test (HASH, cluster, namespace, service, pod, updated_at)VALUES(1, 'cluster1', 'namespace', 'service', 'pod', '2022-02-09 10:00:00') ; |
| 5 |  | COMMIT; |
| 6 | update app_record_lock_test set namespace= 'namespace2' where cluster = 'cluster1'; |  |
| 7 | SELECT * FROM app_record_lock_test WHERE cluster = 'cluster1'; |  |
| 8 | COMMIT; |  |

在第3步执行查询cluster = 'cluster1'时，查询到的结果是空。
但会话B执行完第4 5之后，再在会话A中执行第6步，就不会等待或者报错了，也就是可以正常执行，在第7步的查询中，也能查到该数据了。

> 注意：会话A能正常更新、查询的前提是：会话B事务已提交。
> 注意：会话A如果不执行更新（也就是第6步），那么在查询的时候，还是查询不到记录的。

# 原因分析

对于使用InnoDB存储引擎的表来说，它的聚簇索引记录中都包含下面这两个必要的隐藏列（row_id并不是必要的：在创建的表中有主键时，或者有不允许为NULL的UNIQUE键时，都不会包含row_id列）.
• trx_id：一个事务每次对某条聚簇索引记录进行改动时，都会把该事务的事务id赋值给trx_id隐藏列.
• roll_pointer：每次对某条聚族索引记录进行改动时，都会把旧的版本写入到undo日志中.这个隐藏列就相当于一个指针，可以通过它找到该记录修改前的信息.

在REPEATABLE READ隔离级别下，T1第一次执行普通的SELECT语句时生成了一个ReadView,之后T2向hero表中新插入一条记录并提交.ReadView并不能阻止T1执行UPDATE或者DELETE语句来改动这个新插入的记录（由于T2已经提交，因此改动该记录并不会造成阻塞），但是这样一来，这条新记录的trx_id隐藏列的值就变成了T1的事务id,之后T1再使用普通的SELECT语句去查询这条记录时就可以看到这条记录了，也就可以把这条记录返回给客户端.因为这个特殊现象的存在，我们也可以认为InnoDB中的MVCC并不能完全禁止幻读。

> 也就是说，T1将新插入数据的事务号修改的小于等于ReadView对应的事务版本号了，相当于扩充了ReadView的范围，从而导致在下一次查询的时候能查询出该记录。