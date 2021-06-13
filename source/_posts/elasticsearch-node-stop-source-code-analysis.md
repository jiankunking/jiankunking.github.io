---
title: 【Elasticsearch源码】 节点关闭分析
abbrlink: 61680
date: 2021-06-13 10:38:20
categories:
  - ElasticSearch
tags:
  - ElasticSearch
  - Node
  - 源码
  - 原创
---

> 带着疑问学源码，第六篇：Elasticsearch 节点关闭分析
> 代码分析基于：https://github.com/jiankunking/elasticsearch 
> Elasticsearch 7.10.2+

<!-- more -->

# 目的
在看源码之前先梳理一下，自己对于节点关闭流程疑惑的点：
* 节点关闭都做了哪些检查？
* kill ES进程来关闭节点是否安全？
* 普通节点关闭与Master节点关闭有什么区别？
* 正在写入数据的节点，在关闭的时候，会发生什么？

# 源码分析

在节点启动过程中，Bootstrap#setup方法中添加了shutdown hook，当进程收到系统SIGTERM（kill命令默认信号 15）或SIGINT(2)信号时，调用[Node](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/node/Node.javas)#[close](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/node/Node.java#L971)方法，执行节点关闭流程。

> https://stackoverflow.com/questions/4042201/how-does-sigint-relate-to-the-other-termination-signals-such-as-sigterm-sigquit

每个模块的Service中都实现了doStop和doClose，用于处理这个模块的正常关闭流程。节点总的关闭流程位于Node#close，在close方法的实现中，先调用一遍各个模块的doStop，然后再次遍历各个模块执行doClose。

