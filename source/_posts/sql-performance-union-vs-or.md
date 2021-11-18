---
title: SQL UNION vs OR 性能
categories:
  - MySQL
tags:
  - MySQL
  - UNION
  - OR
  - 原创
abbrlink: 5854
date: 2019-09-23 09:25:44
---

本文整理自：stackoverflow
地址：
https://stackoverflow.com/questions/13750475/sql-performance-union-vs-or

<!-- more -->

翻译自Bill Karwin回答：

要么你读的那篇文章用了一个不好的例子，要么你误解了他们的观点。
```
select username from users where company = 'bbc' or company = 'itv';
```
等价于：
```
select username from users where company IN ('bbc', 'itv');
```
在这个查询中MySQL会使用company上的索引。不需要改成UNION。

更棘手的情况是，OR条件涉及两个不同的列。
```
select username from users where company = 'bbc' or city = 'London';
```
假设company列和city列都有一个独立的索引。MySQL通常在一个给定的查询中每个表只使用一个索引，那么应该使用哪个索引呢?如果它使用company上的索引，它仍然必须执行表扫描，以找到伦敦所在的行。如果它使用city上的索引，则必须对company为bbc的行进行表扫描。

UNION 解决方案适用于这种情况。
```
select username from users where company = 'bbc' 
union
select username from users where city = 'London';
```
这样的话每个子查询都可以使用索引进行搜索,然后再将子查询的结果合并在一起。

> union ? union all ? 取决于需求及where过滤后的数据量
> 对于索引列来最好使用union all，因复杂的查询【包含运算等】将使or、in放弃索引而全表扫描，除非你能确定or、in会使用索引。
> 对于只有非索引字段来说你就老老实实的用or或者in，因为 非索引字段本来要全表扫描而union all 只成倍增加表扫描的次数。