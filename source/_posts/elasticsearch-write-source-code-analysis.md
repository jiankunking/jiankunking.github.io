---
title: 【Elasticsearch源码】 写入分析
categories:
  - ElasticSearch
tags:
  - ElasticSearch
  - Write
  - Index
  - 源码
  - 原创
abbrlink: 5645
date: 2021-01-16 11:30:37
---

> 带着疑问学源码，第一篇：Elasticsearch写入
> 代码分析基于：https://github.com/jiankunking/elasticsearch 
> Elasticsearch 7.10.2+

<!-- more -->

# 目的
在看源码之前先梳理一下，自己对于写入流程疑惑的点：
Elasticsearch写入是等待所有副本都写入完成了才返回还是只要主副本写入了就返回？
副本写入成功的标准是什么？
wait_for_active_shard参数的作用是啥？

# 源码分析

<font color=DeepPink>**第二部分是代码分析的过程，不想看的朋友可以跳过直接看第三部分总结。**</font>

分析的话，咱们就以_bulk操作为主线。

通过搜索_bulk API找到[RestBulkAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/rest/action/document/RestBulkAction.java)。在[RestBulkAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/rest/action/document/RestBulkAction.java)可以看到：

1、[路由注册](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/rest/action/document/RestBulkAction.java#L58)
```
    @Override
    public List<Route> routes() {
        return List.of(
            new Route(POST, "/_bulk"),
            new Route(PUT, "/_bulk"),
            new Route(POST, "/{index}/_bulk"),
            new Route(PUT, "/{index}/_bulk"));
    }
```

2、[请求参数转换](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/rest/action/document/RestBulkAction.java#L72)
```
    @Override
    public RestChannelConsumer prepareRequest(final RestRequest request, final NodeClient client) throws IOException {
        BulkRequest bulkRequest = Requests.bulkRequest();
        String defaultIndex = request.param("index");
        String defaultRouting = request.param("routing");
        FetchSourceContext defaultFetchSourceContext = FetchSourceContext.parseFromRestRequest(request);
        String defaultPipeline = request.param("pipeline");
        String waitForActiveShards = request.param("wait_for_active_shards");
        if (waitForActiveShards != null) {
            bulkRequest.waitForActiveShards(ActiveShardCount.parseString(waitForActiveShards));
        }
        Boolean defaultRequireAlias = request.paramAsBoolean(DocWriteRequest.REQUIRE_ALIAS, null);
        bulkRequest.timeout(request.paramAsTime("timeout", BulkShardRequest.DEFAULT_TIMEOUT));
        bulkRequest.setRefreshPolicy(request.param("refresh"));
        bulkRequest.add(request.requiredContent(), defaultIndex, defaultRouting,
            defaultFetchSourceContext, defaultPipeline, defaultRequireAlias, allowExplicitIndex, request.getXContentType());

        return channel -> client.bulk(bulkRequest, new RestStatusToXContentListener<>(channel));
    }
```

从代码中可以看到RestRequest解析并转化为BulkRequest，再通过[NodeClient](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/client/node/NodeClient.java)对bulkRequest进行处理。

bulk方法是在[AbstractClient](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/client/support/AbstractClient.java#L462)，但实际执行的方法是[NodeClient](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/client/node/NodeClient.java#L85)中的doExecute。

```
    @Override
    public <Request extends ActionRequest, Response extends ActionResponse>
    void doExecute(ActionType<Response> action, Request request, ActionListener<Response> listener) {
        // Discard the task because the Client interface doesn't use it.
        try {
            executeLocally(action, request, listener);
        } catch (TaskCancelledException | IllegalArgumentException | IllegalStateException e) {
            // #executeLocally returns the task and throws TaskCancelledException if it fails to register the task because the parent
            // task has been cancelled, IllegalStateException if the client was not in a state to execute the request because it was not
            // yet properly initialized or IllegalArgumentException if header validation fails we forward them to listener since this API
            // does not concern itself with the specifics of the task handling
            listener.onFailure(e);
        }
    }

    /**
     * Execute an {@link ActionType} locally, returning that {@link Task} used to track it, and linking an {@link ActionListener}.
     * Prefer this method if you don't need access to the task when listening for the response. This is the method used to
     * implement the {@link Client} interface.
     *
     * @throws TaskCancelledException if the request's parent task has been cancelled already
     */
    public <    Request extends ActionRequest,
                Response extends ActionResponse
            > Task executeLocally(ActionType<Response> action, Request request, ActionListener<Response> listener) {
        return taskManager.registerAndExecute("transport", transportAction(action), request, localConnection,
                (t, r) -> {
                    try {
                        listener.onResponse(r);
                    } catch (Exception e) {
                        assert false : new AssertionError("callback must handle its own exceptions", e);
                        throw e;
                    }
                }, (t, e) -> {
                    try {
                        listener.onFailure(e);
                    } catch (Exception ex) {
                        ex.addSuppressed(e);
                        assert false : new AssertionError("callback must handle its own exceptions", ex);
                        throw ex;
                    }
                });
    }
```
NodeClient在处理BulkRequest请求时，会将请求的action转化为对应Transport层的action，再由[TaskManager](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/tasks/TaskManager.java)的[registerAndExecute](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/tasks/TaskManager.java#L158)将请求转发到[TransportAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/TransportAction.java)中的[execute](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/TransportAction.java#L52)来进行处理。
```
public <Request extends ActionRequest, Response extends ActionResponse>
    Task registerAndExecute(String type, TransportAction<Request, Response> action, Request request, Transport.Connection localConnection,
                            BiConsumer<Task, Response> onResponse, BiConsumer<Task, Exception> onFailure) {
        final Releasable unregisterChildNode;
        if (request.getParentTask().isSet()) {
            unregisterChildNode = registerChildConnection(request.getParentTask().getId(), localConnection);
        } else {
            unregisterChildNode = () -> {};
        }
        final Task task;
        try {
            task = register(type, action.actionName, request);
        } catch (TaskCancelledException e) {
            unregisterChildNode.close();
            throw e;
        }
        // NOTE: ActionListener cannot infer Response, see https://bugs.openjdk.java.net/browse/JDK-8203195
        action.execute(task, request, new ActionListener<Response>() {
            @Override
            public void onResponse(Response response) {
                try {
                    Releasables.close(unregisterChildNode, () -> unregister(task));
                } finally {
                    onResponse.accept(task, response);
                }
            }

            @Override
            public void onFailure(Exception e) {
                try {
                    Releasables.close(unregisterChildNode, () -> unregister(task));
                } finally {
                    onFailure.accept(task, e);
                }
            }
        });
        return task;
    }
```
[TransportAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/TransportAction.java)中的[execute](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/TransportAction.java#L52)代码如下：
```
     /**
     * Use this method when the transport action should continue to run in the context of the current task
     */
    public final void execute(Task task, Request request, ActionListener<Response> listener) {
        ActionRequestValidationException validationException = request.validate();
        if (validationException != null) {
            listener.onFailure(validationException);
            return;
        }

        if (task != null && request.getShouldStoreResult()) {
            listener = new TaskResultStoringActionListener<>(taskManager, task, listener);
        }

        RequestFilterChain<Request, Response> requestFilterChain = new RequestFilterChain<>(this, logger);
        requestFilterChain.proceed(task, actionName, request, listener);
    }

     /**
     * Continue processing the request. Should only be called if a response has not been sent through
     * the given {@link ActionListener listener}
     * 摘自父类ActionFilterChain的注释
     */
    @Override
    public void proceed(Task task, String actionName, Request request, ActionListener<Response> listener) {
            int i = index.getAndIncrement();
            try {
                if (i < this.action.filters.length) {
                    // 先执行filter逻辑
                    this.action.filters[i].apply(task, actionName, request, listener, this);
                } else if (i == this.action.filters.length) {
                    // 执行TransportAction逻辑
                    this.action.doExecute(task, request, listener);
                } else {
                    listener.onFailure(new IllegalStateException("proceed was called too many times"));
                }
            } catch(Exception e) {
                logger.trace("Error during transport action execution.", e);
                listener.onFailure(e);
            }
        }
```

下面看一下到[TransportBulkAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/bulk/TransportBulkAction.java)中看一下[doExecute](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/bulk/TransportBulkAction.java#L161)具体做了啥？

```
     /**
     * Use this method when the transport action should continue to run in the context of the current task
     * 摘自父类TransportAction的注释
     */
    @Override
    protected void doExecute(Task task, BulkRequest bulkRequest, ActionListener<BulkResponse> listener) {
        final int indexingOps = bulkRequest.numberOfActions();
        final long indexingBytes = bulkRequest.ramBytesUsed();
        final boolean isOnlySystem = isOnlySystem(bulkRequest, clusterService.state().metadata().getIndicesLookup(), systemIndices);
        final Releasable releasable = indexingPressure.markCoordinatingOperationStarted(indexingOps, indexingBytes, isOnlySystem);
        final ActionListener<BulkResponse> releasingListener = ActionListener.runBefore(listener, releasable::close);
        final String executorName = isOnlySystem ? Names.SYSTEM_WRITE : Names.WRITE;
        try {
            doInternalExecute(task, bulkRequest, executorName, releasingListener);
        } catch (Exception e) {
            releasingListener.onFailure(e);
        }
    }

    protected void doInternalExecute(Task task, BulkRequest bulkRequest, String executorName, ActionListener<BulkResponse> listener) {
        final long startTime = relativeTime();
        final AtomicArray<BulkItemResponse> responses = new AtomicArray<>(bulkRequest.requests.size());

        boolean hasIndexRequestsWithPipelines = false;
        final Metadata metadata = clusterService.state().getMetadata();
        final Version minNodeVersion = clusterService.state().getNodes().getMinNodeVersion();
        for (DocWriteRequest<?> actionRequest : bulkRequest.requests) {
            IndexRequest indexRequest = getIndexWriteRequest(actionRequest);
            if (indexRequest != null) {
                // Each index request needs to be evaluated, because this method also modifies the IndexRequest
                boolean indexRequestHasPipeline = IngestService.resolvePipelines(actionRequest, indexRequest, metadata);
                hasIndexRequestsWithPipelines |= indexRequestHasPipeline;
            }

            if (actionRequest instanceof IndexRequest) {
                IndexRequest ir = (IndexRequest) actionRequest;
                ir.checkAutoIdWithOpTypeCreateSupportedByVersion(minNodeVersion);
                if (ir.getAutoGeneratedTimestamp() != IndexRequest.UNSET_AUTO_GENERATED_TIMESTAMP) {
                    throw new IllegalArgumentException("autoGeneratedTimestamp should not be set externally");
                }
            }
        }

        if (hasIndexRequestsWithPipelines) {
            // this method (doExecute) will be called again, but with the bulk requests updated from the ingest node processing but
            // also with IngestService.NOOP_PIPELINE_NAME on each request. This ensures that this on the second time through this method,
            // this path is never taken.
            try {
                if (Assertions.ENABLED) {
                    final boolean arePipelinesResolved = bulkRequest.requests()
                        .stream()
                        .map(TransportBulkAction::getIndexWriteRequest)
                        .filter(Objects::nonNull)
                        .allMatch(IndexRequest::isPipelineResolved);
                    assert arePipelinesResolved : bulkRequest;
                }
                if (clusterService.localNode().isIngestNode()) {
                    processBulkIndexIngestRequest(task, bulkRequest, executorName, listener);
                } else {
                    ingestForwarder.forwardIngestRequest(BulkAction.INSTANCE, bulkRequest, listener);
                }
            } catch (Exception e) {
                listener.onFailure(e);
            }
            return;
        }

        // Attempt to create all the indices that we're going to need during the bulk before we start.
        // Step 1: collect all the indices in the request
        final Map<String, Boolean> indices = bulkRequest.requests.stream()
            // delete requests should not attempt to create the index (if the index does not
            // exists), unless an external versioning is used
            .filter(request -> request.opType() != DocWriteRequest.OpType.DELETE
                || request.versionType() == VersionType.EXTERNAL
                || request.versionType() == VersionType.EXTERNAL_GTE)
            .collect(Collectors.toMap(DocWriteRequest::index, DocWriteRequest::isRequireAlias, (v1, v2) -> v1 || v2));

        // Step 2: filter the list of indices to find those that don't currently exist.
        final Map<String, IndexNotFoundException> indicesThatCannotBeCreated = new HashMap<>();
        Set<String> autoCreateIndices = new HashSet<>();
        ClusterState state = clusterService.state();
        for (Map.Entry<String, Boolean> indexAndFlag : indices.entrySet()) {
            final String index = indexAndFlag.getKey();
            boolean shouldAutoCreate = indexNameExpressionResolver.hasIndexAbstraction(index, state) == false;
            // We should only auto create if we are not requiring it to be an alias
            if (shouldAutoCreate && (indexAndFlag.getValue() == false)) {
                autoCreateIndices.add(index);
            }
        }

        // Step 3: create all the indices that are missing, if there are any missing. start the bulk after all the creates come back.
        if (autoCreateIndices.isEmpty()) {
            executeBulk(task, bulkRequest, startTime, listener, responses, indicesThatCannotBeCreated);
        } else {
            final AtomicInteger counter = new AtomicInteger(autoCreateIndices.size());
            for (String index : autoCreateIndices) {
                createIndex(index, bulkRequest.timeout(), minNodeVersion, new ActionListener<>() {
                    @Override
                    public void onResponse(CreateIndexResponse result) {
                        if (counter.decrementAndGet() == 0) {
                            threadPool.executor(executorName).execute(new ActionRunnable<>(listener) {

                                @Override
                                protected void doRun() {
                                    executeBulk(task, bulkRequest, startTime, listener, responses, indicesThatCannotBeCreated);
                                }
                            });
                        }
                    }

                    @Override
                    public void onFailure(Exception e) {
                        final Throwable cause = ExceptionsHelper.unwrapCause(e);
                        if (cause instanceof IndexNotFoundException) {
                            indicesThatCannotBeCreated.put(index, (IndexNotFoundException) e);
                        }
                        else if ((cause instanceof ResourceAlreadyExistsException) == false) {
                            // fail all requests involving this index, if create didn't work
                            for (int i = 0; i < bulkRequest.requests.size(); i++) {
                                DocWriteRequest<?> request = bulkRequest.requests.get(i);
                                if (request != null && setResponseFailureIfIndexMatches(responses, i, request, index, e)) {
                                    bulkRequest.requests.set(i, null);
                                }
                            }
                        }
                        if (counter.decrementAndGet() == 0) {
                            final ActionListener<BulkResponse> wrappedListener = ActionListener.wrap(listener::onResponse, inner -> {
                                inner.addSuppressed(e);
                                listener.onFailure(inner);
                            });
                            threadPool.executor(executorName).execute(new ActionRunnable<>(wrappedListener) {
                                @Override
                                protected void doRun() {
                                    executeBulk(task, bulkRequest, startTime, wrappedListener, responses, indicesThatCannotBeCreated);
                                }

                                @Override
                                public void onRejection(Exception rejectedException) {
                                    rejectedException.addSuppressed(e);
                                    super.onRejection(rejectedException);
                                }
                            });
                        }
                    }
                });
            }
        }
    }
```

以上代码的核心在于executeBulk，下面看一下[executeBulk](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/bulk/TransportBulkAction.java#L397)部分,[executeBulk](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/bulk/TransportBulkAction.java#L397)在[BulkOperation](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/bulk/TransportBulkAction.java)类中：

```
 void executeBulk(Task task, final BulkRequest bulkRequest, final long startTimeNanos, final ActionListener<BulkResponse> listener,
            final AtomicArray<BulkItemResponse> responses, Map<String, IndexNotFoundException> indicesThatCannotBeCreated) {
        new BulkOperation(task, bulkRequest, listener, responses, startTimeNanos, indicesThatCannotBeCreated).run();
    }
```
再看一下run，run的定义是在[AbstractRunnable](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/common/util/concurrent/AbstractRunnable.java),具体实现就是BulkOperation的[doRun](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/bulk/TransportBulkAction.java#L417)
```
       /**
        * This method has the same semantics as {@link Runnable#run()}
        * @throws InterruptedException if the run method throws an InterruptedException
        * 摘自父类AbstractRunnable的注释
       */
        @Override
        protected void doRun() {
            assert bulkRequest != null;
            final ClusterState clusterState = observer.setAndGetObservedState();
            if (handleBlockExceptions(clusterState)) {
                return;
            }
            final ConcreteIndices concreteIndices = new ConcreteIndices(clusterState, indexNameExpressionResolver);
            Metadata metadata = clusterState.metadata();
            for (int i = 0; i < bulkRequest.requests.size(); i++) {
                DocWriteRequest<?> docWriteRequest = bulkRequest.requests.get(i);
                //the request can only be null because we set it to null in the previous step, so it gets ignored
                if (docWriteRequest == null) {
                    continue;
                }
                if (addFailureIfRequiresAliasAndAliasIsMissing(docWriteRequest, i, metadata)) {
                    continue;
                }
                if (addFailureIfIndexIsUnavailable(docWriteRequest, i, concreteIndices, metadata)) {
                    continue;
                }
                Index concreteIndex = concreteIndices.resolveIfAbsent(docWriteRequest);
                try {
                    // The ConcreteIndices#resolveIfAbsent(...) method validates via IndexNameExpressionResolver whether
                    // an operation is allowed in index into a data stream, but this isn't done when resolve call is cached, so
                    // the validation needs to be performed here too.
                    IndexAbstraction indexAbstraction = clusterState.getMetadata().getIndicesLookup().get(concreteIndex.getName());
                    if (indexAbstraction.getParentDataStream() != null &&
                        // avoid valid cases when directly indexing into a backing index
                        // (for example when directly indexing into .ds-logs-foobar-000001)
                        concreteIndex.getName().equals(docWriteRequest.index()) == false &&
                        docWriteRequest.opType() != DocWriteRequest.OpType.CREATE) {
                        throw new IllegalArgumentException("only write ops with an op_type of create are allowed in data streams");
                    }

                    switch (docWriteRequest.opType()) {
                        case CREATE:
                        case INDEX:
                            prohibitAppendWritesInBackingIndices(docWriteRequest, metadata);
                            prohibitCustomRoutingOnDataStream(docWriteRequest, metadata);
                            IndexRequest indexRequest = (IndexRequest) docWriteRequest;
                            final IndexMetadata indexMetadata = metadata.index(concreteIndex);
                            MappingMetadata mappingMd = indexMetadata.mapping();
                            Version indexCreated = indexMetadata.getCreationVersion();
                            // 路由解析，比如别名等获取
                            indexRequest.resolveRouting(metadata);
                            // id 处理，如果没有指定id，在这里会生成id
                            indexRequest.process(indexCreated, mappingMd, concreteIndex.getName());
                            break;
                        case UPDATE:
                            // 路由解析，比如别名等获取,如果路由有问题，这里会快速失败
                            TransportUpdateAction.resolveAndValidateRouting(metadata, concreteIndex.getName(),
                                (UpdateRequest) docWriteRequest);
                            break;
                        case DELETE:
                            docWriteRequest.routing(metadata.resolveWriteIndexRouting(docWriteRequest.routing(), docWriteRequest.index()));
                            // check if routing is required, if so, throw error if routing wasn't specified
                            if (docWriteRequest.routing() == null && metadata.routingRequired(concreteIndex.getName())) {
                                throw new RoutingMissingException(concreteIndex.getName(), docWriteRequest.id());
                            }
                            break;
                        default: throw new AssertionError("request type not supported: [" + docWriteRequest.opType() + "]");
                    }
                } catch (ElasticsearchParseException | IllegalArgumentException | RoutingMissingException e) {
                    BulkItemResponse.Failure failure = new BulkItemResponse.Failure(concreteIndex.getName(),
                        docWriteRequest.id(), e);
                    BulkItemResponse bulkItemResponse = new BulkItemResponse(i, docWriteRequest.opType(), failure);
                    responses.set(i, bulkItemResponse);
                    // make sure the request gets never processed again
                    bulkRequest.requests.set(i, null);
                }
            }

            // first, go over all the requests and create a ShardId -> Operations mapping
            // 将请求按照shard维度聚合，以便同一个shard的document可以在一次请求中处理掉。
            Map<ShardId, List<BulkItemRequest>> requestsByShard = new HashMap<>();
            for (int i = 0; i < bulkRequest.requests.size(); i++) {
                DocWriteRequest<?> request = bulkRequest.requests.get(i);
                if (request == null) {
                    continue;
                }
                String concreteIndex = concreteIndices.getConcreteIndex(request.index()).getName();
                ShardId shardId = clusterService.operationRouting().indexShards(clusterState, concreteIndex, request.id(),
                    request.routing()).shardId();
                List<BulkItemRequest> shardRequests = requestsByShard.computeIfAbsent(shardId, shard -> new ArrayList<>());
                shardRequests.add(new BulkItemRequest(i, request));
            }

            if (requestsByShard.isEmpty()) {
                listener.onResponse(new BulkResponse(responses.toArray(new BulkItemResponse[responses.length()]),
                    buildTookInMillis(startTimeNanos)));
                return;
            }

            final AtomicInteger counter = new AtomicInteger(requestsByShard.size());
            String nodeId = clusterService.localNode().getId();
            for (Map.Entry<ShardId, List<BulkItemRequest>> entry : requestsByShard.entrySet()) {
                final ShardId shardId = entry.getKey();
                final List<BulkItemRequest> requests = entry.getValue();
                BulkShardRequest bulkShardRequest = new BulkShardRequest(shardId, bulkRequest.getRefreshPolicy(),
                        requests.toArray(new BulkItemRequest[requests.size()]));
                bulkShardRequest.waitForActiveShards(bulkRequest.waitForActiveShards());
                bulkShardRequest.timeout(bulkRequest.timeout());
                bulkShardRequest.routedBasedOnClusterVersion(clusterState.version());
                if (task != null) {
                    bulkShardRequest.setParentTask(nodeId, task.getId());
                }
                client.executeLocally(TransportShardBulkAction.TYPE, bulkShardRequest, new ActionListener<>() {
                    @Override
                    public void onResponse(BulkShardResponse bulkShardResponse) {
                        for (BulkItemResponse bulkItemResponse : bulkShardResponse.getResponses()) {
                            // we may have no response if item failed
                            if (bulkItemResponse.getResponse() != null) {
                                bulkItemResponse.getResponse().setShardInfo(bulkShardResponse.getShardInfo());
                            }
                            responses.set(bulkItemResponse.getItemId(), bulkItemResponse);
                        }
                        if (counter.decrementAndGet() == 0) {
                            finishHim();
                        }
                    }

                    @Override
                    public void onFailure(Exception e) {
                        // create failures for all relevant requests
                        for (BulkItemRequest request : requests) {
                            final String indexName = concreteIndices.getConcreteIndex(request.index()).getName();
                            DocWriteRequest<?> docWriteRequest = request.request();
                            responses.set(request.id(), new BulkItemResponse(request.id(), docWriteRequest.opType(),
                                    new BulkItemResponse.Failure(indexName, docWriteRequest.id(), e)));
                        }
                        if (counter.decrementAndGet() == 0) {
                            finishHim();
                        }
                    }

                    private void finishHim() {
                        listener.onResponse(new BulkResponse(responses.toArray(new BulkItemResponse[responses.length()]),
                            buildTookInMillis(startTimeNanos)));
                    }
                });
            }
            bulkRequest = null; // allow memory for bulk request items to be reclaimed before all items have been completed
        }

```

这里需要注意的是：又到了NodeClient executeLocally方法了:
```
NodeClient executeLocally=>
TaskManager registerAndExecute=>
action execute(此处action为TransportShardBulkAction.TYPE)=>
TransportAction execute =>
TransportAction proceed => 
action doExecute(此处action为TransportShardBulkAction.TYPE)=>
......
```

下面到[TransportShardBulkAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/bulk/TransportShardBulkAction.java)中找一下doExecute,最终在TransportShardBulkAction的父类TransportReplicationAction中找到了[doExecute](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/replication/TransportReplicationAction.java#L182)：

![](/images/elasticsearch-write-source-code-analysis/TransportShardBulkAction.png)

```
    @Override
    protected void doExecute(Task task, Request request, ActionListener<Response> listener) {
        assert request.shardId() != null : "request shardId must be set";
        runReroutePhase(task, request, listener, true);
    }

    private void runReroutePhase(Task task, Request request, ActionListener<Response> listener, boolean initiatedByNodeClient) {
        try {
            // ReroutePhase也是继承 AbstractRunnable 从而要到ReroutePhase找 doRun
            new ReroutePhase((ReplicationTask) task, request, listener, initiatedByNodeClient).run();
        } catch (RuntimeException e) {
            listener.onFailure(e);
        }
```
[ReroutePhase](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/replication/TransportReplicationAction.java#L669)类中[doRun()](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/replication/TransportReplicationAction.java#L698)方法如下：
```
        @Override
        protected void doRun() {
            setPhase(task, "routing");
            final ClusterState state = observer.setAndGetObservedState();
            final ClusterBlockException blockException = blockExceptions(state, request.shardId().getIndexName());
            if (blockException != null) {
                if (blockException.retryable()) {
                    logger.trace("cluster is blocked, scheduling a retry", blockException);
                    retry(blockException);
                } else {
                    finishAsFailed(blockException);
                }
            } else {
                final IndexMetadata indexMetadata = state.metadata().index(request.shardId().getIndex());
                if (indexMetadata == null) {
                    // ensure that the cluster state on the node is at least as high as the node that decided that the index was there
                    if (state.version() < request.routedBasedOnClusterVersion()) {
                        logger.trace("failed to find index [{}] for request [{}] despite sender thinking it would be here. " +
                                "Local cluster state version [{}]] is older than on sending node (version [{}]), scheduling a retry...",
                            request.shardId().getIndex(), request, state.version(), request.routedBasedOnClusterVersion());
                        retry(new IndexNotFoundException("failed to find index as current cluster state with version [" + state.version() +
                            "] is stale (expected at least [" + request.routedBasedOnClusterVersion() + "]",
                            request.shardId().getIndexName()));
                        return;
                    } else {
                        finishAsFailed(new IndexNotFoundException(request.shardId().getIndex()));
                        return;
                    }
                }

                if (indexMetadata.getState() == IndexMetadata.State.CLOSE) {
                    finishAsFailed(new IndexClosedException(indexMetadata.getIndex()));
                    return;
                }

                if (request.waitForActiveShards() == ActiveShardCount.DEFAULT) {
                    // if the wait for active shard count has not been set in the request,
                    // resolve it from the index settings
                    request.waitForActiveShards(indexMetadata.getWaitForActiveShards());
                }
                assert request.waitForActiveShards() != ActiveShardCount.DEFAULT :
                    "request waitForActiveShards must be set in resolveRequest";

                final ShardRouting primary = state.getRoutingTable().shardRoutingTable(request.shardId()).primaryShard();
                if (primary == null || primary.active() == false) {
                    logger.trace("primary shard [{}] is not yet active, scheduling a retry: action [{}], request [{}], "
                        + "cluster state version [{}]", request.shardId(), actionName, request, state.version());
                    retryBecauseUnavailable(request.shardId(), "primary shard is not active");
                    return;
                }
                if (state.nodes().nodeExists(primary.currentNodeId()) == false) {
                    logger.trace("primary shard [{}] is assigned to an unknown node [{}], scheduling a retry: action [{}], request [{}], "
                        + "cluster state version [{}]", request.shardId(), primary.currentNodeId(), actionName, request, state.version());
                    retryBecauseUnavailable(request.shardId(), "primary shard isn't assigned to a known node.");
                    return;
                }
                final DiscoveryNode node = state.nodes().get(primary.currentNodeId());
                if (primary.currentNodeId().equals(state.nodes().getLocalNodeId())) {
                    // 是当前节点，继续执行
                    performLocalAction(state, primary, node, indexMetadata);
                } else {
                    // 不是当前节点，转发到对应的node上进行处理
                    performRemoteAction(state, primary, node);
                }
            }
        }
```

如果分片在当前节点，task当前阶段置为“waiting_on_primary”，否则为“rerouted”，两者都走到同一入口，即performAction(…)， 在performAction方法中，会调用TransportService的sendRequest方法，将请求发送出去（不管是local还是remote都会发请求）。


如果返回异常，比如ConnectTransportException、NodeClosedException等，会进行重试，重试的逻辑如下：
```
void retry(Exception failure) {
            assert failure != null;
            if (observer.isTimedOut()) {
                // we running as a last attempt after a timeout has happened. don't retry
                finishAsFailed(failure);
                return;
            }
            setPhase(task, "waiting_for_retry");
            request.onRetry();
            observer.waitForNextChange(new ClusterStateObserver.Listener() {
                @Override
                public void onNewClusterState(ClusterState state) {
                    run();
                }

                @Override
                public void onClusterServiceClose() {
                    finishAsFailed(new NodeClosedException(clusterService.localNode()));
                }

                @Override
                public void onTimeout(TimeValue timeout) {
                    // Try one more time...
                    run();
                }
            });
        }
```

在TransportReplicationAction构造函数中，注册了主分片、副本分片的处理函数：

```
        transportService.registerRequestHandler(transportPrimaryAction, executor, forceExecutionOnPrimary, true,
            in -> new ConcreteShardRequest<>(requestReader, in), this::handlePrimaryRequest);

        // we must never reject on because of thread pool capacity on replicas
        transportService.registerRequestHandler(transportReplicaAction, executor, true, true,
            in -> new ConcreteReplicaRequest<>(replicaRequestReader, in), this::handleReplicaRequest);
```

下面先看一下主分片的处理逻辑：
```
protected void handlePrimaryRequest(final ConcreteShardRequest<Request> request, final TransportChannel channel, final Task task) {
        Releasable releasable = checkPrimaryLimits(request.getRequest(), request.sentFromLocalReroute(),
            request.localRerouteInitiatedByNodeClient());
        ActionListener<Response> listener =
            ActionListener.runBefore(new ChannelActionListener<>(channel, transportPrimaryAction, request), releasable::close);

        try {
            new AsyncPrimaryAction(request, listener, (ReplicationTask) task).run();
        } catch (RuntimeException e) {
            listener.onFailure(e);
        }
    }
```

> 往主分片写入、副本分片写入操作分别在：
[TransportReplicationAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/replication/TransportReplicationAction.java)的[AsyncPrimaryAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/replication/TransportReplicationAction.java#L314)、[AsyncReplicaAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/replication/TransportReplicationAction.java#L550)中。

调用：
```
TransportReplicationAction handlePrimaryRequest =>
AsyncPrimaryAction doRun()=>
// 注意：runWithPrimaryShardReference，该函数会在处理完主分片后
// 开始处理分片副本
AsyncPrimaryAction runWithPrimaryShardReference(final PrimaryShardReference primaryShardReference)
ReplicationOperation execute()=>
PrimaryShardReference perform(Request request, ActionListener<PrimaryResult<ReplicaRequest, Response>> listener)=>
TransportWriteAction shardOperationOnPrimary =>
TransportShardBulkAction dispatchedShardOperationOnPrimary =>
// 注意：
// 1、performOnPrimary会调用shardOperationOnPrimary注册监听器
// 当ReplicationOperation handlePrimaryResult完成时 会调用maybeSyncTranslog 进行flush translog
// 2、performOnPrimary doRun()会遍历BulkShardRequest中BulkItemRequest[]
TransportShardBulkAction performOnPrimary =>
// executeBulkItemRequest处理单个请求及异常
// 会根据BulkItemRequest的不同类型而进行不同的处理。
// 其实就是IndexRequest,DeleteRequest,UpdateRequest。
TransportShardBulkAction executeBulkItemRequest =>
IndexShard applyIndexOperationOnPrimary =>
IndexShard applyIndexOperation =>
IndexShard index =>
InternalEngine index =>
InternalEngine indexIntoLucene =>
......
```
> <code>通过TransportShardBulkAction中的executeBulkItemRequest可以看到，即使是bulk请求，在真实处理的时候，还是通过一个循环，一个一个处理的，并没有什么神奇之处。</code>


maybeSyncTranslog:
```
    private void maybeSyncTranslog(final IndexShard indexShard) throws IOException {
        if (indexShard.getTranslogDurability() == Translog.Durability.REQUEST &&
            indexShard.getLastSyncedGlobalCheckpoint() < indexShard.getLastKnownGlobalCheckpoint()) {
            indexShard.sync();
        }
    }
```

下面仔细看看index函数：
```
    /**
     * Perform document index operation on the engine
     * @param index operation to perform
     * @return {@link IndexResult} containing updated translog location, version and
     * document specific failures
     *
     * Note: engine level failures (i.e. persistent engine failures) are thrown
     */
    @Override
    public IndexResult index(Index index) throws IOException {
        assert Objects.equals(index.uid().field(), IdFieldMapper.NAME) : index.uid().field();
        final boolean doThrottle = index.origin().isRecovery() == false;
        try (ReleasableLock releasableLock = readLock.acquire()) {
            // 监测shard是否close，如果close了，这里会抛出异常
            ensureOpen();
            assert assertIncomingSequenceNumber(index.origin(), index.seqNo());
            int reservedDocs = 0;
            try (Releasable ignored = versionMap.acquireLock(index.uid().bytes());
                Releasable indexThrottle = doThrottle ? throttle.acquireThrottle() : () -> {}) {
                lastWriteNanos = index.startTime();
                // 在非自定义id的情况下，直接将文档add，否则需要update
                // 而update比add成本高很多。
                /* A NOTE ABOUT APPEND ONLY OPTIMIZATIONS:
                 * if we have an autoGeneratedID that comes into the engine we can potentially optimize
                 * and just use addDocument instead of updateDocument and skip the entire version and index lookupVersion across the board.
                 * Yet, we have to deal with multiple document delivery, for this we use a property of the document that is added
                 * to detect if it has potentially been added before. We use the documents timestamp for this since it's something
                 * that:
                 *  - doesn't change per document
                 *  - is preserved in the transaction log
                 *  - and is assigned before we start to index / replicate
                 * NOTE: it's not important for this timestamp to be consistent across nodes etc. it's just a number that is in the common
                 * case increasing and can be used in the failure case when we retry and resent documents to establish a happens before
                 * relationship. For instance:
                 *  - doc A has autoGeneratedIdTimestamp = 10, isRetry = false
                 *  - doc B has autoGeneratedIdTimestamp = 9, isRetry = false
                 *
                 *  while both docs are in in flight, we disconnect on one node, reconnect and send doc A again
                 *  - now doc A' has autoGeneratedIdTimestamp = 10, isRetry = true
                 *
                 *  if A' arrives on the shard first we update maxUnsafeAutoIdTimestamp to 10 and use update document. All subsequent
                 *  documents that arrive (A and B) will also use updateDocument since their timestamps are less than
                 *  maxUnsafeAutoIdTimestamp. While this is not strictly needed for doc B it is just much simpler to implement since it
                 *  will just de-optimize some doc in the worst case.
                 *
                 *  if A arrives on the shard first we use addDocument since maxUnsafeAutoIdTimestamp is < 10. A` will then just be skipped
                 *  or calls updateDocument.
                 */

                // 检查版本号是否冲突等
                // 1、尝试从versionMap中读取待写入文档的version，也即从内存中读取。versionMap会暂存还没有commit到磁盘的文档版本信息。具体逻辑在：InternalEngine getVersionFromMap中
                // 2、如果第1步中没有读到，则从index中读取，也即从文件中读取。具体逻辑在VersionsAndSeqNoResolver loadDocIdAndVersion中
                // 注意：这里不会get整个文档，而是只会获取文档的版本号做对比。
                final IndexingStrategy plan = indexingStrategyForOperation(index);
                reservedDocs = plan.reservedDocs;

                final IndexResult indexResult;
                if (plan.earlyResultOnPreFlightError.isPresent()) {
                    assert index.origin() == Operation.Origin.PRIMARY : index.origin();
                    indexResult = plan.earlyResultOnPreFlightError.get();
                    assert indexResult.getResultType() == Result.Type.FAILURE : indexResult.getResultType();
                } else {
                    // generate or register sequence number
                    if (index.origin() == Operation.Origin.PRIMARY) {
                        index = new Index(index.uid(), index.parsedDoc(), generateSeqNoForOperationOnPrimary(index), index.primaryTerm(),
                            index.version(), index.versionType(), index.origin(), index.startTime(), index.getAutoGeneratedIdTimestamp(),
                            index.isRetry(), index.getIfSeqNo(), index.getIfPrimaryTerm());

                        final boolean toAppend = plan.indexIntoLucene && plan.useLuceneUpdateDocument == false;
                        if (toAppend == false) {
                            advanceMaxSeqNoOfUpdatesOrDeletesOnPrimary(index.seqNo());
                        }
                    } else {
                        markSeqNoAsSeen(index.seqNo());
                    }

                    assert index.seqNo() >= 0 : "ops should have an assigned seq no.; origin: " + index.origin();

                    if (plan.indexIntoLucene || plan.addStaleOpToLucene) {
                        // 将数据写入lucene，最终会调用lucene的文档写入接口
                        indexResult = indexIntoLucene(index, plan);
                    } else {
                        indexResult = new IndexResult(
                            plan.versionForIndexing, index.primaryTerm(), index.seqNo(), plan.currentNotFoundOrDeleted);
                    }
                }
                if (index.origin().isFromTranslog() == false) {
                    final Translog.Location location;
                    if (indexResult.getResultType() == Result.Type.SUCCESS) {
                        location = translog.add(new Translog.Index(index, indexResult));
                    } else if (indexResult.getSeqNo() != SequenceNumbers.UNASSIGNED_SEQ_NO) {
                        // if we have document failure, record it as a no-op in the translog and Lucene with the generated seq_no
                        final NoOp noOp = new NoOp(indexResult.getSeqNo(), index.primaryTerm(), index.origin(),
                            index.startTime(), indexResult.getFailure().toString());
                        location = innerNoOp(noOp).getTranslogLocation();
                    } else {
                        location = null;
                    }
                    indexResult.setTranslogLocation(location);
                }
                if (plan.indexIntoLucene && indexResult.getResultType() == Result.Type.SUCCESS) {
                    final Translog.Location translogLocation = trackTranslogLocation.get() ? indexResult.getTranslogLocation() : null;
                    versionMap.maybePutIndexUnderLock(index.uid().bytes(),
                        new IndexVersionValue(translogLocation, plan.versionForIndexing, index.seqNo(), index.primaryTerm()));
                }
                localCheckpointTracker.markSeqNoAsProcessed(indexResult.getSeqNo());
                if (indexResult.getTranslogLocation() == null) {
                    // the op is coming from the translog (and is hence persisted already) or it does not have a sequence number
                    assert index.origin().isFromTranslog() || indexResult.getSeqNo() == SequenceNumbers.UNASSIGNED_SEQ_NO;
                    localCheckpointTracker.markSeqNoAsPersisted(indexResult.getSeqNo());
                }
                indexResult.setTook(System.nanoTime() - index.startTime());
                indexResult.freeze();
                return indexResult;
            } finally {
                releaseInFlightDocs(reservedDocs);
            }
        } catch (RuntimeException | IOException e) {
            try {
                if (e instanceof AlreadyClosedException == false && treatDocumentFailureAsTragicError(index)) {
                    failEngine("index id[" + index.id() + "] origin[" + index.origin() + "] seq#[" + index.seqNo() + "]", e);
                } else {
                    maybeFailEngine("index id[" + index.id() + "] origin[" + index.origin() + "] seq#[" + index.seqNo() + "]", e);
                }
            } catch (Exception inner) {
                e.addSuppressed(inner);
            }
            throw e;
        }
    }
```

ES的写入操作是先写lucene，将数据写入到lucene内存后再写translog。ES之所以先写lucene后写log主要原因大概是写入Lucene时，Lucene会再对数据进行一些检查，有可能出现写入Lucene失败的情况。如果先写translog，那么就要处理写入translog成功但是写入Lucene一直失败的问题，所以ES采用了先写Lucene的方式。

在写完primary后，会继续写replicas：
```
void runWithPrimaryShardReference(final PrimaryShardReference primaryShardReference) {
            try {
                 
            		......

                    new ReplicationOperation<>(primaryRequest.getRequest(), primaryShardReference,
                        responseListener.map(result -> result.finalResponseIfSuccessful),
                        newReplicasProxy(), logger, threadPool, actionName, primaryRequest.getPrimaryTerm(), initialRetryBackoffBound,
                        retryTimeout)
                        .execute();
                }
            } catch (Exception e) {
                handleException(primaryShardReference, e);
            }
        }
```
下面看一下[ReplicationOperation](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java)中的[execute()](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java#L110)都干了啥？

```
public void execute() throws Exception {
        // checkActiveShardCount返回null表示副本符合要求
        // 注意点：这个检查是在写入主副本之前，如果活跃分片不符合要求，
        // 则这时就终止整个请求了
        final String activeShardCountFailure = checkActiveShardCount();
        final ShardRouting primaryRouting = primary.routingEntry();
        final ShardId primaryId = primaryRouting.shardId();
        if (activeShardCountFailure != null) {
            finishAsFailed(new UnavailableShardsException(primaryId,
                "{} Timeout: [{}], request: [{}]", activeShardCountFailure, request.timeout(), request));
            return;
        }

        totalShards.incrementAndGet();
        pendingActions.incrementAndGet(); // increase by 1 until we finish all primary coordination
        // 主副本写入完成 回调ReplicationOperation handlePrimaryResult
        primary.perform(request, ActionListener.wrap(this::handlePrimaryResult, resultListener::onFailure));
    }

     /**
     * Checks whether we can perform a write based on the required active shard count setting.
     * Returns **null* if OK to proceed, or a string describing the reason to stop
     * wait_for_active_shards 参数 真正起作用的地方
     */
    protected String checkActiveShardCount() {
        final ShardId shardId = primary.routingEntry().shardId();
        final ActiveShardCount waitForActiveShards = request.waitForActiveShards();
        if (waitForActiveShards == ActiveShardCount.NONE) {
            return null;  // not waiting for any shards
        }
        final IndexShardRoutingTable shardRoutingTable = primary.getReplicationGroup().getRoutingTable();
        if (waitForActiveShards.enoughShardsActive(shardRoutingTable)) {
            return null;
        } else {
            final String resolvedShards = waitForActiveShards == ActiveShardCount.ALL ? Integer.toString(shardRoutingTable.shards().size())
                                              : waitForActiveShards.toString();
            logger.trace("[{}] not enough active copies to meet shard count of [{}] (have {}, needed {}), scheduling a retry. op [{}], " +
                         "request [{}]", shardId, waitForActiveShards, shardRoutingTable.activeShards().size(),
                         resolvedShards, opType, request);
            return "Not enough active copies to meet shard count of [" + waitForActiveShards + "] (have " +
                       shardRoutingTable.activeShards().size() + ", needed " + resolvedShards + ").";
        }
    }
```
下面看下[ReplicationOperation](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java)中的[handlePrimaryResult](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java#L115):

```
        private void handlePrimaryResult(final PrimaryResultT primaryResult) {
        this.primaryResult = primaryResult;
        final ReplicaRequest replicaRequest = primaryResult.replicaRequest();
        if (replicaRequest != null) {
            if (logger.isTraceEnabled()) {
                logger.trace("[{}] op [{}] completed on primary for request [{}]", primary.routingEntry().shardId(), opType, request);
            }
            // we have to get the replication group after successfully indexing into the primary in order to honour recovery semantics.
            // we have to make sure that every operation indexed into the primary after recovery start will also be replicated
            // to the recovery target. If we used an old replication group, we may miss a recovery that has started since then.
            // we also have to make sure to get the global checkpoint before the replication group, to ensure that the global checkpoint
            // is valid for this replication group. If we would sample in the reverse, the global checkpoint might be based on a subset
            // of the sampled replication group, and advanced further than what the given replication group would allow it to.
            // This would entail that some shards could learn about a global checkpoint that would be higher than its local checkpoint.
            final long globalCheckpoint = primary.computedGlobalCheckpoint();
            // we have to capture the max_seq_no_of_updates after this request was completed on the primary to make sure the value of
            // max_seq_no_of_updates on replica when this request is executed is at least the value on the primary when it was executed
            // on.
            final long maxSeqNoOfUpdatesOrDeletes = primary.maxSeqNoOfUpdatesOrDeletes();
            assert maxSeqNoOfUpdatesOrDeletes != SequenceNumbers.UNASSIGNED_SEQ_NO : "seqno_of_updates still uninitialized";
            final ReplicationGroup replicationGroup = primary.getReplicationGroup();
            final PendingReplicationActions pendingReplicationActions = primary.getPendingReplicationActions();
            markUnavailableShardsAsStale(replicaRequest, replicationGroup);
            // 并发写入 所有副本
            performOnReplicas(replicaRequest, globalCheckpoint, maxSeqNoOfUpdatesOrDeletes, replicationGroup, pendingReplicationActions);
        }

        private void performOnReplicas(final ReplicaRequest replicaRequest, final long globalCheckpoint,
                                   final long maxSeqNoOfUpdatesOrDeletes, final ReplicationGroup replicationGroup,
                                   final PendingReplicationActions pendingReplicationActions) {
        // for total stats, add number of unassigned shards and
        // number of initializing shards that are not ready yet to receive operations (recovery has not opened engine yet on the target)
        totalShards.addAndGet(replicationGroup.getSkippedShards().size());

        final ShardRouting primaryRouting = primary.routingEntry();

        for (final ShardRouting shard : replicationGroup.getReplicationTargets()) {
            if (shard.isSameAllocation(primaryRouting) == false) {
                performOnReplica(shard, replicaRequest, globalCheckpoint, maxSeqNoOfUpdatesOrDeletes, pendingReplicationActions);
            }
        }
    }

    private void performOnReplica(final ShardRouting shard, final ReplicaRequest replicaRequest,
                                  final long globalCheckpoint, final long maxSeqNoOfUpdatesOrDeletes,
                                  final PendingReplicationActions pendingReplicationActions) {
        if (logger.isTraceEnabled()) {
            logger.trace("[{}] sending op [{}] to replica {} for request [{}]", shard.shardId(), opType, shard, replicaRequest);
        }
        totalShards.incrementAndGet();
        pendingActions.incrementAndGet();
        final ActionListener<ReplicaResponse> replicationListener = new ActionListener<>() {
            @Override
            public void onResponse(ReplicaResponse response) {
                successfulShards.incrementAndGet();
                try {
                    updateCheckPoints(shard, response::localCheckpoint, response::globalCheckpoint);
                } finally {
                    decPendingAndFinishIfNeeded();
                }
            }

            @Override
            public void onFailure(Exception replicaException) {
                logger.trace(() -> new ParameterizedMessage(
                    "[{}] failure while performing [{}] on replica {}, request [{}]",
                    shard.shardId(), opType, shard, replicaRequest), replicaException);
                // Only report "critical" exceptions - TODO: Reach out to the master node to get the latest shard state then report.
                if (TransportActions.isShardNotAvailableException(replicaException) == false) {
                    RestStatus restStatus = ExceptionsHelper.status(replicaException);
                    shardReplicaFailures.add(new ReplicationResponse.ShardInfo.Failure(
                        shard.shardId(), shard.currentNodeId(), replicaException, restStatus, false));
                }
                String message = String.format(Locale.ROOT, "failed to perform %s on replica %s", opType, shard);
                
                // failShardIfNeeded 具体执行何种操作要看 replicasProxy的真正实现类:
                // 如果是WriteActionReplicasProxy,则会报告shard错误。
                // 在写入场景中replicasProxy的真正实现类就是WriteActionReplicasProxy。
                replicasProxy.failShardIfNeeded(shard, primaryTerm, message, replicaException,
                    ActionListener.wrap(r -> decPendingAndFinishIfNeeded(), ReplicationOperation.this::onNoLongerPrimary));
            }

            @Override
            public String toString() {
                return "[" + replicaRequest + "][" + shard + "]";
            }
        };


     /**
     * A proxy for <b>write</b> operations that need to be performed on the
     * replicas, where a failure to execute the operation should fail
     * the replica shard and/or mark the replica as stale.
     *
     * This extends {@code TransportReplicationAction.ReplicasProxy} to do the
     * failing and stale-ing.
     */
    class WriteActionReplicasProxy extends ReplicasProxy {

        // 注意 如果写入副本节点失败，则主节点将问题报告给主节点，
        // 然后主节点更新Meta中索引的InSyncAllocations配置并删除副本节点。
        // 也就是说 之后，它将不再处理读取请求。 
        // 在Meta更新到达每个节点之前，用户仍然可以在此副本节点上读取数据，
        // 但是在Meta更新完成之后不会发生。 
        // 这个解决方案并不严格。 考虑到ES是近乎实时的系统，因此在写入数据后，需要刷新才能使其可见。
        // 因此，一般而言，可以在短时间内读取旧数据是可以接受的。
        @Override
        public void failShardIfNeeded(ShardRouting replica, long primaryTerm, String message, Exception exception,
                                      ActionListener<Void> listener) {
            if (TransportActions.isShardNotAvailableException(exception) == false) {
                logger.warn(new ParameterizedMessage("[{}] {}", replica.shardId(), message), exception);
            }
            shardStateAction.remoteShardFailed(
                replica.shardId(), replica.allocationId().getId(), primaryTerm, true, message, exception, listener);
        }

        @Override
        public void markShardCopyAsStaleIfNeeded(ShardId shardId, String allocationId, long primaryTerm, ActionListener<Void> listener) {
            shardStateAction.remoteShardFailed(shardId, allocationId, primaryTerm, true, "mark copy as stale", null, listener);
        }
    }

    /**
     * A proxy for <b>write</b> operations that need to be performed on the
     * replicas, where a failure to execute the operation should fail
     * the replica shard and/or mark the replica as stale.
     *
     * This extends {@code TransportReplicationAction.ReplicasProxy} to do the
     * failing and stale-ing.
     */
    class WriteActionReplicasProxy extends ReplicasProxy {

        @Override
        public void failShardIfNeeded(ShardRouting replica, long primaryTerm, String message, Exception exception,
                                      ActionListener<Void> listener) {
            if (TransportActions.isShardNotAvailableException(exception) == false) {
                logger.warn(new ParameterizedMessage("[{}] {}", replica.shardId(), message), exception);
            }
            shardStateAction.remoteShardFailed(
                replica.shardId(), replica.allocationId().getId(), primaryTerm, true, message, exception, listener);
        }

        @Override
        public void markShardCopyAsStaleIfNeeded(ShardId shardId, String allocationId, long primaryTerm, ActionListener<Void> listener) {
            shardStateAction.remoteShardFailed(shardId, allocationId, primaryTerm, true, "mark copy as stale", null, listener);
        }
    }
```

# 总结

> Elasticsearch写入是等待所有副本都写入完成了才返回还是只要主副本写入了就返回？副本写入成功的标准是什么？wait_for_active_shard参数的作用是啥？

Elasticsearch写入是等待所有副本都写入完成（完成不一定是成功，也有可能是失败）了才返回；
副本写入成功的标志是Translog写入完成；

既然<code>Elasticsearch写入是等待所有副本都写入完成了才返回</code>,那么wait_for_active_shards参数的作用是什么？

其实，wait_for_active_shards参数（该值默认为1）作用：
是在[ReplicationOperation](https://github.com/elastic/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java)中[checkActiveShardCount()](https://github.com/elastic/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java#L305)起作用的。

**wait_for_active_shards的作用是在写入数据之前检查正常的副本数。**

例如，假设我们有一个由三个节点A，B和C组成的集群，并创建了一个索引，其副本数设置为3（产生4个分片副本，副本数比节点数多）。如果我们进行写入操作，则默认情况下，该操作将仅确保每个分片的主副本可用，然后再继续操作。这意味着，如果A托管了主分片副本，即使B和C崩溃了，索引操作仍将仅对数据的一个副本进行。如果在请求上将wait_for_active_shards设置为3（并且3个节点都已启动），则索引操作将需要3个活动的分片副本，然后才能继续进行，因为集群中有3个活动的节点，每个节点保持分片的副本。但是，如果将wait_for_active_shards设置为全部（或设置为4，则相同），则索引操作将不会继续进行，因为我们在索引中没有每个活动的分片的所有4个副本。除非在群集中调出新节点来托管分片的第四副本，否则该操作将超时。

重要的是要注意，此设置大大减少了写操作未写入所需数量的分片副本的机会，但并不能完全消除这种可能性，因为此检查发生在写操作开始之前。 一旦执行写操作，仍然有可能在任何数量的分片副本上失败，但在主副本上仍然成功。 写入操作响应的_shards部分显示复制成功/失败的分片副本数。
