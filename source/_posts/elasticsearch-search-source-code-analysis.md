---
title: 【Elasticsearch源码】 检索分析
abbrlink: 1378
date: 2021-01-29 10:32:33
categories:
  - ElasticSearch
tags:
  - ElasticSearch
  - Search
  - 源码
  - 原创
---

> 带着疑问学源码，第二篇：Elasticsearch 搜索
> 代码分析基于：https://github.com/jiankunking/elasticsearch 
> Elasticsearch 7.10.2+

<!-- more -->

# 目的
在看源码之前先梳理一下，自己对于检索流程疑惑的点：
当索引是按照日期拆分之后，在使用-\* 检索，会不会通过索引层面的时间配置直接跳过无关索引？使用*会对性能造成多大的影响？


# 源码分析
<font color=DeepPink>**第二部分是代码分析的过程，不想看的朋友可以跳过直接看第三部分总结。**</font>

分析的话，咱们就以_search操作为主线。

在[RestSearchAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/rest/action/search/RestSearchAction.java)可以看到：
* 路由注册
* 请求参数转换

真正执行的是[TransportSearchAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/search/TransportSearchAction.java)，类图如下：

![](/images/elasticsearch-search-source-code-analysis/TransportSearchAction.png)

```
TransportSearchAction doExecute =>
// executeRequest中会判断是local请求还是remote请求
// local请求会执行executeLocalSearch，在executeLocalSearch中会将remote相关参数置空，然后在调用executeSearch
// remote请求会执行executeSearch
TransportSearchAction executeRequest =>
TransportSearchAction executeLocalSearch|executeSearch =>
// executeSearch会合并remoteShardIterators（跨集群访问）与localShardIterators得到shardIterators
// 校验shard数是否超限
TransportSearchAction executeSearch =>
```

下面先看一下:

```
    private void executeRequest(Task task, SearchRequest searchRequest,
                                SearchAsyncActionProvider searchAsyncActionProvider, ActionListener<SearchResponse> listener) {
        final long relativeStartNanos = System.nanoTime();
        final SearchTimeProvider timeProvider =
            new SearchTimeProvider(searchRequest.getOrCreateAbsoluteStartMillis(), relativeStartNanos, System::nanoTime);
        ActionListener<SearchSourceBuilder> rewriteListener = ActionListener.wrap(source -> {
            if (source != searchRequest.source()) {
                // only set it if it changed - we don't allow null values to be set but it might be already null. this way we catch
                // situations when source is rewritten to null due to a bug
                searchRequest.source(source);
            }
            final SearchContextId searchContext;
            final Map<String, OriginalIndices> remoteClusterIndices;
            if (searchRequest.pointInTimeBuilder() != null) {
                searchContext = searchRequest.pointInTimeBuilder().getSearchContextId(namedWriteableRegistry);
                remoteClusterIndices = getIndicesFromSearchContexts(searchContext, searchRequest.indicesOptions());
            } else {
                searchContext = null;
                remoteClusterIndices = remoteClusterService.groupIndices(searchRequest.indicesOptions(), searchRequest.indices());
            }
            OriginalIndices localIndices = remoteClusterIndices.remove(RemoteClusterAware.LOCAL_CLUSTER_GROUP_KEY);
            final ClusterState clusterState = clusterService.state();
            if (remoteClusterIndices.isEmpty()) {
                executeLocalSearch(
                    task, timeProvider, searchRequest, localIndices, clusterState, listener, searchContext, searchAsyncActionProvider);
            } else {
                // 对应 ccs_minimize_roundtrips
                // https://www.elastic.co/guide/en/elasticsearch/reference/7.9/modules-cross-cluster-search.html
                if (shouldMinimizeRoundtrips(searchRequest)) {
                    final TaskId parentTaskId = task.taskInfo(clusterService.localNode().getId(), false).getTaskId();
                    ccsRemoteReduce(parentTaskId, searchRequest, localIndices, remoteClusterIndices, timeProvider,
                        searchService.aggReduceContextBuilder(searchRequest),
                        remoteClusterService, threadPool, listener,
                        (r, l) -> executeLocalSearch(
                            task, timeProvider, r, localIndices, clusterState, l, searchContext, searchAsyncActionProvider));
                } else {
                    AtomicInteger skippedClusters = new AtomicInteger(0);
                    // 针对每个集群将搜索请求发送出去，
                    // 目标集群TransportSearchAction收到请求调用doExecute方法处理
                    collectSearchShards(searchRequest.indicesOptions(), searchRequest.preference(), searchRequest.routing(),
                        skippedClusters, remoteClusterIndices, remoteClusterService, threadPool,
                        ActionListener.wrap(
                            searchShardsResponses -> {
                                final BiFunction<String, String, DiscoveryNode> clusterNodeLookup =
                                    getRemoteClusterNodeLookup(searchShardsResponses);
                                final Map<String, AliasFilter> remoteAliasFilters;
                                final List<SearchShardIterator> remoteShardIterators;
                                if (searchContext != null) {
                                    remoteAliasFilters = searchContext.aliasFilter();
                                    remoteShardIterators = getRemoteShardsIteratorFromPointInTime(searchShardsResponses,
                                        searchContext, searchRequest.pointInTimeBuilder().getKeepAlive(), remoteClusterIndices);
                                } else {
                                    remoteAliasFilters = getRemoteAliasFilters(searchShardsResponses);
                                    remoteShardIterators = getRemoteShardsIterator(searchShardsResponses, remoteClusterIndices,
                                        remoteAliasFilters);
                                }
                                int localClusters = localIndices == null ? 0 : 1;
                                int totalClusters = remoteClusterIndices.size() + localClusters;
                                int successfulClusters = searchShardsResponses.size() + localClusters;
                                executeSearch((SearchTask) task, timeProvider, searchRequest, localIndices, remoteShardIterators,
                                    clusterNodeLookup, clusterState, remoteAliasFilters, listener,
                                    new SearchResponse.Clusters(totalClusters, successfulClusters, skippedClusters.get()),
                                    searchContext, searchAsyncActionProvider);
                            },
                            listener::onFailure));
                }
            }
        }, listener::onFailure);
        if (searchRequest.source() == null) {
            rewriteListener.onResponse(searchRequest.source());
        } else {
            Rewriteable.rewriteAndFetch(searchRequest.source(), searchService.getRewriteContext(timeProvider::getAbsoluteStartMillis),
                rewriteListener);
        }
    }
```

下面再看一下executeSearch：

