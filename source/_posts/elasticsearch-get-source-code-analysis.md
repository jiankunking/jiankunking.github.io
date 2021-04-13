---
title: 【Elasticsearch源码】 GET分析
categories:
  - ElasticSearch
tags:
  - ElasticSearch
  - GET
  - 源码
  - 原创
abbrlink: 63108
date: 2021-04-11 16:16:15
---

> 带着疑问学源码，第四篇：Elasticsearch GET流程
> 代码分析基于：https://github.com/jiankunking/elasticsearch 
> Elasticsearch 7.10.2+

<!-- more -->

通过前3篇的学习，可以稍微总结一下Elasticsearch：
* ES是一个集群，所以每个Node都需要和其他的Nodes 进行交互，这些交互是通过NodeClient来完成。
* ES中RPC、HTTP请求都是基于Netty自行封装的：
	* [NettyTransport 对应RPC协议支持](https://github.com/jiankunking/elasticsearch/tree/master/modules/transport-netty4/src/main/java/org/elasticsearch/transport)
	* [NettyHttpServerTransport 则对应HTTP协议支持](https://github.com/jiankunking/elasticsearch/tree/master/modules/transport-netty4/src/main/java/org/elasticsearch/http)
* Transport*Action 是比较核心的类集合:
	* Action -> Transport*Action
	* TransportAction -> TransportHandler（即使是本地Node也会通过发请求的方式，将处理转发到TransportHandler处理）
	* 真实干活的Transport*Action类(或者其父类)中[doExecute(......)](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/TransportAction.java#L67) 

# 目的
在看源码之前先梳理一下，自己对于GET流程疑惑的点：
* 是不是根据document id通过hash找到对应的shard？
* 根据document id查询如何做到实时可见的？

# 源码分析

<font color=DeepPink>**第二部分是代码分析的过程，不想看的朋友可以跳过直接看第三部分总结。**</font>


通过搜索/{index}/_doc/{id}可以找到[RestGetAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/get/GetAction.java),找到RestGetAction再加上前面的总结，其实就知道真实干活的是[TransportGetAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/get/TransportGetAction.java)。

![](/images/elasticsearch-get-source-code-analysis/TransportGetAction.png)

在TransportGetAction的父类[TransportSingleShardAction](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/action/support/single/shard/TransportSingleShardAction.java)中找到了doExecute：
```
    @Override
    protected void doExecute(Task task, Request request, ActionListener<Response> listener) {
        new AsyncSingleAction(request, listener).start();
    }

    // TransportSingleShardAction的AsyncSingleAction中
    private AsyncSingleAction(Request request, ActionListener<Response> listener) {
            this.listener = listener;

            ClusterState clusterState = clusterService.state();
            if (logger.isTraceEnabled()) {
                logger.trace("executing [{}] based on cluster state version [{}]", request, clusterState.version());
            }

            // 集群nodes列表
            nodes = clusterState.nodes();
            ClusterBlockException blockException = checkGlobalBlock(clusterState);
            if (blockException != null) {
                throw blockException;
            }

            String concreteSingleIndex;
            if (resolveIndex(request)) {
                concreteSingleIndex = indexNameExpressionResolver.concreteSingleIndex(clusterState, request).getName();
            } else {
                concreteSingleIndex = request.index();
            }
            this.internalRequest = new InternalRequest(request, concreteSingleIndex);

            // 解析请求，更新指定routing
            // TransportGetAction中resolveRequest
            resolveRequest(clusterState, internalRequest);

            blockException = checkRequestBlock(clusterState, internalRequest);
            if (blockException != null) {
                throw blockException;
            }

            // 根据路由算法获取目标shard的迭代器或者根据优先级获选择目标节点
            this.shardIt = shards(clusterState, internalRequest);
        }


    // TransportGetAction中
    @Override
    protected ShardIterator shards(ClusterState state, InternalRequest request) {
        return clusterService.operationRouting()
                .getShards(clusterService.state(), request.concreteIndex(), request.request().id(), request.request().routing(),
                    request.request().preference());
    }

```

下面看一下[OperationRouting](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/cluster/routing/OperationRouting.java)中的getShards(......)看一下是如何获取到具体的shardId的：

```
 public ShardIterator getShards(ClusterState clusterState, String index, String id, @Nullable String routing,
                                   @Nullable String preference) {
        return preferenceActiveShardIterator(shards(clusterState, index, id, routing), clusterState.nodes().getLocalNodeId(),
            clusterState.nodes(), preference, null, null);
    }

protected IndexShardRoutingTable shards(ClusterState clusterState, String index, String id, String routing) {
        int shardId = generateShardId(indexMetadata(clusterState, index), id, routing);
        return clusterState.getRoutingTable().shardRoutingTable(index, shardId);
    }

public static int generateShardId(IndexMetadata indexMetadata, @Nullable String id, @Nullable String routing) {
        final String effectiveRouting;
        final int partitionOffset;

        // routing参数解析可以参考具体的文档
        // https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-get.html
        if (routing == null) {
            assert(indexMetadata.isRoutingPartitionedIndex() == false) : "A routing value is required for gets from a partitioned index";
            effectiveRouting = id;
        } else {
            effectiveRouting = routing;
        }

        if (indexMetadata.isRoutingPartitionedIndex()) {
            partitionOffset = Math.floorMod(Murmur3HashFunction.hash(id), indexMetadata.getRoutingPartitionSize());
        } else {
            // we would have still got 0 above but this check just saves us an unnecessary hash calculation
            partitionOffset = 0;
        }

        return calculateScaledShardId(indexMetadata, effectiveRouting, partitionOffset);
    }

private static int calculateScaledShardId(IndexMetadata indexMetadata, String effectiveRouting, int partitionOffset) {
        final int hash = Murmur3HashFunction.hash(effectiveRouting) + partitionOffset;

        // we don't use IMD#getNumberOfShards since the index might have been shrunk such that we need to use the size
        // of original index to hash documents
        return Math.floorMod(hash, indexMetadata.getRoutingNumShards()) / indexMetadata.getRoutingFactor();
    }        
```

到这里可以知道es就是通过document idhash找到对应的shard。

下面看一下是如何做到实时可见的？

数据节点接收协调节点请求的入口为:TransportSingleShardAction.ShardTransportHandler# messageReceived：
```
        @Override
        public void messageReceived(final Request request, final TransportChannel channel, Task task) throws Exception {
            if (logger.isTraceEnabled()) {
                logger.trace("executing [{}] on shard [{}]", request, request.internalShardId);
            }
            asyncShardOperation(request, request.internalShardId, new ChannelActionListener<>(channel, transportShardAction, request));
        }
```
具体执行是在子类TransportGetAction#asyncShardOperation中：
```
    @Override
    protected void asyncShardOperation(GetRequest request, ShardId shardId, ActionListener<GetResponse> listener) throws IOException {
        IndexService indexService = indicesService.indexServiceSafe(shardId.getIndex());
        IndexShard indexShard = indexService.getShard(shardId.id());
        // 关于realtime可以看一下官方文档
        // https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-get.html
        if (request.realtime()) { // we are not tied to a refresh cycle here anyway
            super.asyncShardOperation(request, shardId, listener);
        } else {
            indexShard.awaitShardSearchActive(b -> {
                try {
                    super.asyncShardOperation(request, shardId, listener);
                } catch (Exception ex) {
                    listener.onFailure(ex);
                }
            });
        }
    }
```
TransportGetAction#asyncShardOperation获取文档最终调用的是：

```
    @Override
    protected GetResponse shardOperation(GetRequest request, ShardId shardId) {
        IndexService indexService = indicesService.indexServiceSafe(shardId.getIndex());
        IndexShard indexShard = indexService.getShard(shardId.id());

        // 关于realtime、refresh可以看一下官方文档
        // https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-get.html
        if (request.refresh() && !request.realtime()) {
            indexShard.refresh("refresh_flag_get");
        }

        GetResult result = indexShard.getService().get(request.id(), request.storedFields(),
                request.realtime(), request.version(), request.versionType(), request.fetchSourceContext());
        return new GetResponse(result);
    }
```
shardOperation先检查是否需要refresh，然后调用indexShard.getService().get()读取数据并存储到GetResult中。读取及过滤 在ShardGetService#get()函数中，调用:
GetResult getResult = innerGet(......)；
获取结果。GetResult类用于存储读取的真实数据内容。核心的数据读取实现在ShardGetService#innerGet(......)函数中：

```
private GetResult innerGet(String id, String[] gFields, boolean realtime, long version, VersionType versionType,
                               long ifSeqNo, long ifPrimaryTerm, FetchSourceContext fetchSourceContext) {
        fetchSourceContext = normalizeFetchSourceContent(fetchSourceContext, gFields);

        // 调用Engine获取数据
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
            // 获取返回结果
            // break between having loaded it from translog (so we only have _source), and having a document to load
            return innerGetLoadFromStoredFields(id, gFields, fetchSourceContext, get, mapperService);
        } finally {
            get.close();
        }
    }


    //根据type、id、DocumentMapper等信息从刚刚获取的信息中获取数据，
    //对指定的field、source进行过滤(source过滤只支持对字段)，
    //把结果存于GetResult对象中
    private GetResult innerGetLoadFromStoredFields(String id, String[] storedFields, FetchSourceContext fetchSourceContext,
                                                   Engine.GetResult get, MapperService mapperService) {
        assert get.exists() : "method should only be called if document could be retrieved";

        // check first if stored fields to be loaded don't contain an object field
        DocumentMapper docMapper = mapperService.documentMapper();
        if (storedFields != null) {
            for (String field : storedFields) {
                Mapper fieldMapper = docMapper.mappers().getMapper(field);
                if (fieldMapper == null) {
                    if (docMapper.mappers().objectMappers().get(field) != null) {
                        // Only fail if we know it is a object field, missing paths / fields shouldn't fail.
                        throw new IllegalArgumentException("field [" + field + "] isn't a leaf field");
                    }
                }
            }
        }

        Map<String, DocumentField> documentFields = null;
        Map<String, DocumentField> metadataFields = null;
        BytesReference source = null;
        DocIdAndVersion docIdAndVersion = get.docIdAndVersion();
        // force fetching source if we read from translog and need to recreate stored fields
        boolean forceSourceForComputingTranslogStoredFields = get.isFromTranslog() && storedFields != null &&
                Stream.of(storedFields).anyMatch(f -> TranslogLeafReader.ALL_FIELD_NAMES.contains(f) == false);
        FieldsVisitor fieldVisitor = buildFieldsVisitors(storedFields,
            forceSourceForComputingTranslogStoredFields ? FetchSourceContext.FETCH_SOURCE : fetchSourceContext);
        if (fieldVisitor != null) {
            try {
                docIdAndVersion.reader.document(docIdAndVersion.docId, fieldVisitor);
            } catch (IOException e) {
                throw new ElasticsearchException("Failed to get id [" + id + "]", e);
            }
            source = fieldVisitor.source();

            // in case we read from translog, some extra steps are needed to make _source consistent and to load stored fields
            if (get.isFromTranslog()) {
                // Fast path: if only asked for the source or stored fields that have been already provided by TranslogLeafReader,
                // just make source consistent by reapplying source filters from mapping (possibly also nulling the source)
                if (forceSourceForComputingTranslogStoredFields == false) {
                    try {
                        source = indexShard.mapperService().documentMapper().sourceMapper().applyFilters(source, null);
                    } catch (IOException e) {
                        throw new ElasticsearchException("Failed to reapply filters for [" + id + "] after reading from translog", e);
                    }
                } else {
                    // Slow path: recreate stored fields from original source
                    assert source != null : "original source in translog must exist";
                    SourceToParse sourceToParse = new SourceToParse(shardId.getIndexName(), id, source, XContentHelper.xContentType(source),
                        fieldVisitor.routing());
                    ParsedDocument doc = indexShard.mapperService().documentMapper().parse(sourceToParse);
                    assert doc.dynamicMappingsUpdate() == null : "mapping updates should not be required on already-indexed doc";
                    // update special fields
                    doc.updateSeqID(docIdAndVersion.seqNo, docIdAndVersion.primaryTerm);
                    doc.version().setLongValue(docIdAndVersion.version);

                    // retrieve stored fields from parsed doc
                    fieldVisitor = buildFieldsVisitors(storedFields, fetchSourceContext);
                    for (IndexableField indexableField : doc.rootDoc().getFields()) {
                        IndexableFieldType fieldType = indexableField.fieldType();
                        if (fieldType.stored()) {
                            FieldInfo fieldInfo = new FieldInfo(indexableField.name(), 0, false, false, false, IndexOptions.NONE,
                                DocValuesType.NONE, -1, Collections.emptyMap(), 0, 0, 0, false);
                            StoredFieldVisitor.Status status = fieldVisitor.needsField(fieldInfo);
                            if (status == StoredFieldVisitor.Status.YES) {
                                if (indexableField.numericValue() != null) {
                                    fieldVisitor.objectField(fieldInfo, indexableField.numericValue());
                                } else if (indexableField.binaryValue() != null) {
                                    fieldVisitor.binaryField(fieldInfo, indexableField.binaryValue());
                                } else if (indexableField.stringValue() != null) {
                                    fieldVisitor.objectField(fieldInfo, indexableField.stringValue());
                                }
                            } else if (status == StoredFieldVisitor.Status.STOP) {
                                break;
                            }
                        }
                    }
                    // retrieve source (with possible transformations, e.g. source filters
                    source = fieldVisitor.source();
                }
            }

            // put stored fields into result objects
            if (!fieldVisitor.fields().isEmpty()) {
                fieldVisitor.postProcess(mapperService::fieldType);
                documentFields = new HashMap<>();
                metadataFields = new HashMap<>();
                for (Map.Entry<String, List<Object>> entry : fieldVisitor.fields().entrySet()) {
                    if (mapperService.isMetadataField(entry.getKey())) {
                        metadataFields.put(entry.getKey(), new DocumentField(entry.getKey(), entry.getValue()));
                    } else {
                        documentFields.put(entry.getKey(), new DocumentField(entry.getKey(), entry.getValue()));
                    }
                }
            }
        }

        if (source != null) {
            // apply request-level source filtering
            if (fetchSourceContext.fetchSource() == false) {
                source = null;
            } else if (fetchSourceContext.includes().length > 0 || fetchSourceContext.excludes().length > 0) {
                Map<String, Object> sourceAsMap;
                // TODO: The source might be parsed and available in the sourceLookup but that one uses unordered maps so different.
                //  Do we care?
                Tuple<XContentType, Map<String, Object>> typeMapTuple = XContentHelper.convertToMap(source, true);
                XContentType sourceContentType = typeMapTuple.v1();
                sourceAsMap = typeMapTuple.v2();
                sourceAsMap = XContentMapValues.filter(sourceAsMap, fetchSourceContext.includes(), fetchSourceContext.excludes());
                try {
                    source = BytesReference.bytes(XContentFactory.contentBuilder(sourceContentType).map(sourceAsMap));
                } catch (IOException e) {
                    throw new ElasticsearchException("Failed to get id [" + id + "] with includes/excludes set", e);
                }
            }
        }

        return new GetResult(shardId.getIndexName(), id, get.docIdAndVersion().seqNo, get.docIdAndVersion().primaryTerm,
            get.version(), get.exists(), source, documentFields, metadataFields);
    }
```

下面看一下InternalEngine的读取过程：

InternalEngine#get过程会加读锁。处理realtime选项，如果为true，则先判断是否有数据可以刷盘，然后调用Searcher进行读取。Searcher是对IndexSearcher的封装。

从ES 5.x开始不会从translog中读取，只从Lucene中读。realtime的实现机制变成依靠refresh实现。参考官方链接：https://github.com/elastic/elasticsearch/pull/20102

```
 @Override
    public GetResult get(Get get, DocumentMapper mapper, Function<Engine.Searcher, Engine.Searcher> searcherWrapper) {
        assert Objects.equals(get.uid().field(), IdFieldMapper.NAME) : get.uid().field();
        try (ReleasableLock ignored = readLock.acquire()) {
            ensureOpen();
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


# 小结

* GET是根据document id 哈希找到对应的shard的。
* 根据document id查询的实时可见是通过依靠refresh实现的。


参考资料：
《Elasticsearch源码解析与优化实战》