---
title: Elasticsearch Breaker CircuitBreakingException Parent Data Too Large Real
  Usage
abbrlink: 34826
date: 2020-11-24 20:02:21
categories:
  - ElasticSearch
tags:
  - ElasticSearch
  - 原创
---

> indices.breaker.total.use_real_memory 引发的问题

<!-- more -->

最近业务日志es（7.6.2）集群，写入时经常返回以下异常：

```
2020-11-24T02:59:05.557085524Z {"type": "server", "timestamp": "2020-11-24T02:59:05,556Z", "level": "DEBUG", "component": "o.e.a.a.c.n.i.TransportNodesInfoAction", "cluster.name": "business-log", "node.name": "es-b-193", "message": "failed to execute on node [EKFLTB1jTrSbTHi80t8lDw]", "cluster.uuid": "ArYy-qmCTbCQTDUI8ogsBg", "node.id": "w8mHCBNORpa8P73ML3c1zg" ,
2020-11-24T02:59:05.557111874Z "stacktrace": ["org.elasticsearch.transport.RemoteTransportException: [es-b-194][127.0.0.1:9300][cluster:monitor/nodes/info[n]]",
2020-11-24T02:59:05.557116050Z "Caused by: org.elasticsearch.common.breaker.CircuitBreakingException: [parent] Data too large, data for [<transport_request>] would be [27684654388/25.7gb], which is larger than the limit of [26521423052/24.6gb], real usage: [27684652880/25.7gb], new bytes reserved: [1508/1.4kb], usages [request=0/0b, fielddata=19858/19.3kb, in_flight_requests=2805740/2.6mb, accounting=86606929/82.5mb]",
2020-11-24T02:59:05.557120478Z "at org.elasticsearch.indices.breaker.HierarchyCircuitBreakerService.checkParentLimit(HierarchyCircuitBreakerService.java:343) ~[elasticsearch-7.6.2.jar:7.6.2]",
2020-11-24T02:59:05.557123616Z "at org.elasticsearch.common.breaker.ChildMemoryCircuitBreaker.addEstimateBytesAndMaybeBreak(ChildMemoryCircuitBreaker.java:128) ~[elasticsearch-7.6.2.jar:7.6.2]",
2020-11-24T02:59:05.557126392Z "at org.elasticsearch.transport.InboundHandler.handleRequest(InboundHandler.java:171) [elasticsearch-7.6.2.jar:7.6.2]",
2020-11-24T02:59:05.557129043Z "at org.elasticsearch.transport.InboundHandler.messageReceived(InboundHandler.java:119) [elasticsearch-7.6.2.jar:7.6.2]",
2020-11-24T02:59:05.557131767Z "at org.elasticsearch.transport.InboundHandler.inboundMessage(InboundHandler.java:103) [elasticsearch-7.6.2.jar:7.6.2]",
2020-11-24T02:59:05.557134387Z "at org.elasticsearch.transport.TcpTransport.inboundMessage(TcpTransport.java:667) [elasticsearch-7.6.2.jar:7.6.2]",
2020-11-24T02:59:05.557137050Z "at org.elasticsearch.transport.netty4.Netty4MessageChannelHandler.channelRead(Netty4MessageChannelHandler.java:62) [transport-netty4-client-7.6.2.jar:7.6.2]",
2020-11-24T02:59:05.557139775Z "at io.netty.channel.AbstractChannelHandlerContext.invokeChannelRead(AbstractChannelHandlerContext.java:374) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557143378Z "at io.netty.channel.AbstractChannelHandlerContext.invokeChannelRead(AbstractChannelHandlerContext.java:360) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557146200Z "at io.netty.channel.AbstractChannelHandlerContext.fireChannelRead(AbstractChannelHandlerContext.java:352) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557157569Z "at io.netty.handler.codec.ByteToMessageDecoder.fireChannelRead(ByteToMessageDecoder.java:326) [netty-codec-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557160772Z "at io.netty.handler.codec.ByteToMessageDecoder.channelRead(ByteToMessageDecoder.java:300) [netty-codec-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557163614Z "at io.netty.channel.AbstractChannelHandlerContext.invokeChannelRead(AbstractChannelHandlerContext.java:374) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557166366Z "at io.netty.channel.AbstractChannelHandlerContext.invokeChannelRead(AbstractChannelHandlerContext.java:360) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557169060Z "at io.netty.channel.AbstractChannelHandlerContext.fireChannelRead(AbstractChannelHandlerContext.java:352) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557171799Z "at io.netty.handler.logging.LoggingHandler.channelRead(LoggingHandler.java:241) [netty-handler-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557174627Z "at io.netty.channel.AbstractChannelHandlerContext.invokeChannelRead(AbstractChannelHandlerContext.java:374) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557177412Z "at io.netty.channel.AbstractChannelHandlerContext.invokeChannelRead(AbstractChannelHandlerContext.java:360) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557180299Z "at io.netty.channel.AbstractChannelHandlerContext.fireChannelRead(AbstractChannelHandlerContext.java:352) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557182991Z "at io.netty.channel.DefaultChannelPipeline$HeadContext.channelRead(DefaultChannelPipeline.java:1422) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557185677Z "at io.netty.channel.AbstractChannelHandlerContext.invokeChannelRead(AbstractChannelHandlerContext.java:374) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557188907Z "at io.netty.channel.AbstractChannelHandlerContext.invokeChannelRead(AbstractChannelHandlerContext.java:360) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557191750Z "at io.netty.channel.DefaultChannelPipeline.fireChannelRead(DefaultChannelPipeline.java:931) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557194464Z "at io.netty.channel.nio.AbstractNioByteChannel$NioByteUnsafe.read(AbstractNioByteChannel.java:163) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557197166Z "at io.netty.channel.nio.NioEventLoop.processSelectedKey(NioEventLoop.java:700) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557199910Z "at io.netty.channel.nio.NioEventLoop.processSelectedKeysPlain(NioEventLoop.java:600) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557202599Z "at io.netty.channel.nio.NioEventLoop.processSelectedKeys(NioEventLoop.java:554) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557205278Z "at io.netty.channel.nio.NioEventLoop.run(NioEventLoop.java:514) [netty-transport-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557207911Z "at io.netty.util.concurrent.SingleThreadEventExecutor$6.run(SingleThreadEventExecutor.java:1050) [netty-common-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557214146Z "at io.netty.util.internal.ThreadExecutorMap$2.run(ThreadExecutorMap.java:74) [netty-common-4.1.43.Final.jar:4.1.43.Final]",
2020-11-24T02:59:05.557216961Z "at java.lang.Thread.run(Thread.java:830) [?:?]"] }
```