```
    // During concurrent close() calls we want to make sure that all of them return after the node has completed it's shutdown cycle.
    // If not, the hook that is added in Bootstrap#setup() will be useless:
    // close() might not be executed, in case another (for example api) call to close() has already set some lifecycles to stopped.
    // In this case the process will be terminated even if the first call to close() has not finished yet.
    @Override
    public synchronized void close() throws IOException {
        synchronized (lifecycle) {
            if (lifecycle.started()) {
                stop();
            }
            if (!lifecycle.moveToClosed()) {
                return;
            }
        }

        logger.info("closing ...");

        // 关闭各种服务
        List<Closeable> toClose = new ArrayList<>();
        StopWatch stopWatch = new StopWatch("node_close");
        toClose.add(() -> stopWatch.start("node_service"));
        toClose.add(nodeService);
        toClose.add(() -> stopWatch.stop().start("http"));
        toClose.add(injector.getInstance(HttpServerTransport.class));
        toClose.add(() -> stopWatch.stop().start("snapshot_service"));
        toClose.add(injector.getInstance(SnapshotsService.class));
        toClose.add(injector.getInstance(SnapshotShardsService.class));
        toClose.add(injector.getInstance(RepositoriesService.class));
        toClose.add(() -> stopWatch.stop().start("client"));
        Releasables.close(injector.getInstance(Client.class));
        toClose.add(() -> stopWatch.stop().start("indices_cluster"));
        toClose.add(injector.getInstance(IndicesClusterStateService.class));
        toClose.add(() -> stopWatch.stop().start("indices"));
        toClose.add(injector.getInstance(IndicesService.class));
        // close filter/fielddata caches after indices
        toClose.add(injector.getInstance(IndicesStore.class));
        toClose.add(injector.getInstance(PeerRecoverySourceService.class));
        toClose.add(() -> stopWatch.stop().start("cluster"));
        toClose.add(injector.getInstance(ClusterService.class));
        toClose.add(() -> stopWatch.stop().start("node_connections_service"));
        toClose.add(injector.getInstance(NodeConnectionsService.class));
        toClose.add(() -> stopWatch.stop().start("discovery"));
        toClose.add(injector.getInstance(Discovery.class));
        toClose.add(() -> stopWatch.stop().start("monitor"));
        toClose.add(nodeService.getMonitorService());
        toClose.add(() -> stopWatch.stop().start("fsHealth"));
        toClose.add(injector.getInstance(FsHealthService.class));
        toClose.add(() -> stopWatch.stop().start("gateway"));
        toClose.add(injector.getInstance(GatewayService.class));
        toClose.add(() -> stopWatch.stop().start("search"));
        toClose.add(injector.getInstance(SearchService.class));
        toClose.add(() -> stopWatch.stop().start("transport"));
        toClose.add(injector.getInstance(TransportService.class));

        for (LifecycleComponent plugin : pluginLifecycleComponents) {
            toClose.add(() -> stopWatch.stop().start("plugin(" + plugin.getClass().getName() + ")"));
            toClose.add(plugin);
        }
        toClose.addAll(pluginsService.filterPlugins(Plugin.class));

        toClose.add(() -> stopWatch.stop().start("script"));
        toClose.add(injector.getInstance(ScriptService.class));

        toClose.add(() -> stopWatch.stop().start("thread_pool"));
        toClose.add(() -> injector.getInstance(ThreadPool.class).shutdown());
        // Don't call shutdownNow here, it might break ongoing operations on Lucene indices.
        // See https://issues.apache.org/jira/browse/LUCENE-7248. We call shutdownNow in
        // awaitClose if the node doesn't finish closing within the specified time.

        toClose.add(() -> stopWatch.stop().start("gateway_meta_state"));
        toClose.add(injector.getInstance(GatewayMetaState.class));

        toClose.add(() -> stopWatch.stop().start("node_environment"));
        toClose.add(injector.getInstance(NodeEnvironment.class));
        toClose.add(stopWatch::stop);

        if (logger.isTraceEnabled()) {
            toClose.add(() -> logger.trace("Close times for each service:\n{}", stopWatch.prettyPrint()));
        }
        IOUtils.close(toClose);
        logger.info("closed");
    }

    private Node stop() {
        if (!lifecycle.moveToStopped()) {
            return this;
        }
        logger.info("stopping ...");

        injector.getInstance(ResourceWatcherService.class).close();
        injector.getInstance(HttpServerTransport.class).stop();

        injector.getInstance(SnapshotsService.class).stop();
        injector.getInstance(SnapshotShardsService.class).stop();
        injector.getInstance(RepositoriesService.class).stop();
        // stop any changes happening as a result of cluster state changes
        injector.getInstance(IndicesClusterStateService.class).stop();
        // close discovery early to not react to pings anymore.
        // This can confuse other nodes and delay things - mostly if we're the master and we're running tests.
        injector.getInstance(Discovery.class).stop();
        // we close indices first, so operations won't be allowed on it
        injector.getInstance(ClusterService.class).stop();
        injector.getInstance(NodeConnectionsService.class).stop();
        injector.getInstance(FsHealthService.class).stop();
        nodeService.getMonitorService().stop();
        injector.getInstance(GatewayService.class).stop();
        injector.getInstance(SearchService.class).stop();
        injector.getInstance(TransportService.class).stop();

        pluginLifecycleComponents.forEach(LifecycleComponent::stop);
        // we should stop this last since it waits for resources to get released
        // if we had scroll searchers etc or recovery going on we wait for to finish.
        injector.getInstance(IndicesService.class).stop();
        logger.info("stopped");

        return this;
    }
```

各模块的关闭有一定的顺序关系，以 doStop 为例，按下表所示的 顺序调用各模块 doStop方法。

|  服务   | 简介  |
| ------ | ------ |  
| ResourceWatcherService  | 通用资源监视服务 |
| HttpServerTransport  | HTTP 传输服务，提供REST接口服务 |
| SnapshotsService  | 快照服务 |
| SnapshotShardsService  | 负责启动和停止shard级快照 |
| RepositoriesService  | Service responsible for maintaining and providing access to snapshot repositories on nodes |
| IndicesClusterStateService  | 收到集群状态信息后，处理其中索引相关操作 |
| Discovery  | 集群拓扑管理 |
| ClusterService  | 集群管理服务，主要处理集群任务，发布集群状态 |
| NodeConnectionsService  | 节点连接管理服务 |
| FsHealthService  | Runs periodically and attempts to create a temp file to see if the filesystem is writable. If not then it marks the path as unhealthy |
| MonitorService  | 提供进程级、系统级、文件系统和 JVM 的监控服务 |
| GatewayService  | 负责集群元数据持久化与恢复 |
| SearchService  | 处理搜索请求 |
| TransportService  | 底层传输服务 |
| plugins  | 当前的所有插件 |
| IndicesService  | 负责创建、删除索引等索引操作 |

