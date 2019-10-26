---
title: MySQL Explain
categories:
  - MySQL
tags:
  - MySQL
  - Explain
  - SQL
abbrlink: 26835
date: 2019-10-21 17:11:23
---

Explain SQL

<!-- more -->

语法：explain + SQL

参数：

|  名称   | 解释  |
|  ----  | ----  |
| type | system > const > eq_ref > ref > range > index > all（至少达到 range 级别，最好达到 ref 级别） |
| possible_keys  | 显示可能应用在这张表中的索引 |
| rows  | 扫描行数，越小越好 |

说明：
* consts 单表中最多只有一个匹配行（主键或者唯一索引），在优化阶段即可读取到数据。
* ref 指的是使用普通的索引（normal index）。
* range 对索引进行范围检索。

> 反例：explain 表的结果，type=index，索引物理文件全扫描，速度非常慢，这个 index 级别比 range还低，与全表扫描是小巫见大巫。

推荐阅读阿里巴巴开发手册MySQL部分：<a href="/attachments/阿里巴巴Java开发手册（华山版）.pdf" target="_blank">阿里巴巴Java开发手册（华山版）.pdf</a>