```
 private void executeSearch(SearchTask task, SearchTimeProvider timeProvider, SearchRequest searchRequest,
                               OriginalIndices localIndices, List<SearchShardIterator> remoteShardIterators,
                               BiFunction<String, String, DiscoveryNode> remoteConnections, ClusterState clusterState,
                               Map<String, AliasFilter> remoteAliasMap, ActionListener<SearchResponse> listener,
                               SearchResponse.Clusters clusters, @Nullable SearchContextId searchContext,
                               SearchAsyncActionProvider searchAsyncActionProvider) {
        // red状态也可以查询
        clusterState.blocks().globalBlockedRaiseException(ClusterBlockLevel.READ);

        // TODO: I think startTime() should become part of ActionRequest and that should be used both for index name
        // date math expressions and $now in scripts. This way all apis will deal with now in the same way instead
        // of just for the _search api
        final List<SearchShardIterator> localShardIterators;
        final Map<String, AliasFilter> aliasFilter;

        final String[] concreteLocalIndices;
        if (searchContext != null) {
            assert searchRequest.pointInTimeBuilder() != null;
            aliasFilter = searchContext.aliasFilter();
            concreteLocalIndices = localIndices == null ? new String[0] : localIndices.indices();
            localShardIterators = getLocalLocalShardsIteratorFromPointInTime(clusterState, localIndices,
                searchRequest.getLocalClusterAlias(), searchContext, searchRequest.pointInTimeBuilder().getKeepAlive());
        } else {
            final Index[] indices = resolveLocalIndices(localIndices, clusterState, timeProvider);
            Map<String, Set<String>> routingMap = indexNameExpressionResolver.resolveSearchRouting(clusterState, searchRequest.routing(),
                searchRequest.indices());
            routingMap = routingMap == null ? Collections.emptyMap() : Collections.unmodifiableMap(routingMap);
            concreteLocalIndices = new String[indices.length];
            for (int i = 0; i < indices.length; i++) {
                concreteLocalIndices[i] = indices[i].getName();
            }
            Map<String, Long> nodeSearchCounts = searchTransportService.getPendingSearchRequests();
            GroupShardsIterator<ShardIterator> localShardRoutings = clusterService.operationRouting().searchShards(clusterState,
                concreteLocalIndices, routingMap, searchRequest.preference(),
                searchService.getResponseCollectorService(), nodeSearchCounts);
            localShardIterators = StreamSupport.stream(localShardRoutings.spliterator(), false)
                .map(it -> new SearchShardIterator(
                    searchRequest.getLocalClusterAlias(), it.shardId(), it.getShardRoutings(), localIndices))
                .collect(Collectors.toList());
            aliasFilter = buildPerIndexAliasFilter(searchRequest, clusterState, indices, remoteAliasMap);
        }
        final GroupShardsIterator<SearchShardIterator> shardIterators = mergeShardsIterators(localShardIterators, remoteShardIterators);

        failIfOverShardCountLimit(clusterService, shardIterators.size());

        Map<String, Float> concreteIndexBoosts = resolveIndexBoosts(searchRequest, clusterState);

        // optimize search type for cases where there is only one shard group to search on
        if (shardIterators.size() == 1) {
            // if we only have one group, then we always want Q_T_F, no need for DFS, and no need to do THEN since we hit one shard
            searchRequest.searchType(QUERY_THEN_FETCH);
        }
        if (searchRequest.allowPartialSearchResults() == null) {
            // No user preference defined in search request - apply cluster service default
            searchRequest.allowPartialSearchResults(searchService.defaultAllowPartialSearchResults());
        }
        if (searchRequest.isSuggestOnly()) {
            // disable request cache if we have only suggest
            searchRequest.requestCache(false);
            switch (searchRequest.searchType()) {
                case DFS_QUERY_THEN_FETCH:
                    // convert to Q_T_F if we have only suggest
                    searchRequest.searchType(QUERY_THEN_FETCH);
                    break;
            }
        }
        final DiscoveryNodes nodes = clusterState.nodes();
        BiFunction<String, String, Transport.Connection> connectionLookup = buildConnectionLookup(searchRequest.getLocalClusterAlias(),
            nodes::get, remoteConnections, searchTransportService::getConnection);
        final Executor asyncSearchExecutor = asyncSearchExecutor(concreteLocalIndices, clusterState);
        // 判断是否需要在查询前做目标分片过滤
        // pre_filter_shard_size
        // https://www.elastic.co/guide/en/elasticsearch/reference/current/search-search.html
        // shouldPreFilterSearchShards,判断为true需要同时满足3个条件：
		// 1、查询类型为QUERY_THEN_FETCH
        // 2、是否能通过查询重写预判出查询结果为空或者有字段排序
        // 3、实际的查询分片数量> preFilterShardSize(默认128)
        // 需要注意的是：
        // pre-filter 最主要的作用不是降低查询延迟，而是 pre-filter 阶段可以不占用search theadpool，减少了这个线程池的占用情况。
        final boolean preFilterSearchShards = shouldPreFilterSearchShards(clusterState, searchRequest, concreteLocalIndices,
            localShardIterators.size() + remoteShardIterators.size());
        // 调用searchAsyncAction进行异步搜索，search操作是由action的start方法来处理的。
        searchAsyncActionProvider.asyncSearchAction(
            task, searchRequest, asyncSearchExecutor, shardIterators, timeProvider, connectionLookup, clusterState,
            Collections.unmodifiableMap(aliasFilter), concreteIndexBoosts, listener,
            preFilterSearchShards, threadPool, clusters).start();
    }
```

在看searchAsyncAction之前先看一下AbstractSearchAsyncAction的继承及实现类：
![](/images/elasticsearch-search-source-code-analysis/AbstractSearchAsyncAction.png)

searchAsyncAction主要是生成查询的请求，也就是AbstractSearchAsyncAction的实例：

```
private AbstractSearchAsyncAction<? extends SearchPhaseResult> searchAsyncAction(
        SearchTask task,
        SearchRequest searchRequest,
        Executor executor,
        GroupShardsIterator<SearchShardIterator> shardIterators,
        SearchTimeProvider timeProvider,
        BiFunction<String, String, Transport.Connection> connectionLookup,
        ClusterState clusterState,
        Map<String, AliasFilter> aliasFilter,
        Map<String, Float> concreteIndexBoosts,
        ActionListener<SearchResponse> listener,
        boolean preFilter,
        ThreadPool threadPool,
        SearchResponse.Clusters clusters) {
        if (preFilter) {
            return new CanMatchPreFilterSearchPhase(logger, searchTransportService, connectionLookup,
                aliasFilter, concreteIndexBoosts, executor, searchRequest, listener, shardIterators,
                timeProvider, clusterState, task, (iter) -> {
                AbstractSearchAsyncAction<? extends SearchPhaseResult> action = searchAsyncAction(
                    task,
                    searchRequest,
                    executor,
                    iter,
                    timeProvider,
                    connectionLookup,
                    clusterState,
                    aliasFilter,
                    concreteIndexBoosts,
                    listener,
                    false,
                    threadPool,
                    clusters);
                return new SearchPhase(action.getName()) {
                    @Override
                    public void run() {
                        action.start();
                    }
                };
            }, clusters, searchService.getCoordinatorRewriteContextProvider(timeProvider::getAbsoluteStartMillis));
        } else {
            final QueryPhaseResultConsumer queryResultConsumer = searchPhaseController.newSearchPhaseResults(executor,
                circuitBreaker, task.getProgressListener(), searchRequest, shardIterators.size(),
                exc -> searchTransportService.cancelSearchTask(task, "failed to merge result [" + exc.getMessage() + "]"));
            AbstractSearchAsyncAction<? extends SearchPhaseResult> searchAsyncAction;
            switch (searchRequest.searchType()) {
                // 与 “Query Then Fetch” 相同，除了初始分散阶段，该阶段计算分布式term频率以获得更准确的评分。
                case DFS_QUERY_THEN_FETCH:
                    searchAsyncAction = new SearchDfsQueryThenFetchAsyncAction(logger, searchTransportService, connectionLookup,
                        aliasFilter, concreteIndexBoosts, searchPhaseController,
                        executor, queryResultConsumer, searchRequest, listener, shardIterators, timeProvider, clusterState, task, clusters);
                    break;
                // 请求分两个阶段处理。 在第一阶段，查询被转发到所有涉及的分片。 每个分片执行搜索并生成对该分片本地的结果的排序列表。 
                // 每个分片只向协调节点返回足够的信息，以允许其合并并将分片级结果重新排序为全局排序的最大长度大小的结果集。
                // 在第二阶段期间，协调节点仅从相关分片请求文档内容（以及高亮显示的片段，如果有的话）。
                // 如果您未在请求中指定 search_type，那么这是默认设置。
                case QUERY_THEN_FETCH:
                    searchAsyncAction = new SearchQueryThenFetchAsyncAction(logger, searchTransportService, connectionLookup,
                        aliasFilter, concreteIndexBoosts, searchPhaseController, executor, queryResultConsumer,
                        searchRequest, listener, shardIterators, timeProvider, clusterState, task, clusters);
                    break;
                default:
                    throw new IllegalStateException("Unknown search type: [" + searchRequest.searchType() + "]");
            }
            return searchAsyncAction;
        }
    }
```