出现异常时，jvm.options配置如下：
```
## GC configuration
#-XX:+UseConcMarkSweepGC
#-XX:CMSInitiatingOccupancyFraction=75
#-XX:+UseCMSInitiatingOccupancyOnly

## G1GC Configuration
# NOTE: G1GC is only supported on JDK version 10 or later.
# To use G1GC uncomment the lines below.
#-XX:-UseConcMarkSweepGC
#-XX:-UseCMSInitiatingOccupancyOnly
-XX:+UseG1GC
-XX:InitiatingHeapOccupancyPercent=75
```

经过一顿Google之后，发现该问题是由于：
[es 7.x之后引入了indices.breaker.total.use_real_memory造成的](https://www.elastic.co/guide/en/elasticsearch/reference/7.0/breaking-changes-7.0.html#_parent_circuit_breaker_changes)
，从文档来看indices.breaker.total.use_real_memory控制的是jvm实际使用的内存。

那么jvm内存用到多少的时候，会触发该熔断呢？

从集群系统配置中可以看到indices.breaker.total.limit默认是95。
```
curl --location --request GET 'http://127.0.0.1:9200/_cluster/settings?include_defaults&flat_settings&local&filter_path=defaults.indices*'


{
	"defaults": {
		"indices.analysis.hunspell.dictionary.ignore_case": "false",
		"indices.analysis.hunspell.dictionary.lazy": "false",
		"indices.breaker.accounting.limit": "100%",
		"indices.breaker.accounting.overhead": "1.0",
		"indices.breaker.fielddata.limit": "40%",
		"indices.breaker.fielddata.overhead": "1.03",
		"indices.breaker.fielddata.type": "memory",
		"indices.breaker.request.limit": "60%",
		"indices.breaker.request.overhead": "1.0",
		"indices.breaker.request.type": "memory",
		"indices.breaker.total.limit": "95%",
		"indices.breaker.total.use_real_memory": "true",
		"indices.breaker.type": "hierarchy",
		"indices.cache.cleanup_interval": "1m",
		"indices.fielddata.cache.size": "-1b",
		"indices.id_field_data.enabled": "true",
		"indices.lifecycle.history_index_enabled": "true",
		"indices.lifecycle.poll_interval": "10m",
		"indices.mapping.dynamic_timeout": "30s",
		"indices.memory.index_buffer_size": "10%",
		"indices.memory.interval": "5s",
		"indices.memory.max_index_buffer_size": "-1",
		"indices.memory.min_index_buffer_size": "48mb",
		"indices.memory.shard_inactive_time": "5m",
		"indices.queries.cache.all_segments": "false",
		"indices.queries.cache.count": "10000",
		"indices.queries.cache.size": "10%",
		"indices.query.bool.max_clause_count": "1024",
		"indices.query.query_string.allowLeadingWildcard": "true",
		"indices.query.query_string.analyze_wildcard": "false",
		"indices.recovery.internal_action_long_timeout": "1800000ms",
		"indices.recovery.internal_action_timeout": "15m",
		"indices.recovery.max_bytes_per_sec": "40mb",
		"indices.recovery.max_concurrent_file_chunks": "2",
		"indices.recovery.recovery_activity_timeout": "1800000ms",
		"indices.recovery.retry_delay_network": "5s",
		"indices.recovery.retry_delay_state_sync": "500ms",
		"indices.requests.cache.expire": "0ms",
		"indices.requests.cache.size": "1%",
		"indices.store.delete.shard.timeout": "30s"
	}
}

```

关于为什么在默认开启indices.breaker.total.use_real_memory之后，如果GC算法是G1的话，会频繁触发熔断呢？

先解释一下G1的几个参数：
* InitiatingHeapOccupancyPercent：表示G1 GC并行循环初始设置的堆大小值，这个值决定了一个并行循环是不是要开始执行。它的逻辑是在一次GC完成后，比较老年代占用的空间和整个Java堆之间的比例。如果大于这个值，则预约下一次GC开始一个并行循环回收垃圾，从初始标记阶段开始。这个值越小，GC越频繁，反之，值越大，可以让应用程序执行时间更长。不过在内存消耗很快的情况下，我认为早运行并行循环比晚运行要好，看病要趁早。
* G1NewSizePercent：年轻代初始化值，默认是 5%
* G1MaxNewSizePercent：年轻代占用最大值，最大值默认是整个Java堆大小的60%

关于该问题具体分析可以看：https://github.com/elastic/elasticsearch/pull/46169

简单来说就是：es jvm.options之前的默认配置会导致老年代+年轻代的内存占用超过95%（理论上内存阈值会达到60+75=135），从而导致频繁的熔断。

修复该问题最有效的方式是根据不同版本JDK调整GC算法：
```
# GC configuration
8-13:-XX:+UseConcMarkSweepGC
8-13:-XX:CMSInitiatingOccupancyFraction=75
8-13:-XX:+UseCMSInitiatingOccupancyOnly

## G1GC Configuration
# NOTE: G1 GC is only supported on JDK version 10 or later
# to use G1GC, uncomment the next two lines and update the version on the
# following three lines to your version of the JDK
# 10-13:-XX:-UseConcMarkSweepGC
# 10-13:-XX:-UseCMSInitiatingOccupancyOnly
14-:-XX:+UseG1GC
14-:-XX:G1ReservePercent=25
14-:-XX:InitiatingHeapOccupancyPercent=30
```
这也是最新版es jvm.options中的默认配置。
