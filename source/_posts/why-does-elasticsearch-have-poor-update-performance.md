---
title: 【Elasticsearch源码】 更新性能分析
abbrlink: 60356
date: 2021-02-28 11:38:23
tags:
  - ElasticSearch
  - Update
  - Performance
  - 源码
  - 原创
---

> 带着疑问学源码，第三篇：Elasticsearch 更新性能
> 代码分析基于：https://github.com/jiankunking/elasticsearch 
> Elasticsearch 7.10.2+

<!-- more -->

# 目的
在看源码之前先梳理一下，自己对于更新疑惑的点：
为什么Elasticsearch更新与写入的性能会有比较大的差异？

# 源码分析

建议先看一下：[【Elasticsearch源码】 写入分析](https://jiankunking.com/elasticsearch-write-source-code-analysis.html)

在[【Elasticsearch源码】 写入分析](https://jiankunking.com/elasticsearch-write-source-code-analysis.html)中可以看到bulk请求最终在[TransportShardBulkAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/bulk/TransportShardBulkAction.java) [doRun()](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/bulk/TransportShardBulkAction.java#L182)中执行的时候，还是通过一个循环，一个一个处理的，并没有什么神奇之处。

下面看一下具体执行的代码[executeBulkItemRequest](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/bulk/TransportShardBulkAction.java) [doRun()](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/bulk/TransportShardBulkAction.java#L238)：

```
     /**
     * Executes bulk item requests and handles request execution exceptions.
     * @return {@code true} if request completed on this thread and the listener was invoked, {@code false} if the request triggered
     *                      a mapping update that will finish and invoke the listener on a different thread
     */
    static boolean executeBulkItemRequest(BulkPrimaryExecutionContext context, UpdateHelper updateHelper, LongSupplier nowInMillisSupplier,
                                       MappingUpdatePerformer mappingUpdater, Consumer<ActionListener<Void>> waitForMappingUpdate,
                                       ActionListener<Void> itemDoneListener) throws Exception {
        final DocWriteRequest.OpType opType = context.getCurrent().opType();

        final UpdateHelper.Result updateResult;
        if (opType == DocWriteRequest.OpType.UPDATE) {
            final UpdateRequest updateRequest = (UpdateRequest) context.getCurrent();
            try {
                // 
                updateResult = updateHelper.prepare(updateRequest, context.getPrimary(), nowInMillisSupplier);
            } catch (Exception failure) {
                // we may fail translating a update to index or delete operation
                // we use index result to communicate failure while translating update request
                final Engine.Result result =
                    new Engine.IndexResult(failure, updateRequest.version());
                context.setRequestToExecute(updateRequest);
                context.markOperationAsExecuted(result);
                context.markAsCompleted(context.getExecutionResult());
                return true;
            }
            // execute translated update request
            switch (updateResult.getResponseResult()) {
                case CREATED:
                case UPDATED:
                    IndexRequest indexRequest = updateResult.action();
                    IndexMetadata metadata = context.getPrimary().indexSettings().getIndexMetadata();
                    MappingMetadata mappingMd = metadata.mapping();
                    indexRequest.process(metadata.getCreationVersion(), mappingMd, updateRequest.concreteIndex());
                    context.setRequestToExecute(indexRequest);
                    break;
                case DELETED:
                    context.setRequestToExecute(updateResult.action());
                    break;
                case NOOP:
                    context.markOperationAsNoOp(updateResult.action());
                    context.markAsCompleted(context.getExecutionResult());
                    return true;
                default:
                    throw new IllegalStateException("Illegal update operation " + updateResult.getResponseResult());
            }
        } else {
            context.setRequestToExecute(context.getCurrent());
            updateResult = null;
        }

        assert context.getRequestToExecute() != null; // also checks that we're in TRANSLATED state

        final IndexShard primary = context.getPrimary();
        final long version = context.getRequestToExecute().version();
        final boolean isDelete = context.getRequestToExecute().opType() == DocWriteRequest.OpType.DELETE;
        final Engine.Result result;
        if (isDelete) {
            final DeleteRequest request = context.getRequestToExecute();
            result = primary.applyDeleteOperationOnPrimary(version, request.id(), request.versionType(),
                request.ifSeqNo(), request.ifPrimaryTerm());
        } else {
            final IndexRequest request = context.getRequestToExecute();
            result = primary.applyIndexOperationOnPrimary(version, request.versionType(), new SourceToParse(
                    request.index(), request.id(), request.source(), request.getContentType(), request.routing()),
                    request.ifSeqNo(), request.ifPrimaryTerm(), request.getAutoGeneratedTimestamp(), request.isRetry());
        }
        if (result.getResultType() == Engine.Result.Type.MAPPING_UPDATE_REQUIRED) {

            try {
                primary.mapperService().merge(MapperService.SINGLE_MAPPING_NAME,
                    new CompressedXContent(result.getRequiredMappingUpdate(), XContentType.JSON, ToXContent.EMPTY_PARAMS),
                    MapperService.MergeReason.MAPPING_UPDATE_PREFLIGHT);
            } catch (Exception e) {
                logger.info(() -> new ParameterizedMessage("{} mapping update rejected by primary", primary.shardId()), e);
                onComplete(exceptionToResult(e, primary, isDelete, version), context, updateResult);
                return true;
            }

            mappingUpdater.updateMappings(result.getRequiredMappingUpdate(), primary.shardId(),
                new ActionListener<>() {
                    @Override
                    public void onResponse(Void v) {
                        context.markAsRequiringMappingUpdate();
                        waitForMappingUpdate.accept(
                            ActionListener.runAfter(new ActionListener<>() {
                                @Override
                                public void onResponse(Void v) {
                                    assert context.requiresWaitingForMappingUpdate();
                                    context.resetForExecutionForRetry();
                                }

                                @Override
                                public void onFailure(Exception e) {
                                    context.failOnMappingUpdate(e);
                                }
                            }, () -> itemDoneListener.onResponse(null))
                        );
                    }

                    @Override
                    public void onFailure(Exception e) {
                        onComplete(exceptionToResult(e, primary, isDelete, version), context, updateResult);
                        // Requesting mapping update failed, so we don't have to wait for a cluster state update
                        assert context.isInitial();
                        itemDoneListener.onResponse(null);
                    }
                });
            return false;
        } else {
            onComplete(result, context, updateResult);
        }
        return true;
    }

    /**
     * Prepares an update request by converting it into an index or delete request or an update response (no action).
     */
    public Result prepare(UpdateRequest request, IndexShard indexShard, LongSupplier nowInMillis) {
        // 这里是实时获取
        // 获取结果最终会到InternalEngine 
        // get(Get get, DocumentMapper mapper, Function<Engine.Searcher, Engine.Searcher> searcherWrapper)
        // 后面会附上 代码
        final GetResult getResult = indexShard.getService().getForUpdate(
            request.id(), request.ifSeqNo(), request.ifPrimaryTerm());
        return prepare(indexShard.shardId(), request, getResult, nowInMillis);
    }

    public GetResult getForUpdate(String id, long ifSeqNo, long ifPrimaryTerm) {
        // realtime是true
        return get(id, new String[]{RoutingFieldMapper.NAME}, true,
            Versions.MATCH_ANY, VersionType.INTERNAL, ifSeqNo, ifPrimaryTerm, FetchSourceContext.FETCH_SOURCE);
    }

    private GetResult get(String id, String[] gFields, boolean realtime, long version, VersionType versionType,
                          long ifSeqNo, long ifPrimaryTerm, FetchSourceContext fetchSourceContext) {
        currentMetric.inc();
        try {
            long now = System.nanoTime();
            GetResult getResult =
                innerGet(id, gFields, realtime, version, versionType, ifSeqNo, ifPrimaryTerm, fetchSourceContext);

            if (getResult.isExists()) {
                existsMetric.inc(System.nanoTime() - now);
            } else {
                missingMetric.inc(System.nanoTime() - now);
            }
            return getResult;
        } finally {
            currentMetric.dec();
        }
    }

    private GetResult innerGet(String id, String[] gFields, boolean realtime, long version, VersionType versionType,
                               long ifSeqNo, long ifPrimaryTerm, FetchSourceContext fetchSourceContext) {
        fetchSourceContext = normalizeFetchSourceContent(fetchSourceContext, gFields);

        Engine.GetResult get = indexShard.get(new Engine.Get(realtime, realtime, id)
            .version(version).versionType(versionType).setIfSeqNo(ifSeqNo).setIfPrimaryTerm(ifPrimaryTerm));
        assert get.isFromTranslog() == false || realtime : "should only read from translog if realtime enabled";
        if (get.exists() == false) {
            get.close();
        }

        if (get == null || get.exists() == false) {
            return new GetResult(shardId.getIndexName(), id, UNASSIGNED_SEQ_NO, UNASSIGNED_PRIMARY_TERM, -1, false, null, null, null);
        }

        try {
            // break between having loaded it from translog (so we only have _source), and having a document to load
            return innerGetLoadFromStoredFields(id, gFields, fetchSourceContext, get, mapperService);
        } finally {
            get.close();
        }
    }

    public Engine.GetResult get(Engine.Get get) {
        readAllowed();
        DocumentMapper mapper = mapperService.documentMapper();
        if (mapper == null) {
            return GetResult.NOT_EXISTS;
        }
        return getEngine().get(get, mapper, this::wrapSearcher);
    }

     /**
     * Prepares an update request by converting it into an index or delete request or an update response (no action, in the event of a
     * noop).
     */
    protected Result prepare(ShardId shardId, UpdateRequest request, final GetResult getResult, LongSupplier nowInMillis) {
        if (getResult.isExists() == false) {
            // If the document didn't exist, execute the update request as an upsert
            return prepareUpsert(shardId, request, getResult, nowInMillis);
        } else if (getResult.internalSourceRef() == null) {
            // no source, we can't do anything, throw a failure...
            throw new DocumentSourceMissingException(shardId, request.id());
        } else if (request.script() == null && request.doc() != null) {
            // The request has no script, it is a new doc that should be merged with the old document
            return prepareUpdateIndexRequest(shardId, request, getResult, request.detectNoop());
        } else {
            // The request has a script (or empty script), execute the script and prepare a new index request
            return prepareUpdateScriptRequest(shardId, request, getResult, nowInMillis);
        }
    }
```

其中，prepare在[org/elasticsearch/action/update/UpdateHelper.java](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/update/UpdateHelper.java) 中。

从代码中可以看到更新逻辑分两步：

* 获取待更新文档的数据
* 执行更新文档的操作

第1步最终会调用[InternalEngine](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/index/engine/InternalEngine.java)中的[get](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/index/engine/InternalEngine.java#L643)方法。代码如下：

```
    @Override
    public GetResult get(Get get, DocumentMapper mapper, Function<Engine.Searcher, Engine.Searcher> searcherWrapper) {
        assert Objects.equals(get.uid().field(), IdFieldMapper.NAME) : get.uid().field();
        try (ReleasableLock ignored = readLock.acquire()) {
            ensureOpen();
            // 是否实时获取
            if (get.realtime()) {
                final VersionValue versionValue;
                try (Releasable ignore = versionMap.acquireLock(get.uid().bytes())) {
                    // we need to lock here to access the version map to do this truly in RT
                    versionValue = getVersionFromMap(get.uid().bytes());
                }
                if (versionValue != null) {
                    if (versionValue.isDelete()) {
                        return GetResult.NOT_EXISTS;
                    }
                    if (get.versionType().isVersionConflictForReads(versionValue.version, get.version())) {
                        throw new VersionConflictEngineException(shardId, get.id(),
                            get.versionType().explainConflictForReads(versionValue.version, get.version()));
                    }
                    if (get.getIfSeqNo() != SequenceNumbers.UNASSIGNED_SEQ_NO && (
                        get.getIfSeqNo() != versionValue.seqNo || get.getIfPrimaryTerm() != versionValue.term
                        )) {
                        throw new VersionConflictEngineException(shardId, get.id(),
                            get.getIfSeqNo(), get.getIfPrimaryTerm(), versionValue.seqNo, versionValue.term);
                    }
                    // 是否从Translog获取
                    if (get.isReadFromTranslog()) {
                        // this is only used for updates - API _GET calls will always read form a reader for consistency
                        // the update call doesn't need the consistency since it's source only + _parent but parent can go away in 7.0
                        if (versionValue.getLocation() != null) {
                            try {
                                final Translog.Operation operation = translog.readOperation(versionValue.getLocation());
                                if (operation != null) {
                                    return getFromTranslog(get, (Translog.Index) operation, mapper, searcherWrapper);
                                }
                            } catch (IOException e) {
                                maybeFailEngine("realtime_get", e); // lets check if the translog has failed with a tragic event
                                throw new EngineException(shardId, "failed to read operation from translog", e);
                            }
                        } else {
                            trackTranslogLocation.set(true);
                        }
                    }
                    assert versionValue.seqNo >= 0 : versionValue;
                    refreshIfNeeded("realtime_get", versionValue.seqNo);
                }
                return getFromSearcher(get, acquireSearcher("realtime_get", SearcherScope.INTERNAL, searcherWrapper));
            } else {
                // we expose what has been externally expose in a point in time snapshot via an explicit refresh
                return getFromSearcher(get, acquireSearcher("get", SearcherScope.EXTERNAL, searcherWrapper));
            }
        }
    }
```

# 总结

update操作需要先获取原始文档，如果查询不到，会新增；如果存在，会根据原始文档更新。

虽然更新操作最终调用的方法也是[InternalEngine](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/index/engine/InternalEngine.java)中的[index](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/index/engine/InternalEngine.java#L854)，但在更新时调用[lucene](https://github.com/jiankunking/lucene) [softUpdateDocuments](https://github.com/jiankunking/lucene/blob/master/core/src/java/org/apache/lucene/index/IndexWriter.java#L1519)，会包含两个操作：标记删除、新增。

相对于新增而言:
* 多了一次完整的查询(为了保证一致性，update调用GET时将realtime选项设置为true，并且不 可配置。因此update操作可能会导致refresh生成新的Lucene分段。)
* 多了一个标记删除

如果数据量比较大，操作又比较频繁的情况下，update这种操作还是要慎重。

<!-- 其实原因也很简单，因为这里是允许用户做部分更新的，而es底层每次更新时要求必须是完整的文档（因为lucene的更新实际是删除老文档，新增新文档），如果不拿到原始数据的话，就不能组装出更新后的完整文档了。 -->