获取到具体的SearchAsyncAction之后具体的执行是通过run()来调用各个实现类具体的执行了：

```
     /**
     * This is the main entry point for a search. This method starts the search execution of the initial phase.
     */
    public final void start() {
        if (getNumShards() == 0) {
            //no search shards to search on, bail with empty response
            //(it happens with search across _all with no indices around and consistent with broadcast operations)
            int trackTotalHitsUpTo = request.source() == null ? SearchContext.DEFAULT_TRACK_TOTAL_HITS_UP_TO :
                request.source().trackTotalHitsUpTo() == null ? SearchContext.DEFAULT_TRACK_TOTAL_HITS_UP_TO :
                    request.source().trackTotalHitsUpTo();
            // total hits is null in the response if the tracking of total hits is disabled
            boolean withTotalHits = trackTotalHitsUpTo != SearchContext.TRACK_TOTAL_HITS_DISABLED;
            listener.onResponse(new SearchResponse(InternalSearchResponse.empty(withTotalHits), null, 0, 0, 0, buildTookInMillis(),
                ShardSearchFailure.EMPTY_ARRAY, clusters, null));
            return;
        }
        executePhase(this);
    }

    private void executePhase(SearchPhase phase) {
        try {
            phase.run();
        } catch (Exception e) {
            if (logger.isDebugEnabled()) {
                logger.debug(new ParameterizedMessage("Failed to execute [{}] while moving to [{}] phase", request, phase.getName()), e);
            }
            onPhaseFailure(phase, "", e);
        }
    }
```

因为默认的搜索类型是QUERY_THEN_FETCH，那么下面看一下[SearchQueryThenFetchAsyncAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/search/SearchQueryThenFetchAsyncAction.java),在SearchQueryThenFetchAsyncAction中没有重写run()，所以真正执行的还是父类AbstractSearchAsyncAction中的run(),下面看下：

```
    @Override
    public final void run() {
        for (final SearchShardIterator iterator : toSkipShardsIts) {
            assert iterator.skip();
            skipShard(iterator);
        }
        if (shardsIts.size() > 0) {
            assert request.allowPartialSearchResults() != null : "SearchRequest missing setting for allowPartialSearchResults";
            if (request.allowPartialSearchResults() == false) {
                final StringBuilder missingShards = new StringBuilder();
                // Fail-fast verification of all shards being available
                for (int index = 0; index < shardsIts.size(); index++) {
                    final SearchShardIterator shardRoutings = shardsIts.get(index);
                    if (shardRoutings.size() == 0) {
                        if(missingShards.length() > 0){
                            missingShards.append(", ");
                        }
                        missingShards.append(shardRoutings.shardId());
                    }
                }
                if (missingShards.length() > 0) {
                    //Status red - shard is missing all copies and would produce partial results for an index search
                    final String msg = "Search rejected due to missing shards ["+ missingShards +
                        "]. Consider using `allow_partial_search_results` setting to bypass this error.";
                    throw new SearchPhaseExecutionException(getName(), msg, null, ShardSearchFailure.EMPTY_ARRAY);
                }
            }
            Version version = request.minCompatibleShardNode();
            if (version != null && Version.CURRENT.minimumCompatibilityVersion().equals(version) == false) {
                if (checkMinimumVersion(shardsIts) == false) {
                    throw new VersionMismatchException("One of the shards is incompatible with the required minimum version [{}]",
                        request.minCompatibleShardNode());
                }
            }
            // 遍历所有的分片，然后执行:
            // 如果列表中有N个shard位于同一个节点，则向其发送N个请求，并不会把请求合并成一个。
            for (int i = 0; i < shardsIts.size(); i++) {
                final SearchShardIterator shardRoutings = shardsIts.get(i);
                assert shardRoutings.skip() == false;
                assert shardItIndexMap.containsKey(shardRoutings);
                int shardIndex = shardItIndexMap.get(shardRoutings);
                performPhaseOnShard(shardIndex, shardRoutings, shardRoutings.nextOrNull());
            }
        }
    }
```

通过performPhaseOnShard，来进行具体某个shard的搜索：

```
    protected void performPhaseOnShard(final int shardIndex, final SearchShardIterator shardIt, final SearchShardTarget shard) {
        /*
         * We capture the thread that this phase is starting on. When we are called back after executing the phase, we are either on the
         * same thread (because we never went async, or the same thread was selected from the thread pool) or a different thread. If we
         * continue on the same thread in the case that we never went async and this happens repeatedly we will end up recursing deeply and
         * could stack overflow. To prevent this, we fork if we are called back on the same thread that execution started on and otherwise
         * we can continue (cf. InitialSearchPhase#maybeFork).
         */
        if (shard == null) {
            SearchShardTarget unassignedShard = new SearchShardTarget(null, shardIt.shardId(),
                shardIt.getClusterAlias(), shardIt.getOriginalIndices());
            fork(() -> onShardFailure(shardIndex, unassignedShard, shardIt, new NoShardAvailableActionException(shardIt.shardId())));
        } else {
            final PendingExecutions pendingExecutions = throttleConcurrentRequests ?
                pendingExecutionsPerNode.computeIfAbsent(shard.getNodeId(), n -> new PendingExecutions(maxConcurrentRequestsPerNode))
                : null;
            Runnable r = () -> {
                final Thread thread = Thread.currentThread();
                try {
                    // 定义Listener，用来处理搜索结果Response
                    executePhaseOnShard(shardIt, shard,
                        new SearchActionListener<Result>(shard, shardIndex) {
                            @Override
                            public void innerOnResponse(Result result) {
                                try {
                                    onShardResult(result, shardIt);
                                } catch (Exception exc) {
                                    onShardFailure(shardIndex, shard, shardIt, exc);
                                } finally {
                                    executeNext(pendingExecutions, thread);
                                }
                            }

                            @Override
                            public void onFailure(Exception t) {
                                try {
                                    onShardFailure(shardIndex, shard, shardIt, t);
                                } finally {
                                    executeNext(pendingExecutions, thread);
                                }
                            }
                        });
                } catch (final Exception e) {
                    try {
                        /*
                         * It is possible to run into connection exceptions here because we are getting the connection early and might
                         * run into nodes that are not connected. In this case, on shard failure will move us to the next shard copy.
                         */
                        fork(() -> onShardFailure(shardIndex, shard, shardIt, e));
                    } finally {
                        executeNext(pendingExecutions, thread);
                    }
                }
            };
            if (throttleConcurrentRequests) {
                pendingExecutions.tryRun(r);
            } else {
                r.run();
            }
        }
    }

    /**
     * Sends the request to the actual shard.
     * 摘自父类 AbstractSearchAsyncAction
     * @param shardIt the shards iterator
     * @param shard the shard routing to send the request for
     * @param listener the listener to notify on response
     */
    protected void executePhaseOnShard(final SearchShardIterator shardIt,
                                       final SearchShardTarget shard,
                                       final SearchActionListener<SearchPhaseResult> listener) {
        ShardSearchRequest request = rewriteShardSearchRequest(super.buildShardSearchRequest(shardIt, listener.requestIndex));
        //通过SearchTransportService的sendChildRequest方法向具体的分片发送Query阶段的子任务进行异步处理。
        getSearchTransport().sendExecuteQuery(getConnection(shard.getClusterAlias(), shard.getNodeId()), request, getTask(), listener);
    }
```

