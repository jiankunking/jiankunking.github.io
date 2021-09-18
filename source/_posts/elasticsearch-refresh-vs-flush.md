---
title: Elasticsearch Refresh vs Flush
categories:
  - ElasticSearch
tags:
  - ElasticSearch
  - Refresh
  - Flush
  - 原创
abbrlink: 23918
date: 2021-01-23 16:19:04
---

> Elasticsearch Refresh和Flush区别

<!-- more -->

# [Refresh](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-refresh.html)

使用refresh API显式刷新一个或多个索引。 如果请求以数据流为目标，则刷新该流的后台索引。<font color=DeepPink>**刷新使自上次刷新以来对索引执行的所有操作都可用于搜索。**</font>

<font color=DeepPink>**默认情况下，Elasticsearch会定期每秒刷新一次索引，但仅在最近30秒内收到搜索请求的索引上刷新。**</font>也可以使用index.refresh_interval设置更改此默认间隔。

刷新请求是同步的，并且在刷新操作完成之前不会返回响应。

# [Flush](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-flush.html#flush-api-desc)

通过刷新data stream或者index将当前仅存储在事务日志中的数据永久存储到Lucene索引中。当Elasticsearch重启时，会重放事务日志中未刷新到Lucene索引的数据，从而将Elasticsearch恢复到重启前的状态。

> 默认情况下，Elasticsearch使用内存启发式，以便根据需要自动触发刷新操作，以便清除内存。
> Elasticsearch automatically triggers flushes as needed, using heuristics that trade off the size of the unflushed transaction log against the cost of performing each flush.

<font color=DeepPink>**一旦一个操作被刷新，它就会永久存储在Lucene索引中。**</font>这意味着不需要在事务日志中维护它的额外副本，除非出于某些[其他原因而保留它](https://www.elastic.co/guide/en/elasticsearch/reference/current/index-modules-translog.html#index-modules-translog-retention)。事务日志由多个文件组成，称为generations，一旦不再需要生成文件，Elasticsearch将删除它们，释放磁盘空间。

使用flush API也可以在一个或多个索引上触发刷新，尽管用户很少需要直接调用这个API。如果在对一些文档建立索引之后调用flush API，那么成功的响应表明Elasticsearch已经flush了所有在调用flush API之前建立索引的文档。

translog的[Flush](https://www.elastic.co/guide/en/Elasticsearch/reference/current/indices-flush.html)是Elasticsearch在后台自动运行的。默认情况下Elasticsearch每隔5s会去检测要不要[Flush](https://www.elastic.co/guide/en/Elasticsearch/reference/current/indices-flush.html) translog，默认条件是:每30分钟主动进行一次[Flush](https://www.elastic.co/guide/en/Elasticsearch/reference/current/indices-flush.html#flush-api-desc)或者当translog文件大小大于512MB主动进行一次[Flush](https://www.elastic.co/guide/en/Elasticsearch/reference/current/indices-flush.html)。<font color=DeepPink>**默认配置下，每次index、bulk、delete、update完成的时候，会触发Flush translog到磁盘上,然后才返回200 OK。**</font>这个提高了数据安全性，但是会对写入的性能造成不小的影响。

在写入效率优先的情况下，可以在index template里设置如下参数：
```
"index.translog.durability":"async"(默认是request) 
"index.translog.sync_interval":30s (默认是5s)
```

# 小结

简而言之，_refresh用于使新文档在搜索时可见。
反过来，_flush用于在硬盘上持久化内存段。
_flush不会影响Elasticsearch中文档的可见性，因为搜索是在内存段中进行的，而_refresh会影响它们的可见性。