综合来看，关闭顺序大致如下∶
* 关闭快照和HTTPServer，不再响应用户REST请求。
* 关闭集群拓扑管理，不再响应ping请求。
* 关闭网络模块，让节点离线。
* 执行各个插件的关闭流程。
* 关闭IndicesService。
最后才关闭IndicesService，是因为这期间需要等待释放的资源最多，时间最长。

下面着重看一下IndicesService的doStop：
```
    @Override
    protected void doStop() {
        clusterService.removeApplier(timestampFieldMapperService);
        timestampFieldMapperService.doStop();

        ThreadPool.terminate(danglingIndicesThreadPoolExecutor, 10, TimeUnit.SECONDS);

        ExecutorService indicesStopExecutor =
            Executors.newFixedThreadPool(5, daemonThreadFactory(settings, "indices_shutdown"));

        // Copy indices because we modify it asynchronously in the body of the loop
        final Set<Index> indices = this.indices.values().stream().map(s -> s.index()).collect(Collectors.toSet());
        final CountDownLatch latch = new CountDownLatch(indices.size());
        for (final Index index : indices) {
            indicesStopExecutor.execute(() -> {
                try {
                    removeIndex(index, IndexRemovalReason.SHUTDOWN, "shutdown");
                } finally {
                    latch.countDown();
                }
            });
        }
        try {
        	// 注意shardsClosedTimeout 这个值是在IndicesService的构造函数中初始化的
        	// this.shardsClosedTimeout = settings.getAsTime(INDICES_SHARDS_CLOSED_TIMEOUT, new TimeValue(1, TimeUnit.DAYS));
        	// 也就是说 CountDownLatch.await默认1天才会继续后面的流程
            if (latch.await(shardsClosedTimeout.seconds(), TimeUnit.SECONDS) == false) {
              logger.warn("Not all shards are closed yet, waited {}sec - stopping service", shardsClosedTimeout.seconds());
            }
        } catch (InterruptedException e) {
            // ignore
        } finally {
            indicesStopExecutor.shutdown();
        }
    }
```
那什么时候会导致removeIndex执行一直无法返回呢？
```
IndicesService removeIndex(final Index index, final IndexRemovalReason reason, final String extraInfo)=>
IndexService close(final String reason, boolean delete)=>
IndexService removeShard(int shardId, String reason)=>
IndexService removeShard(String reason, ShardId sId, IndexShard indexShard, Store store, IndexEventListener listener)=>
IndexShard close(String reason, boolean flushEngine)=>
Engine flushAndClose()=>
```
下面具体看一下flushAndClose()：
```
    /**
     * Flush the engine (committing segments to disk and truncating the
     * translog) and close it.
     */
    public void flushAndClose() throws IOException {
        if (isClosed.get() == false) {
            logger.trace("flushAndClose now acquire writeLock");
            // 可以看一下：
            // https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/index/engine/InternalEngine.java#L857
            // 由于写入操作已经加了读锁，此时写锁会等待，直到写入执行完毕。
            // 因此数据写入过程不会被中断。但是由于网络模块被关闭，客户端的连接会被断开。
            // 客户端应当作为失败处理，虽然ES服务端的写流程还在继续。
            try (ReleasableLock lock = writeLock.acquire()) {
                logger.trace("flushAndClose now acquired writeLock");
                try {
                    logger.debug("flushing shard on close - this might take some time to sync files to disk");
                    try {
                        // TODO we might force a flush in the future since we have the write lock already even though recoveries
                        // are running.
                        flush();
                    } catch (AlreadyClosedException ex) {
                        logger.debug("engine already closed - skipping flushAndClose");
                    }
                } finally {
                    close(); // double close is not a problem
                }
            }
        }
        awaitPendingClose();
    }
```

# 总结
kill -15/-2 ElasticSearch是可以正常退出的。

正在写入数据的节点，在关闭的时候，需要等待数据写入完成或者超时。

主节点被关闭时，没有想象中的特殊处理，节点正常执行关闭流程，当TransportService模块被关闭后，集群重新选举新Master。因此，滚动重启期间会有一段时间处于无主状态。

> 该部分等看集群选举部分的时候，再细看一下。