每个分片在执行完毕Query子任务后，通过节点间通信，回调AbstractSearchAsyncAction类中的onShardResult方法，把查询结果记录在协调节点保存的数组结构results中，并增加计数：

```
      /**
     * Executed once for every successful shard level request.
     * @param result the result returned form the shard
     * @param shardIt the shard iterator
     */
    protected void onShardResult(Result result, SearchShardIterator shardIt) {
        assert result.getShardIndex() != -1 : "shard index is not set";
        assert result.getSearchShardTarget() != null : "search shard target must not be null";
        hasShardResponse.set(true);
        if (logger.isTraceEnabled()) {
            logger.trace("got first-phase result from {}", result != null ? result.getSearchShardTarget() : null);
        }
        results.consumeResult(result, () -> onShardResultConsumed(result, shardIt));
    }

    private void onShardResultConsumed(Result result, SearchShardIterator shardIt) {
        successfulOps.incrementAndGet();
        // clean a previous error on this shard group (note, this code will be serialized on the same shardIndex value level
        // so its ok concurrency wise to miss potentially the shard failures being created because of another failure
        // in the #addShardFailure, because by definition, it will happen on *another* shardIndex
        AtomicArray<ShardSearchFailure> shardFailures = this.shardFailures.get();
        if (shardFailures != null) {
            shardFailures.set(result.getShardIndex(), null);
        }
        // we need to increment successful ops first before we compare the exit condition otherwise if we
        // are fast we could concurrently update totalOps but then preempt one of the threads which can
        // cause the successor to read a wrong value from successfulOps if second phase is very fast ie. count etc.
        // increment all the "future" shards to update the total ops since we some may work and some may not...
        // and when that happens, we break on total ops, so we must maintain them
        successfulShardExecution(shardIt);
    }

    private void successfulShardExecution(SearchShardIterator shardsIt) {
        final int remainingOpsOnIterator;
        if (shardsIt.skip()) {
            // It's possible that we're skipping a shard that's unavailable
            // but its range was available in the IndexMetadata, in that
            // case the shardsIt.remaining() would be 0, expectedTotalOps
            // accounts for unavailable shards too.
            remainingOpsOnIterator = Math.max(shardsIt.remaining(), 1);
        } else {
            remainingOpsOnIterator = shardsIt.remaining() + 1;
        }
        final int xTotalOps = totalOps.addAndGet(remainingOpsOnIterator);
        // 检查是否收到全部回复
        if (xTotalOps == expectedTotalOps) {
            onPhaseDone();
        } else if (xTotalOps > expectedTotalOps) {
            throw new AssertionError("unexpected higher total ops [" + xTotalOps + "] compared to expected [" + expectedTotalOps + "]",
                new SearchPhaseExecutionException(getName(), "Shard failures", null, buildShardFailures()));
        }
    }
```

当返回结果的分片数等于预期的总分片数时，协调节点会进入当前Phase的结束处理，启动下一个阶段Fetch Phase的执行。注意，ES中只需要一个分片执行成功，就会进行后续Phase处理得到部分结果，当然它会在结果中提示用户实际有多少分片执行成功。

onPhaseDone会调用executeNextPhase方法进入下一个阶段，从而开始进入Fetch 阶段。

```
    /**
     * Executed once all shard results have been received and processed
     * @see #onShardFailure(int, SearchShardTarget, Exception)
     * @see #onShardResult(SearchPhaseResult, SearchShardIterator)
     */
    final void onPhaseDone() {  // as a tribute to @kimchy aka. finishHim()
        // SearchQueryThenFetchAsyncAction中getNextPhase会返回：FetchSearchPhase
        executeNextPhase(this, getNextPhase(results, this));
    }

    @Override
    public final void executeNextPhase(SearchPhase currentPhase, SearchPhase nextPhase) {
        /* This is the main search phase transition where we move to the next phase. If all shards
         * failed or if there was a failure and partial results are not allowed, then we immediately
         * fail. Otherwise we continue to the next phase.
         */
        ShardOperationFailedException[] shardSearchFailures = buildShardFailures();
        if (shardSearchFailures.length == getNumShards()) {
            shardSearchFailures = ExceptionsHelper.groupBy(shardSearchFailures);
            Throwable cause = shardSearchFailures.length == 0 ? null :
                ElasticsearchException.guessRootCauses(shardSearchFailures[0].getCause())[0];
            logger.debug(() -> new ParameterizedMessage("All shards failed for phase: [{}]", getName()), cause);
            onPhaseFailure(currentPhase, "all shards failed", cause);
        } else {
            Boolean allowPartialResults = request.allowPartialSearchResults();
            assert allowPartialResults != null : "SearchRequest missing setting for allowPartialSearchResults";
            if (allowPartialResults == false && successfulOps.get() != getNumShards()) {
                // check if there are actual failures in the atomic array since
                // successful retries can reset the failures to null
                if (shardSearchFailures.length > 0) {
                    if (logger.isDebugEnabled()) {
                        int numShardFailures = shardSearchFailures.length;
                        shardSearchFailures = ExceptionsHelper.groupBy(shardSearchFailures);
                        Throwable cause = ElasticsearchException.guessRootCauses(shardSearchFailures[0].getCause())[0];
                        logger.debug(() -> new ParameterizedMessage("{} shards failed for phase: [{}]",
                            numShardFailures, getName()), cause);
                    }
                    onPhaseFailure(currentPhase, "Partial shards failure", null);
                    return;
                } else {
                    int discrepancy = getNumShards() - successfulOps.get();
                    assert discrepancy > 0 : "discrepancy: " + discrepancy;
                    if (logger.isDebugEnabled()) {
                        logger.debug("Partial shards failure (unavailable: {}, successful: {}, skipped: {}, num-shards: {}, phase: {})",
                            discrepancy, successfulOps.get(), skippedOps.get(), getNumShards(), currentPhase.getName());
                    }
                    onPhaseFailure(currentPhase, "Partial shards failure (" + discrepancy + " shards unavailable)", null);
                    return;
                }
            }
            if (logger.isTraceEnabled()) {
                final String resultsFrom = results.getSuccessfulResults()
                    .map(r -> r.getSearchShardTarget().toString()).collect(Collectors.joining(","));
                logger.trace("[{}] Moving to next phase: [{}], based on results from: {} (cluster state version: {})",
                    currentPhase.getName(), nextPhase.getName(), resultsFrom, clusterState.version());
            }
            executePhase(nextPhase);
        }
    }

    private void executePhase(SearchPhase phase) {
        try {
            phase.run();
        } catch (Exception e) {
            if (logger.isDebugEnabled()) {
                logger.debug(new ParameterizedMessage("Failed to execute [{}] while moving to [{}] phase", request, phase.getName()), e);
            }
            onPhaseFailure(phase, "", e);
        }
    }

```
下面看一下[FetchSearchPhase](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/search/FetchSearchPhase.java)中的run()：
```
 @Override
    public void run() {
        context.execute(new AbstractRunnable() {
            @Override
            protected void doRun() throws Exception {
                // we do the heavy lifting in this inner run method where we reduce aggs etc. that's why we fork this phase
                // off immediately instead of forking when we send back the response to the user since there we only need
                // to merge together the fetched results which is a linear operation.
                innerRun();
            }

            @Override
            public void onFailure(Exception e) {
                context.onPhaseFailure(FetchSearchPhase.this, "", e);
            }
        });
    }

    private void innerRun() throws Exception {
        final int numShards = context.getNumShards();
        final boolean isScrollSearch = context.getRequest().scroll() != null;
        final List<SearchPhaseResult> phaseResults = queryResults.asList();
        final SearchPhaseController.ReducedQueryPhase reducedQueryPhase = resultConsumer.reduce();
        final boolean queryAndFetchOptimization = queryResults.length() == 1;
        final Runnable finishPhase = ()
            -> moveToNextPhase(searchPhaseController, queryResults, reducedQueryPhase, queryAndFetchOptimization ?
            queryResults : fetchResults.getAtomicArray());
        if (queryAndFetchOptimization) {
            assert phaseResults.isEmpty() || phaseResults.get(0).fetchResult() != null : "phaseResults empty [" + phaseResults.isEmpty()
                + "], single result: " +  phaseResults.get(0).fetchResult();
            // query AND fetch optimization
            finishPhase.run();
        } else {
            ScoreDoc[] scoreDocs = reducedQueryPhase.sortedTopDocs.scoreDocs;
            final IntArrayList[] docIdsToLoad = searchPhaseController.fillDocIdsToLoad(numShards, scoreDocs);
            // no docs to fetch -- sidestep everything and return
            if (scoreDocs.length == 0) {
                // we have to release contexts here to free up resources
                phaseResults.stream()
                    .map(SearchPhaseResult::queryResult)
                    .forEach(this::releaseIrrelevantSearchContext);
                finishPhase.run();
            } else {
                final ScoreDoc[] lastEmittedDocPerShard = isScrollSearch ?
                    searchPhaseController.getLastEmittedDocPerShard(reducedQueryPhase, numShards)
                    : null;
                final CountedCollector<FetchSearchResult> counter = new CountedCollector<>(fetchResults,
                    docIdsToLoad.length, // we count down every shard in the result no matter if we got any results or not
                    finishPhase, context);
                // 从查询阶段的shard列表中遍历，跳过查询结果为空的shard，
                // 对特定目标shard执行executeFetch方法来获取数据，其中包括分页信息。
                for (int i = 0; i < docIdsToLoad.length; i++) {
                    IntArrayList entry = docIdsToLoad[i];
                    SearchPhaseResult queryResult = queryResults.get(i);
                    if (entry == null) { // no results for this shard ID
                        if (queryResult != null) {
                            // if we got some hits from this shard we have to release the context there
                            // we do this as we go since it will free up resources and passing on the request on the
                            // transport layer is cheap.
                            releaseIrrelevantSearchContext(queryResult.queryResult());
                            progressListener.notifyFetchResult(i);
                        }
                        // in any case we count down this result since we don't talk to this shard anymore
                        counter.countDown();
                    } else {
                        SearchShardTarget searchShardTarget = queryResult.getSearchShardTarget();
                        Transport.Connection connection = context.getConnection(searchShardTarget.getClusterAlias(),
                            searchShardTarget.getNodeId());
                        ShardFetchSearchRequest fetchSearchRequest = createFetchRequest(queryResult.queryResult().getContextId(), i, entry,
                            lastEmittedDocPerShard, searchShardTarget.getOriginalIndices(), queryResult.getShardSearchRequest(),
                            queryResult.getRescoreDocIds());
                        executeFetch(queryResult.getShardIndex(), searchShardTarget, counter, fetchSearchRequest, queryResult.queryResult(),
                            connection);
                    }
                }
            }
        }
    }

    // executeFetch的参数querySearchResult包含分页信息，
    // 同时定义了Listener，每成功获取一个shard数据之后就执行counter.onResult，
    // 其中调用对结果的处理回调(final CountedCollector<FetchSearchResult> counter)，把结果保存到数组中，然后执行countDown。
    private void executeFetch(final int shardIndex, final SearchShardTarget shardTarget,
                              final CountedCollector<FetchSearchResult> counter,
                              final ShardFetchSearchRequest fetchSearchRequest, final QuerySearchResult querySearchResult,
                              final Transport.Connection connection) {
        context.getSearchTransport().sendExecuteFetch(connection, fetchSearchRequest, context.getTask(),
            new SearchActionListener<FetchSearchResult>(shardTarget, shardIndex) {
                @Override
                public void innerOnResponse(FetchSearchResult result) {
                    try {
                        progressListener.notifyFetchResult(shardIndex);
                        counter.onResult(result);
                    } catch (Exception e) {
                        context.onPhaseFailure(FetchSearchPhase.this, "", e);
                    }
                }

                @Override
                public void onFailure(Exception e) {
                    try {
                        logger.debug(
                            () -> new ParameterizedMessage("[{}] Failed to execute fetch phase", fetchSearchRequest.contextId()), e);
                        progressListener.notifyFetchFailure(shardIndex, shardTarget, e);
                        counter.onFailure(shardIndex, shardTarget, e);
                    } finally {
                        // the search context might not be cleared on the node where the fetch was executed for example
                        // because the action was rejected by the thread pool. in this case we need to send a dedicated
                        // request to clear the search context.
                        releaseIrrelevantSearchContext(querySearchResult);
                    }
                }
            });
    }

    /**
     * Sets the result to the given array index and then runs {@link #countDown()}
     */
    void onResult(R result) {
        resultConsumer.consumeResult(result,  this::countDown);
    }

    /**
     * Forcefully counts down an operation and executes the provided runnable
     * if all expected operations where executed
     */
    void countDown() {
        assert counter.isCountedDown() == false : "more operations executed than specified";
        if (counter.countDown()) {
            onFinish.run();
        }
    }

    @Override
    void consumeResult(Result result, Runnable next) {
        assert results.get(result.getShardIndex()) == null : "shardIndex: " + result.getShardIndex() + " is already set";
        results.set(result.getShardIndex(), result);
        next.run();
    }
```

从代码在哪个可以看到Fetch后的结果保存到了counter中，而counter是定义在innerRun内：

```
final CountedCollector<FetchSearchResult> counter = new CountedCollector<>(fetchResults,
                    docIdsToLoad.length, // we count down every shard in the result no matter if we got any results or not
                    finishPhase, context);
```

fetchResults用于存储从某个shard收集的结果，每收到一个shard数据就执行一次counter.countDown()。当所有shard收集完成之后，countDown会触发执行finishPhase：

```
// FetchSearchPhase类中
final Runnable finishPhase = ()
            -> moveToNextPhase(searchPhaseController, queryResults, reducedQueryPhase, queryAndFetchOptimization ?
            queryResults : fetchResults.getAtomicArray());

// FetchSearchPhase类中
private final SearchPhaseContext context;
private void moveToNextPhase(SearchPhaseController searchPhaseController,
                                 AtomicArray<SearchPhaseResult> queryPhaseResults,
                                 SearchPhaseController.ReducedQueryPhase reducedQueryPhase,
                                 AtomicArray<? extends SearchPhaseResult> fetchResultsArr) {
        final InternalSearchResponse internalResponse = searchPhaseController.merge(context.getRequest().scroll() != null,
            reducedQueryPhase, fetchResultsArr.asList(), fetchResultsArr::get);
        context.executeNextPhase(this, nextPhaseFactory.apply(internalResponse, queryPhaseResults));
    }

// FetchSearchPhase 构造函数
FetchSearchPhase(SearchPhaseResults<SearchPhaseResult> resultConsumer,
                     SearchPhaseController searchPhaseController,
                     AggregatedDfs aggregatedDfs,
                     SearchPhaseContext context) {
        this(resultConsumer, searchPhaseController, aggregatedDfs, context,
            (response, queryPhaseResults) -> new ExpandSearchPhase(context, response, queryPhaseResults));
    }
```

获取查询结果之后，进入[ExpandSearchPhase](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/search/ExpandSearchPhase.java)类中的run():

```
	// 主要判断是否启用字段折叠（field collapsing），根据需要实现字段折叠，
	// 如果没有实现，直接返回给客户端。
    @Override
    public void run() {
        if (isCollapseRequest() && searchResponse.hits().getHits().length > 0) {
            SearchRequest searchRequest = context.getRequest();
            CollapseBuilder collapseBuilder = searchRequest.source().collapse();
            final List<InnerHitBuilder> innerHitBuilders = collapseBuilder.getInnerHits();
            MultiSearchRequest multiRequest = new MultiSearchRequest();
            if (collapseBuilder.getMaxConcurrentGroupRequests() > 0) {
                multiRequest.maxConcurrentSearchRequests(collapseBuilder.getMaxConcurrentGroupRequests());
            }
            for (SearchHit hit : searchResponse.hits().getHits()) {
                BoolQueryBuilder groupQuery = new BoolQueryBuilder();
                Object collapseValue = hit.field(collapseBuilder.getField()).getValue();
                if (collapseValue != null) {
                    groupQuery.filter(QueryBuilders.matchQuery(collapseBuilder.getField(), collapseValue));
                } else {
                    groupQuery.mustNot(QueryBuilders.existsQuery(collapseBuilder.getField()));
                }
                QueryBuilder origQuery = searchRequest.source().query();
                if (origQuery != null) {
                    groupQuery.must(origQuery);
                }
                for (InnerHitBuilder innerHitBuilder : innerHitBuilders) {
                    CollapseBuilder innerCollapseBuilder = innerHitBuilder.getInnerCollapseBuilder();
                    SearchSourceBuilder sourceBuilder = buildExpandSearchSourceBuilder(innerHitBuilder, innerCollapseBuilder)
                        .query(groupQuery)
                        .postFilter(searchRequest.source().postFilter())
                        .runtimeMappings(searchRequest.source().runtimeMappings());
                    SearchRequest groupRequest = new SearchRequest(searchRequest);
                    groupRequest.source(sourceBuilder);
                    multiRequest.add(groupRequest);
                }
            }
            context.getSearchTransport().sendExecuteMultiSearch(multiRequest, context.getTask(),
                ActionListener.wrap(response -> {
                    Iterator<MultiSearchResponse.Item> it = response.iterator();
                    for (SearchHit hit : searchResponse.hits.getHits()) {
                        for (InnerHitBuilder innerHitBuilder : innerHitBuilders) {
                            MultiSearchResponse.Item item = it.next();
                            if (item.isFailure()) {
                                context.onPhaseFailure(this, "failed to expand hits", item.getFailure());
                                return;
                            }
                            SearchHits innerHits = item.getResponse().getHits();
                            if (hit.getInnerHits() == null) {
                                hit.setInnerHits(new HashMap<>(innerHitBuilders.size()));
                            }
                            hit.getInnerHits().put(innerHitBuilder.getName(), innerHits);
                        }
                    }
                    context.sendSearchResponse(searchResponse, queryResults);
                }, context::onFailure)
            );
        } else {
            context.sendSearchResponse(searchResponse, queryResults);
        }
    }
```

看到这里还是没有发现针对-\*有什么特殊的优化，还是会根据检索条件遍历符合条件的所有索引及其shard。那下面看那一下具体获取数据的时候有没有什么特殊处理，也就是data node 在Query、Fetch阶段有没有什么特殊的优化？

下面看一下[SearchTransportService](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/search/SearchTransportService.java)下的[sendExecuteQuery](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/search/SearchTransportService.java#L139)

```
public void sendExecuteQuery(Transport.Connection connection, final ShardSearchRequest request, SearchTask task,
                                 final SearchActionListener<SearchPhaseResult> listener) {
        // we optimize this and expect a QueryFetchSearchResult if we only have a single shard in the search request
        // this used to be the QUERY_AND_FETCH which doesn't exist anymore.
        final boolean fetchDocuments = request.numberOfShards() == 1;
        Writeable.Reader<SearchPhaseResult> reader = fetchDocuments ? QueryFetchSearchResult::new : QuerySearchResult::new;

        final ActionListener handler = responseWrapper.apply(connection, listener);
        transportService.sendChildRequest(connection, QUERY_ACTION_NAME, request, task,
                new ConnectionCountingHandler<>(handler, reader, clientConnections, connection.getNode().getId()));
    }
```

通过请求路径QUERY_ACTION_NAME可以在SearchTransportService中找到对应的处理函数searchService.executeQueryPhase：

```
 transportService.registerRequestHandler(QUERY_ACTION_NAME, ThreadPool.Names.SAME, ShardSearchRequest::new,
            (request, channel, task) -> {
                searchService.executeQueryPhase(request, keepStatesInContext(channel.getVersion()), (SearchShardTask) task,
                    new ChannelActionListener<>(channel, QUERY_ACTION_NAME, request));
            });
```

下面具体看一下执行：

```
public void executeQueryPhase(ShardSearchRequest request, boolean keepStatesInContext,
                                  SearchShardTask task, ActionListener<SearchPhaseResult> listener) {
        assert request.canReturnNullResponseIfMatchNoDocs() == false || request.numberOfShards() > 1
            : "empty responses require more than one shard";
        final IndexShard shard = getShard(request);
        rewriteAndFetchShardRequest(shard, request, new ActionListener<ShardSearchRequest>() {
            @Override
            public void onResponse(ShardSearchRequest orig) {
                // check if we can shortcut the query phase entirely.
                if (orig.canReturnNullResponseIfMatchNoDocs()) {
                    assert orig.scroll() == null;
                    final CanMatchResponse canMatchResp;
                    try {
                        ShardSearchRequest clone = new ShardSearchRequest(orig);
                        canMatchResp = canMatch(clone, false);
                    } catch (Exception exc) {
                        listener.onFailure(exc);
                        return;
                    }
                    if (canMatchResp.canMatch == false) {
                        listener.onResponse(QuerySearchResult.nullInstance());
                        return;
                    }
                }
                // fork the execution in the search thread pool
                runAsync(getExecutor(shard), () -> executeQueryPhase(orig, task, keepStatesInContext), listener);
            }

            @Override
            public void onFailure(Exception exc) {
                listener.onFailure(exc);
            }
        });
    }


    private SearchPhaseResult executeQueryPhase(ShardSearchRequest request,
                                                SearchShardTask task,
                                                boolean keepStatesInContext) throws Exception {
        final ReaderContext readerContext = createOrGetReaderContext(request, keepStatesInContext);
        try (Releasable ignored = readerContext.markAsUsed(getKeepAlive(request));
                SearchContext context = createContext(readerContext, request, task, true)) {
            final long afterQueryTime;
            try (SearchOperationListenerExecutor executor = new SearchOperationListenerExecutor(context)) {
                loadOrExecuteQueryPhase(request, context);
                if (context.queryResult().hasSearchContext() == false && readerContext.singleSession()) {
                    freeReaderContext(readerContext.id());
                }
                afterQueryTime = executor.success();
            }
            if (request.numberOfShards() == 1) {
                return executeFetchPhase(readerContext, context, afterQueryTime);
            } else {
                // Pass the rescoreDocIds to the queryResult to send them the coordinating node and receive them back in the fetch phase.
                // We also pass the rescoreDocIds to the LegacyReaderContext in case the search state needs to stay in the data node.
                final RescoreDocIds rescoreDocIds = context.rescoreDocIds();
                context.queryResult().setRescoreDocIds(rescoreDocIds);
                readerContext.setRescoreDocIds(rescoreDocIds);
                return context.queryResult();
            }
        } catch (Exception e) {
            // execution exception can happen while loading the cache, strip it
            if (e instanceof ExecutionException) {
                e = (e.getCause() == null || e.getCause() instanceof Exception) ?
                    (Exception) e.getCause() : new ElasticsearchException(e.getCause());
            }
            logger.trace("Query phase failed", e);
            processFailure(readerContext, e);
            throw e;
        }
    }

    /**
     * Try to load the query results from the cache or execute the query phase directly if the cache cannot be used.
     */
    private void loadOrExecuteQueryPhase(final ShardSearchRequest request, final SearchContext context) throws Exception {

        // 关于cache更多的介绍参见：
        // https://www.elastic.co/guide/en/elasticsearch/reference/current/shard-request-cache.html
        final boolean canCache = indicesService.canCache(request, context);
        context.getSearchExecutionContext().freezeContext();
        if (canCache) {
            indicesService.loadIntoContext(request, context, queryPhase);
        } else {
            queryPhase.execute(context);
        }
    }

    /**
     * Can the shard request be cached at all?
     */
    public boolean canCache(ShardSearchRequest request, SearchContext context) {
        // Queries that create a scroll context cannot use the cache.
        // They modify the search context during their execution so using the cache
        // may invalidate the scroll for the next query.
        if (request.scroll() != null) {
            return false;
        }

        // We cannot cache with DFS because results depend not only on the content of the index but also
        // on the overridden statistics. So if you ran two queries on the same index with different stats
        // (because an other shard was updated) you would get wrong results because of the scores
        // (think about top_hits aggs or scripts using the score)
        if (SearchType.QUERY_THEN_FETCH != context.searchType()) {
            return false;
        }

        // Profiled queries should not use the cache
        if (request.source() != null && request.source().profile()) {
            return false;
        }

        IndexSettings settings = context.indexShard().indexSettings();
        // if not explicitly set in the request, use the index setting, if not, use the request
        if (request.requestCache() == null) {
            if (settings.getValue(IndicesRequestCache.INDEX_CACHE_REQUEST_ENABLED_SETTING) == false) {
                return false;
            } else if (context.size() != 0) {
                // If no request cache query parameter and shard request cache
                // is enabled in settings don't cache for requests with size > 0
                return false;
            }
        } else if (request.requestCache() == false) {
            return false;
        }
        // We use the cacheKey of the index reader as a part of a key of the IndicesRequestCache.
        assert context.searcher().getIndexReader().getReaderCacheHelper() != null;

        // if now in millis is used (or in the future, a more generic "isDeterministic" flag
        // then we can't cache based on "now" key within the search request, as it is not deterministic
        if (context.getSearchExecutionContext().isCacheable() == false) {
            return false;
        }
        return true;

    }
```

先略过cache部分，重点看一下QueryPhase类中的execute：

```
public void execute(SearchContext searchContext) throws QueryPhaseExecutionException {
        if (searchContext.hasOnlySuggest()) {
            suggestPhase.execute(searchContext);
            searchContext.queryResult().topDocs(new TopDocsAndMaxScore(
                    new TopDocs(new TotalHits(0, TotalHits.Relation.EQUAL_TO), Lucene.EMPTY_SCORE_DOCS), Float.NaN),
                new DocValueFormat[0]);
            return;
        }

        if (LOGGER.isTraceEnabled()) {
            LOGGER.trace("{}", new SearchContextSourcePrinter(searchContext));
        }

        // Pre-process aggregations as late as possible. In the case of a DFS_Q_T_F
        // request, preProcess is called on the DFS phase phase, this is why we pre-process them
        // here to make sure it happens during the QUERY phase
        aggregationPhase.preProcess(searchContext);
        boolean rescore = executeInternal(searchContext);

        if (rescore) { // only if we do a regular search
            rescorePhase.execute(searchContext);
        }
        suggestPhase.execute(searchContext);
        aggregationPhase.execute(searchContext);

        if (searchContext.getProfilers() != null) {
            ProfileShardResult shardResults = SearchProfileShardResults
                .buildShardResults(searchContext.getProfilers());
            searchContext.queryResult().profileResults(shardResults);
        }
    }

     /**
     * In a package-private method so that it can be tested without having to
     * wire everything (mapperService, etc.)
     * @return whether the rescoring phase should be executed
     */
    static boolean executeInternal(SearchContext searchContext) throws QueryPhaseExecutionException {
        final ContextIndexSearcher searcher = searchContext.searcher();
        SortAndFormats sortAndFormatsForRewrittenNumericSort = null;
        final IndexReader reader = searcher.getIndexReader();
        QuerySearchResult queryResult = searchContext.queryResult();
        queryResult.searchTimedOut(false);
        try {
            queryResult.from(searchContext.from());
            queryResult.size(searchContext.size());
            Query query = searchContext.query();
            assert query == searcher.rewrite(query); // already rewritten

            final ScrollContext scrollContext = searchContext.scrollContext();
            if (scrollContext != null) {
                if (scrollContext.totalHits == null) {
                    // first round
                    assert scrollContext.lastEmittedDoc == null;
                    // there is not much that we can optimize here since we want to collect all
                    // documents in order to get the total number of hits

                } else {
                    final ScoreDoc after = scrollContext.lastEmittedDoc;
                    if (returnsDocsInOrder(query, searchContext.sort())) {
                        // now this gets interesting: since we sort in index-order, we can directly
                        // skip to the desired doc
                        if (after != null) {
                            query = new BooleanQuery.Builder()
                                .add(query, BooleanClause.Occur.MUST)
                                .add(new MinDocQuery(after.doc + 1), BooleanClause.Occur.FILTER)
                                .build();
                        }
                        // ... and stop collecting after ${size} matches
                        searchContext.terminateAfter(searchContext.size());
                    } else if (canEarlyTerminate(reader, searchContext.sort())) {
                        // now this gets interesting: since the search sort is a prefix of the index sort, we can directly
                        // skip to the desired doc
                        if (after != null) {
                            query = new BooleanQuery.Builder()
                                .add(query, BooleanClause.Occur.MUST)
                                .add(new SearchAfterSortedDocQuery(searchContext.sort().sort, (FieldDoc) after), BooleanClause.Occur.FILTER)
                                .build();
                        }
                    }
                }
            }

            final LinkedList<QueryCollectorContext> collectors = new LinkedList<>();
            // whether the chain contains a collector that filters documents
            boolean hasFilterCollector = false;
            if (searchContext.terminateAfter() != SearchContext.DEFAULT_TERMINATE_AFTER) {
                // add terminate_after before the filter collectors
                // it will only be applied on documents accepted by these filter collectors
                collectors.add(createEarlyTerminationCollectorContext(searchContext.terminateAfter()));
                // this collector can filter documents during the collection
                hasFilterCollector = true;
            }
            if (searchContext.parsedPostFilter() != null) {
                // add post filters before aggregations
                // it will only be applied to top hits
                collectors.add(createFilteredCollectorContext(searcher, searchContext.parsedPostFilter().query()));
                // this collector can filter documents during the collection
                hasFilterCollector = true;
            }
            if (searchContext.queryCollectors().isEmpty() == false) {
                // plug in additional collectors, like aggregations
                collectors.add(createMultiCollectorContext(searchContext.queryCollectors().values()));
            }
            if (searchContext.minimumScore() != null) {
                // apply the minimum score after multi collector so we filter aggs as well
                collectors.add(createMinScoreCollectorContext(searchContext.minimumScore()));
                // this collector can filter documents during the collection
                hasFilterCollector = true;
            }

            CheckedConsumer<List<LeafReaderContext>, IOException> leafSorter = l -> {};
            // try to rewrite numeric or date sort to the optimized distanceFeatureQuery
            // 更详细的参见：https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-distance-feature-query.html
            if ((searchContext.sort() != null) && SYS_PROP_REWRITE_SORT) {
                Query rewrittenQuery = tryRewriteLongSort(searchContext, searcher.getIndexReader(), query, hasFilterCollector);
                if (rewrittenQuery != null) {
                    query = rewrittenQuery;
                    // modify sorts: add sort on _score as 1st sort, and move the sort on the original field as the 2nd sort
                    SortField[] oldSortFields = searchContext.sort().sort.getSort();
                    DocValueFormat[] oldFormats = searchContext.sort().formats;
                    SortField[] newSortFields = new SortField[oldSortFields.length + 1];
                    DocValueFormat[] newFormats = new DocValueFormat[oldSortFields.length + 1];
                    newSortFields[0] = SortField.FIELD_SCORE;
                    newFormats[0] = DocValueFormat.RAW;
                    System.arraycopy(oldSortFields, 0, newSortFields, 1, oldSortFields.length);
                    System.arraycopy(oldFormats, 0, newFormats, 1, oldFormats.length);
                    sortAndFormatsForRewrittenNumericSort = searchContext.sort(); // stash SortAndFormats to restore it later
                    searchContext.sort(new SortAndFormats(new Sort(newSortFields), newFormats));
                    leafSorter = createLeafSorter(oldSortFields[0]);
                }
            }

            boolean timeoutSet = scrollContext == null && searchContext.timeout() != null &&
                searchContext.timeout().equals(SearchService.NO_TIMEOUT) == false;

            final Runnable timeoutRunnable;
            if (timeoutSet) {
                final long startTime = searchContext.getRelativeTimeInMillis();
                final long timeout = searchContext.timeout().millis();
                final long maxTime = startTime + timeout;
                timeoutRunnable = searcher.addQueryCancellation(() -> {
                    final long time = searchContext.getRelativeTimeInMillis();
                    if (time > maxTime) {
                        throw new TimeExceededException();
                    }
                });
            } else {
                timeoutRunnable = null;
            }

            if (searchContext.lowLevelCancellation()) {
                searcher.addQueryCancellation(() -> {
                    SearchShardTask task = searchContext.getTask();
                    if (task != null && task.isCancelled()) {
                        throw new TaskCancelledException("cancelled");
                    }
                });
            }

            try {

                // 检索数据 searchWithCollectorManager、searchWithCollector
                boolean shouldRescore;
                // if we are optimizing sort and there are no other collectors
                if (sortAndFormatsForRewrittenNumericSort != null && collectors.size() == 0 && searchContext.getProfilers() == null) {
                    shouldRescore = searchWithCollectorManager(searchContext, searcher, query, leafSorter, timeoutSet);
                } else {
                    shouldRescore = searchWithCollector(searchContext, searcher, query, collectors, hasFilterCollector, timeoutSet);
                }

                // if we rewrote numeric long or date sort, restore fieldDocs based on the original sort
                if (sortAndFormatsForRewrittenNumericSort != null) {
                    searchContext.sort(sortAndFormatsForRewrittenNumericSort); // restore SortAndFormats
                    restoreTopFieldDocs(queryResult, sortAndFormatsForRewrittenNumericSort);
                }

                ExecutorService executor = searchContext.indexShard().getThreadPool().executor(ThreadPool.Names.SEARCH);
                assert executor instanceof EWMATrackingEsThreadPoolExecutor ||
                    (executor instanceof EsThreadPoolExecutor == false /* in case thread pool is mocked out in tests */) :
                    "SEARCH threadpool should have an executor that exposes EWMA metrics, but is of type " + executor.getClass();
                if (executor instanceof EWMATrackingEsThreadPoolExecutor) {
                    EWMATrackingEsThreadPoolExecutor rExecutor = (EWMATrackingEsThreadPoolExecutor) executor;
                    queryResult.nodeQueueSize(rExecutor.getCurrentQueueSize());
                    queryResult.serviceTimeEWMA((long) rExecutor.getTaskExecutionEWMA());
                }

                return shouldRescore;
            } finally {
                // Search phase has finished, no longer need to check for timeout
                // otherwise aggregation phase might get cancelled.
                if (timeoutRunnable != null) {
                   searcher.removeQueryCancellation(timeoutRunnable);
                }
            }
        } catch (Exception e) {
            throw new QueryPhaseExecutionException(searchContext.shardTarget(), "Failed to execute main query", e);
        }
    }
```

searchWithCollectorManager与searchWithCollector都是调用[ContextIndexSearcher](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/search/internal/ContextIndexSearcher.java)类中的search调用Lucene接口进行查询。

到目前为止都没发现，针对-\*查询都没有任何优化。

唯一有希望进行优化的地方就是通过luece检索shard的时候，会进行优化，事实上会进行一定的优化，比如借助Lucene的PointValues来优化IntField，LongField，FloatField，DoubleField。

但不管怎么优化，对于搜索而言，还是能缩小范围就缩小，不管怎么优化，都不是一点成本没有的。

# 总结

elasticsearch针对-\*检索不会在索引、shard层面优化，但会在检索具体shard的时候，通过luece的特性来快速调过一些不符合条件的shard。但这些特性不能保证一定会快速检索某些shard，因为很有可能你的检索条件位于shard的上下限之间。

所以说，还是在数据入es时，拆分到合适的索引，效果最好。

推荐阅读：

* https://jiankunking.com/elasticsearch-performance-tuning-practice-at-ebay.html

* https://www.easyice.cn/archives/350

* https://www.elastic.co/guide/en/elasticsearch/reference/7.11/range.html

