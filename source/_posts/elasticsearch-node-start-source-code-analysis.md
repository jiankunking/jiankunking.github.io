---
title: 【Elasticsearch源码】 节点启动分析
categories:
  - ElasticSearch
tags:
  - ElasticSearch
  - Node
  - 源码
  - 原创
abbrlink: 41898
date: 2021-06-13 07:24:10
---

> 带着疑问学源码，第五篇：Elasticsearch 节点启动分析
> 代码分析基于：https://github.com/jiankunking/elasticsearch 
> Elasticsearch 7.10.2+

<!-- more -->

# 目的
在看源码之前先梳理一下，自己对于节点启动流程疑惑的点：
* 节点启动都做了哪些检查？
* 节点启动都初始化了哪些内容？
* 当节点启动后，数据迁移是在哪里处理？

# 源码分析

先从[启动脚本](https://github.com/jiankunking/elasticsearch/blob/master/distribution/src/bin/elasticsearch)中找到启动类的入口:org.elasticsearch.bootstrap.Elasticsearch。

下面看一下[org.elasticsearch.bootstrap.Elasticsearch](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/bootstrap/Elasticsearch.java),先看一下主入口函数：
```
    /**
     * Main entry point for starting elasticsearch
     */
    public static void main(final String[] args) throws Exception {
        // 根据jvm.options中读取：es.networkaddress.cache.ttl和es.networkaddress.cache.negative.ttl
        // 并覆盖JVM Security中的networkaddress.cache.ttl与networkaddress.cache.negative.ttl
        overrideDnsCachePolicyProperties();
        /*
         * We want the JVM to think there is a security manager installed so that if internal policy decisions that would be based on the
         * presence of a security manager or lack thereof act as if there is a security manager present (e.g., DNS cache policy). This
         * forces such policies to take effect immediately.
         */
        System.setSecurityManager(new SecurityManager() {

            @Override
            public void checkPermission(Permission perm) {
                // grant all permissions so that we can later set the security manager to the one that we want
            }

        });
        LogConfigurator.registerErrorListener();
        final Elasticsearch elasticsearch = new Elasticsearch();
        // 核心检查处理都在main(final String[] args, final Elasticsearch elasticsearch, final Terminal terminal)方法中
        int status = main(args, elasticsearch, Terminal.DEFAULT);
        if (status != ExitCodes.OK) {
            final String basePath = System.getProperty("es.logs.base_path");
            // It's possible to fail before logging has been configured, in which case there's no point
            // suggesting that the user look in the log file.
            if (basePath != null) {
                Terminal.DEFAULT.errorPrintln(
                    "ERROR: Elasticsearch did not exit normally - check the logs at "
                        + basePath
                        + System.getProperty("file.separator")
                        + System.getProperty("es.logs.cluster_name") + ".log"
                );
            }
            exit(status);
        }
    }

```
main的处理逻辑如下：
```
Elasticsearch main(final String[] args)=>
Elasticsearch main(final String[] args, final Elasticsearch elasticsearch, final Terminal terminal)=>
Command main(String[] args, Terminal terminal)=>
EnvironmentAwareCommand execute(Terminal terminal, OptionSet options)=>
Elasticsearch execute(Terminal terminal, OptionSet options, Environment env)=>
Bootstrap static void init(
            final boolean foreground,
            final Path pidFile,
            final boolean quiet,
            final Environment initialEnv)=>
```
下面看一下Bootstrap.init
```
     /**
     * This method is invoked by {@link Elasticsearch#main(String[])} to startup elasticsearch.
     */
    static void init(
            final boolean foreground,
            final Path pidFile,
            final boolean quiet,
            final Environment initialEnv) throws BootstrapException, NodeValidationException, UserException {
        // force the class initializer for BootstrapInfo to run before
        // the security manager is installed
        BootstrapInfo.init();

        INSTANCE = new Bootstrap();

        final SecureSettings keystore = loadSecureSettings(initialEnv);
        final Environment environment = createEnvironment(pidFile, keystore, initialEnv.settings(), initialEnv.configFile());

        // the LogConfigurator will replace System.out and System.err with redirects to our logfile, so we need to capture
        // the stream objects before calling LogConfigurator to be able to close them when appropriate
        final Runnable sysOutCloser = getSysOutCloser();
        final Runnable sysErrorCloser = getSysErrorCloser();

        LogConfigurator.setNodeName(Node.NODE_NAME_SETTING.get(environment.settings()));
        try {
            LogConfigurator.configure(environment);
        } catch (IOException e) {
            throw new BootstrapException(e);
        }
        if (environment.pidFile() != null) {
            try {
                PidFile.create(environment.pidFile(), true);
            } catch (IOException e) {
                throw new BootstrapException(e);
            }
        }


        try {
            final boolean closeStandardStreams = (foreground == false) || quiet;
            if (closeStandardStreams) {
                final Logger rootLogger = LogManager.getRootLogger();
                final Appender maybeConsoleAppender = Loggers.findAppender(rootLogger, ConsoleAppender.class);
                if (maybeConsoleAppender != null) {
                    Loggers.removeAppender(rootLogger, maybeConsoleAppender);
                }
                sysOutCloser.run();
            }

            // fail if somebody replaced the lucene jars
            // 检查 Lucene 版本，ES 各个版本对使用的 Lucene 版本是有要求的
            // 在这里检查Lucene版本以防止有人替换不兼容的jar包。
            checkLucene();

            // install the default uncaught exception handler; must be done before security is
            // initialized as we do not want to grant the runtime permission
            // setDefaultUncaughtExceptionHandler
            // 会根据不同的异常，设置不同的exit code
            // InternalError 128
            // OutOfMemoryError 127
            // StackOverflowError 126
            // UnknownError 125
            // IOError 124
            // 其它 1
            Thread.setDefaultUncaughtExceptionHandler(new ElasticsearchUncaughtExceptionHandler());

            // 检查启动es的用户
            // 检查JNA(系统调用)
            // 检查MEMORY_LOCK
            // 检查MaxNumberOfThreads
            // 检查MaxSizeVirtualMemory
            // 检查MaxFileSize
            // init lucene random seed
            // 注册JVM addShutdownHook(Node退出的时候，会用到)
            // 检查jar冲突
            // 初始化JVM Security
            // Node实例添加validateNodeBeforeAcceptingRequests，并初始化Node实例。
            INSTANCE.setup(true, environment);

            try {
                // any secure settings must be read during node construction
                IOUtils.close(keystore);
            } catch (IOException e) {
                throw new BootstrapException(e);
            }

            // 1、开始启动各子模块。
            // 子模块在Node类中创建、启动
            // 子模块的start方法基本就是初始化内部数据、创建线程池、启动线程池等操作。
            // 2、调用keepAliveThread.start()方法启动keepalive线程，线程本身不做具体的工作。
            // 主线程执行完启动流程后会退出，keepalive线程是唯一的用户线程，
            // 作用是保持进程运行。在Java程序中，至少要有一个用户线程。当用户线程数为零时退出进程。
            INSTANCE.start();

            // We don't close stderr if `--quiet` is passed, because that
            // hides fatal startup errors. For example, if Elasticsearch is
            // running via systemd, the init script only specifies
            // `--quiet`, not `-d`, so we want users to be able to see
            // startup errors via journalctl.
            if (foreground == false) {
                sysErrorCloser.run();
            }

        } catch (NodeValidationException | RuntimeException e) {
            // disable console logging, so user does not see the exception twice (jvm will show it already)
            final Logger rootLogger = LogManager.getRootLogger();
            final Appender maybeConsoleAppender = Loggers.findAppender(rootLogger, ConsoleAppender.class);
            if (foreground && maybeConsoleAppender != null) {
                Loggers.removeAppender(rootLogger, maybeConsoleAppender);
            }
            Logger logger = LogManager.getLogger(Bootstrap.class);
            // HACK, it sucks to do this, but we will run users out of disk space otherwise
            if (e instanceof CreationException) {
                // guice: log the shortened exc to the log file
                ByteArrayOutputStream os = new ByteArrayOutputStream();
                PrintStream ps = null;
                try {
                    ps = new PrintStream(os, false, "UTF-8");
                } catch (UnsupportedEncodingException uee) {
                    assert false;
                    e.addSuppressed(uee);
                }
                new StartupException(e).printStackTrace(ps);
                ps.flush();
                try {
                    logger.error("Guice Exception: {}", os.toString("UTF-8"));
                } catch (UnsupportedEncodingException uee) {
                    assert false;
                    e.addSuppressed(uee);
                }
            } else if (e instanceof NodeValidationException) {
                logger.error("node validation exception\n{}", e.getMessage());
            } else {
                // full exception
                logger.error("Exception", e);
            }
            // re-enable it if appropriate, so they can see any logging during the shutdown process
            if (foreground && maybeConsoleAppender != null) {
                Loggers.addAppender(rootLogger, maybeConsoleAppender);
            }

            throw e;
        }
    }
```
下面看一下Node实例初始化及启动部分：
```
    // 环境变量中携带的信息主要节点的配置信息：
    // dataFiles、configFile、pluginsFile、modulesFile等等
    // https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/env/Environment.java
    public Node(Environment environment) {
        this(environment, Collections.emptyList(), true);
    }

    /**
     * Constructs a node
     *
     * @param initialEnvironment         the initial environment for this node, which will be added to by plugins
     * @param classpathPlugins           the plugins to be loaded from the classpath
     * @param forbidPrivateIndexSettings whether or not private index settings are forbidden when creating an index; this is used in the
     *                                   test framework for tests that rely on being able to set private settings
     */
    protected Node(final Environment initialEnvironment,
                   Collection<Class<? extends Plugin>> classpathPlugins, boolean forbidPrivateIndexSettings) {
        final List<Closeable> resourcesToClose = new ArrayList<>(); // register everything we need to release in the case of an error
        boolean success = false;
        try {
            Settings tmpSettings = Settings.builder().put(initialEnvironment.settings())
                .put(Client.CLIENT_TYPE_SETTING_S.getKey(), CLIENT_TYPE).build();

            final JvmInfo jvmInfo = JvmInfo.jvmInfo();
            logger.info(
                "version[{}], pid[{}], build[{}/{}/{}/{}], OS[{}/{}/{}], JVM[{}/{}/{}/{}]",
                Build.CURRENT.getQualifiedVersion(),
                jvmInfo.pid(),
                Build.CURRENT.flavor().displayName(),
                Build.CURRENT.type().displayName(),
                Build.CURRENT.hash(),
                Build.CURRENT.date(),
                Constants.OS_NAME,
                Constants.OS_VERSION,
                Constants.OS_ARCH,
                Constants.JVM_VENDOR,
                Constants.JVM_NAME,
                Constants.JAVA_VERSION,
                Constants.JVM_VERSION);
            if (jvmInfo.getBundledJdk()) {
                logger.info("JVM home [{}], using bundled JDK [{}]", System.getProperty("java.home"), jvmInfo.getUsingBundledJdk());
            } else {
                logger.info("JVM home [{}]", System.getProperty("java.home"));
                deprecationLogger.deprecate(
                    "no-jdk",
                    "no-jdk distributions that do not bundle a JDK are deprecated and will be removed in a future release");
            }
            logger.info("JVM arguments {}", Arrays.toString(jvmInfo.getInputArguments()));
            if (Build.CURRENT.isProductionRelease() == false) {
                logger.warn(
                    "version [{}] is a pre-release version of Elasticsearch and is not suitable for production",
                    Build.CURRENT.getQualifiedVersion());
            }

            if (logger.isDebugEnabled()) {
                logger.debug("using config [{}], data [{}], logs [{}], plugins [{}]",
                    initialEnvironment.configFile(), Arrays.toString(initialEnvironment.dataFiles()),
                    initialEnvironment.logsFile(), initialEnvironment.pluginsFile());
            }

            // 创建PluginsService，加载modules目录下的所有模块和plugins目录下的所有插件
            // https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/plugins/PluginsService.java
            this.pluginsService = new PluginsService(tmpSettings, initialEnvironment.configFile(), initialEnvironment.modulesFile(),
                initialEnvironment.pluginsFile(), classpathPlugins);
            final Settings settings = pluginsService.updatedSettings();

            final Set<DiscoveryNodeRole> additionalRoles = pluginsService.filterPlugins(Plugin.class)
                .stream()
                .map(Plugin::getRoles)
                .flatMap(Set::stream)
                .collect(Collectors.toSet());
            DiscoveryNode.setAdditionalRoles(additionalRoles);

            /*
             * Create the environment based on the finalized view of the settings. This is to ensure that components get the same setting
             * values, no matter they ask for them from.
             */
            this.environment = new Environment(settings, initialEnvironment.configFile());
            Environment.assertEquivalent(initialEnvironment, this.environment);
            nodeEnvironment = new NodeEnvironment(tmpSettings, environment);
            logger.info("node name [{}], node ID [{}], cluster name [{}], roles {}",
                NODE_NAME_SETTING.get(tmpSettings), nodeEnvironment.nodeId(), ClusterName.CLUSTER_NAME_SETTING.get(tmpSettings).value(),
                DiscoveryNode.getRolesFromSettings(settings).stream()
                    .map(DiscoveryNodeRole::roleName)
                    .collect(Collectors.toCollection(LinkedHashSet::new)));
            resourcesToClose.add(nodeEnvironment);
            localNodeFactory = new LocalNodeFactory(settings, nodeEnvironment.nodeId());

            // 调用各插件的getExecutorBuilders，获取ExecutorBuilder
            final List<ExecutorBuilder<?>> executorBuilders = pluginsService.getExecutorBuilders(settings);
            // 创建线程池
            final ThreadPool threadPool = new ThreadPool(settings, executorBuilders.toArray(new ExecutorBuilder[0]));
            resourcesToClose.add(() -> ThreadPool.terminate(threadPool, 10, TimeUnit.SECONDS));
            
            final ResourceWatcherService resourceWatcherService = new ResourceWatcherService(settings, threadPool);
            resourcesToClose.add(resourceWatcherService);
            // adds the context to the DeprecationLogger so that it does not need to be injected everywhere
            HeaderWarning.setThreadContext(threadPool.getThreadContext());
            resourcesToClose.add(() -> HeaderWarning.removeThreadContext(threadPool.getThreadContext()));

            final List<Setting<?>> additionalSettings = new ArrayList<>();
            // register the node.data, node.ingest, node.master, node.remote_cluster_client settings here so we can mark them private
            additionalSettings.add(NODE_DATA_SETTING);
            additionalSettings.add(NODE_INGEST_SETTING);
            additionalSettings.add(NODE_MASTER_SETTING);
            additionalSettings.add(NODE_REMOTE_CLUSTER_CLIENT);
            additionalSettings.addAll(pluginsService.getPluginSettings());
            final List<String> additionalSettingsFilter = new ArrayList<>(pluginsService.getPluginSettingsFilter());
            for (final ExecutorBuilder<?> builder : threadPool.builders()) {
                additionalSettings.addAll(builder.getRegisteredSettings());
            }
            // 创建NodeClient
            client = new NodeClient(settings, threadPool);

            // 创建各种***Service对象和各种模***Module对象
            final ScriptModule scriptModule = new ScriptModule(settings, pluginsService.filterPlugins(ScriptPlugin.class));
            final ScriptService scriptService = newScriptService(settings, scriptModule.engines, scriptModule.contexts);
            AnalysisModule analysisModule = new AnalysisModule(this.environment, pluginsService.filterPlugins(AnalysisPlugin.class));
            // this is as early as we can validate settings at this point. we already pass them to ScriptModule as well as ThreadPool
            // so we might be late here already

            final Set<SettingUpgrader<?>> settingsUpgraders = pluginsService.filterPlugins(Plugin.class)
                    .stream()
                    .map(Plugin::getSettingUpgraders)
                    .flatMap(List::stream)
                    .collect(Collectors.toSet());

            final SettingsModule settingsModule =
                    new SettingsModule(settings, additionalSettings, additionalSettingsFilter, settingsUpgraders);
            scriptModule.registerClusterSettingsListeners(scriptService, settingsModule.getClusterSettings());
            final NetworkService networkService = new NetworkService(
                getCustomNameResolvers(pluginsService.filterPlugins(DiscoveryPlugin.class)));

            List<ClusterPlugin> clusterPlugins = pluginsService.filterPlugins(ClusterPlugin.class);
            final ClusterService clusterService = new ClusterService(settings, settingsModule.getClusterSettings(), threadPool);
            clusterService.addStateApplier(scriptService);
            resourcesToClose.add(clusterService);
            final Set<Setting<?>> consistentSettings = settingsModule.getConsistentSettings();
            if (consistentSettings.isEmpty() == false) {
                clusterService.addLocalNodeMasterListener(
                        new ConsistentSettingsService(settings, clusterService, consistentSettings).newHashPublisher());
            }
            final IngestService ingestService = new IngestService(clusterService, threadPool, this.environment,
                scriptService, analysisModule.getAnalysisRegistry(),
                pluginsService.filterPlugins(IngestPlugin.class), client);
            final SetOnce<RepositoriesService> repositoriesServiceReference = new SetOnce<>();
            final ClusterInfoService clusterInfoService = newClusterInfoService(settings, clusterService, threadPool, client);
            final UsageService usageService = new UsageService();

            ModulesBuilder modules = new ModulesBuilder();
            final MonitorService monitorService = new MonitorService(settings, nodeEnvironment, threadPool);
            final FsHealthService fsHealthService = new FsHealthService(settings, clusterService.getClusterSettings(), threadPool,
                nodeEnvironment);
            final SetOnce<RerouteService> rerouteServiceReference = new SetOnce<>();
            final InternalSnapshotsInfoService snapshotsInfoService = new InternalSnapshotsInfoService(settings, clusterService,
                repositoriesServiceReference::get, rerouteServiceReference::get);
            final ClusterModule clusterModule = new ClusterModule(settings, clusterService, clusterPlugins, clusterInfoService,
                snapshotsInfoService, threadPool.getThreadContext());
            modules.add(clusterModule);
            IndicesModule indicesModule = new IndicesModule(pluginsService.filterPlugins(MapperPlugin.class));
            modules.add(indicesModule);

            SearchModule searchModule = new SearchModule(settings, pluginsService.filterPlugins(SearchPlugin.class));
            List<BreakerSettings> pluginCircuitBreakers = pluginsService.filterPlugins(CircuitBreakerPlugin.class)
                .stream()
                .map(plugin -> plugin.getCircuitBreaker(settings))
                .collect(Collectors.toList());
            final CircuitBreakerService circuitBreakerService = createCircuitBreakerService(settingsModule.getSettings(),
                pluginCircuitBreakers,
                settingsModule.getClusterSettings());
            pluginsService.filterPlugins(CircuitBreakerPlugin.class)
                .forEach(plugin -> {
                    CircuitBreaker breaker = circuitBreakerService.getBreaker(plugin.getCircuitBreaker(settings).getName());
                    plugin.setCircuitBreaker(breaker);
                });
            resourcesToClose.add(circuitBreakerService);
            modules.add(new GatewayModule());


            PageCacheRecycler pageCacheRecycler = createPageCacheRecycler(settings);
            BigArrays bigArrays = createBigArrays(pageCacheRecycler, circuitBreakerService);
            modules.add(settingsModule);
            List<NamedWriteableRegistry.Entry> namedWriteables = Stream.of(
                NetworkModule.getNamedWriteables().stream(),
                IndicesModule.getNamedWriteables().stream(),
                searchModule.getNamedWriteables().stream(),
                pluginsService.filterPlugins(Plugin.class).stream()
                    .flatMap(p -> p.getNamedWriteables().stream()),
                ClusterModule.getNamedWriteables().stream())
                .flatMap(Function.identity()).collect(Collectors.toList());
            final NamedWriteableRegistry namedWriteableRegistry = new NamedWriteableRegistry(namedWriteables);
            NamedXContentRegistry xContentRegistry = new NamedXContentRegistry(Stream.of(
                NetworkModule.getNamedXContents().stream(),
                IndicesModule.getNamedXContents().stream(),
                searchModule.getNamedXContents().stream(),
                pluginsService.filterPlugins(Plugin.class).stream()
                    .flatMap(p -> p.getNamedXContent().stream()),
                ClusterModule.getNamedXWriteables().stream())
                .flatMap(Function.identity()).collect(toList()));
            final MetaStateService metaStateService = new MetaStateService(nodeEnvironment, xContentRegistry);
            final PersistedClusterStateService lucenePersistedStateFactory
                = new PersistedClusterStateService(nodeEnvironment, xContentRegistry, bigArrays, clusterService.getClusterSettings(),
                threadPool::relativeTimeInMillis);

            // collect engine factory providers from plugins
            final Collection<EnginePlugin> enginePlugins = pluginsService.filterPlugins(EnginePlugin.class);
            final Collection<Function<IndexSettings, Optional<EngineFactory>>> engineFactoryProviders =
                    enginePlugins.stream().map(plugin -> (Function<IndexSettings, Optional<EngineFactory>>)plugin::getEngineFactory)
                            .collect(Collectors.toList());


            final Map<String, IndexStorePlugin.DirectoryFactory> indexStoreFactories =
                    pluginsService.filterPlugins(IndexStorePlugin.class)
                            .stream()
                            .map(IndexStorePlugin::getDirectoryFactories)
                            .flatMap(m -> m.entrySet().stream())
                            .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

            final Map<String, IndexStorePlugin.RecoveryStateFactory> recoveryStateFactories =
                pluginsService.filterPlugins(IndexStorePlugin.class)
                    .stream()
                    .map(IndexStorePlugin::getRecoveryStateFactories)
                    .flatMap(m -> m.entrySet().stream())
                    .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

            final List<IndexStorePlugin.IndexFoldersDeletionListener> indexFoldersDeletionListeners =
                pluginsService.filterPlugins(IndexStorePlugin.class)
                    .stream()
                    .map(IndexStorePlugin::getIndexFoldersDeletionListeners)
                    .flatMap(List::stream)
                    .collect(Collectors.toList());

            final Map<String, IndexStorePlugin.SnapshotCommitSupplier> snapshotCommitSuppliers =
                    pluginsService.filterPlugins(IndexStorePlugin.class)
                            .stream()
                            .map(IndexStorePlugin::getSnapshotCommitSuppliers)
                            .flatMap(m -> m.entrySet().stream())
                            .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

            final Map<String, Collection<SystemIndexDescriptor>> systemIndexDescriptorMap = pluginsService
                .filterPlugins(SystemIndexPlugin.class)
                .stream()
                .collect(Collectors.toUnmodifiableMap(
                    plugin -> plugin.getClass().getSimpleName(),
                    plugin -> plugin.getSystemIndexDescriptors(settings)));
            final SystemIndices systemIndices = new SystemIndices(systemIndexDescriptorMap);

            final SystemIndexManager systemIndexManager = new SystemIndexManager(systemIndices, client);
            clusterService.addListener(systemIndexManager);

            final RerouteService rerouteService
                = new BatchedRerouteService(clusterService, clusterModule.getAllocationService()::reroute);
            rerouteServiceReference.set(rerouteService);
            clusterService.setRerouteService(rerouteService);

            final IndicesService indicesService =
                new IndicesService(settings, pluginsService, nodeEnvironment, xContentRegistry, analysisModule.getAnalysisRegistry(),
                    clusterModule.getIndexNameExpressionResolver(), indicesModule.getMapperRegistry(), namedWriteableRegistry,
                    threadPool, settingsModule.getIndexScopedSettings(), circuitBreakerService, bigArrays, scriptService,
                    clusterService, client, metaStateService, engineFactoryProviders, indexStoreFactories,
                    searchModule.getValuesSourceRegistry(), recoveryStateFactories, indexFoldersDeletionListeners,
                    snapshotCommitSuppliers);

            final AliasValidator aliasValidator = new AliasValidator();

            final ShardLimitValidator shardLimitValidator = new ShardLimitValidator(settings, clusterService);
            final MetadataCreateIndexService metadataCreateIndexService = new MetadataCreateIndexService(
                    settings,
                    clusterService,
                    indicesService,
                    clusterModule.getAllocationService(),
                    aliasValidator,
                shardLimitValidator,
                    environment,
                    settingsModule.getIndexScopedSettings(),
                    threadPool,
                    xContentRegistry,
                    systemIndices,
                    forbidPrivateIndexSettings
            );
            pluginsService.filterPlugins(Plugin.class)
                .forEach(p -> p.getAdditionalIndexSettingProviders()
                    .forEach(metadataCreateIndexService::addAdditionalIndexSettingProvider));

            final MetadataCreateDataStreamService metadataCreateDataStreamService =
                new MetadataCreateDataStreamService(threadPool, clusterService, metadataCreateIndexService);

            Collection<Object> pluginComponents = pluginsService.filterPlugins(Plugin.class).stream()
                .flatMap(p -> p.createComponents(client, clusterService, threadPool, resourceWatcherService,
                                                 scriptService, xContentRegistry, environment, nodeEnvironment,
                                                 namedWriteableRegistry, clusterModule.getIndexNameExpressionResolver(),
                                                 repositoriesServiceReference::get).stream())
                .collect(Collectors.toList());

            ActionModule actionModule = new ActionModule(settings, clusterModule.getIndexNameExpressionResolver(),
                settingsModule.getIndexScopedSettings(), settingsModule.getClusterSettings(), settingsModule.getSettingsFilter(),
                threadPool, pluginsService.filterPlugins(ActionPlugin.class), client, circuitBreakerService, usageService, systemIndices,
                getRestCompatibleFunction());
            modules.add(actionModule);

            final RestController restController = actionModule.getRestController();
            final NetworkModule networkModule = new NetworkModule(settings, pluginsService.filterPlugins(NetworkPlugin.class),
                threadPool, bigArrays, pageCacheRecycler, circuitBreakerService, namedWriteableRegistry, xContentRegistry,
                networkService, restController, clusterService.getClusterSettings());
            Collection<UnaryOperator<Map<String, IndexTemplateMetadata>>> indexTemplateMetadataUpgraders =
                pluginsService.filterPlugins(Plugin.class).stream()
                    .map(Plugin::getIndexTemplateMetadataUpgrader)
                    .collect(Collectors.toList());
            final MetadataUpgrader metadataUpgrader = new MetadataUpgrader(indexTemplateMetadataUpgraders);
            final MetadataIndexUpgradeService metadataIndexUpgradeService = new MetadataIndexUpgradeService(settings, xContentRegistry,
                indicesModule.getMapperRegistry(), settingsModule.getIndexScopedSettings(), systemIndices, scriptService);
            if (DiscoveryNode.isMasterNode(settings)) {
                clusterService.addListener(new SystemIndexMetadataUpgradeService(systemIndices, clusterService));
            }
            new TemplateUpgradeService(client, clusterService, threadPool, indexTemplateMetadataUpgraders);
            final Transport transport = networkModule.getTransportSupplier().get();
            Set<String> taskHeaders = Stream.concat(
                pluginsService.filterPlugins(ActionPlugin.class).stream().flatMap(p -> p.getTaskHeaders().stream()),
                Stream.of(Task.X_OPAQUE_ID)
            ).collect(Collectors.toSet());
            final TransportService transportService = newTransportService(settings, transport, threadPool,
                networkModule.getTransportInterceptor(), localNodeFactory, settingsModule.getClusterSettings(), taskHeaders);
            final GatewayMetaState gatewayMetaState = new GatewayMetaState();
            final ResponseCollectorService responseCollectorService = new ResponseCollectorService(clusterService);
            final SearchTransportService searchTransportService = new SearchTransportService(transportService, client,
                SearchExecutionStatsCollector.makeWrapper(responseCollectorService));
            final HttpServerTransport httpServerTransport = newHttpTransport(networkModule);
            final IndexingPressure indexingLimits = new IndexingPressure(settings);

            final RecoverySettings recoverySettings = new RecoverySettings(settings, settingsModule.getClusterSettings());
            RepositoriesModule repositoriesModule = new RepositoriesModule(this.environment,
                pluginsService.filterPlugins(RepositoryPlugin.class), transportService, clusterService, bigArrays, xContentRegistry,
                recoverySettings);
            RepositoriesService repositoryService = repositoriesModule.getRepositoryService();
            repositoriesServiceReference.set(repositoryService);
            SnapshotsService snapshotsService = new SnapshotsService(settings, clusterService,
                    clusterModule.getIndexNameExpressionResolver(), repositoryService, transportService, actionModule.getActionFilters());
            SnapshotShardsService snapshotShardsService = new SnapshotShardsService(settings, clusterService, repositoryService,
                    transportService, indicesService);
            RestoreService restoreService = new RestoreService(clusterService, repositoryService, clusterModule.getAllocationService(),
                metadataCreateIndexService, metadataIndexUpgradeService, clusterService.getClusterSettings(), shardLimitValidator);

            final DiskThresholdMonitor diskThresholdMonitor = new DiskThresholdMonitor(settings, clusterService::state,
                clusterService.getClusterSettings(), client, threadPool::relativeTimeInMillis, rerouteService);
            clusterInfoService.addListener(diskThresholdMonitor::onNewInfo);

            final DiscoveryModule discoveryModule = new DiscoveryModule(settings, transportService, namedWriteableRegistry,
                networkService, clusterService.getMasterService(), clusterService.getClusterApplierService(),
                clusterService.getClusterSettings(), pluginsService.filterPlugins(DiscoveryPlugin.class),
                clusterModule.getAllocationService(), environment.configFile(), gatewayMetaState, rerouteService,
                fsHealthService);
            this.nodeService = new NodeService(settings, threadPool, monitorService, discoveryModule.getDiscovery(),
                transportService, indicesService, pluginsService, circuitBreakerService, scriptService,
                httpServerTransport, ingestService, clusterService, settingsModule.getSettingsFilter(), responseCollectorService,
                searchTransportService, indexingLimits, searchModule.getValuesSourceRegistry().getUsageService());

            final SearchService searchService = newSearchService(clusterService, indicesService,
                threadPool, scriptService, bigArrays, searchModule.getFetchPhase(),
                responseCollectorService, circuitBreakerService);

            final List<PersistentTasksExecutor<?>> tasksExecutors = pluginsService
                .filterPlugins(PersistentTaskPlugin.class).stream()
                .map(p -> p.getPersistentTasksExecutor(clusterService, threadPool, client, settingsModule,
                    clusterModule.getIndexNameExpressionResolver()))
                .flatMap(List::stream)
                .collect(toList());

            final PersistentTasksExecutorRegistry registry = new PersistentTasksExecutorRegistry(tasksExecutors);
            final PersistentTasksClusterService persistentTasksClusterService =
                new PersistentTasksClusterService(settings, registry, clusterService, threadPool);
            resourcesToClose.add(persistentTasksClusterService);
            final PersistentTasksService persistentTasksService = new PersistentTasksService(clusterService, threadPool, client);
            // 绑定各种服务模块的实例
            modules.add(b -> {
                    b.bind(Node.class).toInstance(this);
                    b.bind(NodeService.class).toInstance(nodeService);
                    b.bind(NamedXContentRegistry.class).toInstance(xContentRegistry);
                    b.bind(PluginsService.class).toInstance(pluginsService);
                    b.bind(Client.class).toInstance(client);
                    b.bind(NodeClient.class).toInstance(client);
                    b.bind(Environment.class).toInstance(this.environment);
                    b.bind(ThreadPool.class).toInstance(threadPool);
                    b.bind(NodeEnvironment.class).toInstance(nodeEnvironment);
                    b.bind(ResourceWatcherService.class).toInstance(resourceWatcherService);
                    b.bind(CircuitBreakerService.class).toInstance(circuitBreakerService);
                    b.bind(BigArrays.class).toInstance(bigArrays);
                    b.bind(PageCacheRecycler.class).toInstance(pageCacheRecycler);
                    b.bind(ScriptService.class).toInstance(scriptService);
                    b.bind(AnalysisRegistry.class).toInstance(analysisModule.getAnalysisRegistry());
                    b.bind(IngestService.class).toInstance(ingestService);
                    b.bind(IndexingPressure.class).toInstance(indexingLimits);
                    b.bind(UsageService.class).toInstance(usageService);
                    b.bind(AggregationUsageService.class).toInstance(searchModule.getValuesSourceRegistry().getUsageService());
                    b.bind(NamedWriteableRegistry.class).toInstance(namedWriteableRegistry);
                    b.bind(MetadataUpgrader.class).toInstance(metadataUpgrader);
                    b.bind(MetaStateService.class).toInstance(metaStateService);
                    b.bind(PersistedClusterStateService.class).toInstance(lucenePersistedStateFactory);
                    b.bind(IndicesService.class).toInstance(indicesService);
                    b.bind(AliasValidator.class).toInstance(aliasValidator);
                    b.bind(MetadataCreateIndexService.class).toInstance(metadataCreateIndexService);
                    b.bind(MetadataCreateDataStreamService.class).toInstance(metadataCreateDataStreamService);
                    b.bind(SearchService.class).toInstance(searchService);
                    b.bind(SearchTransportService.class).toInstance(searchTransportService);
                    b.bind(SearchPhaseController.class).toInstance(new SearchPhaseController(
                        namedWriteableRegistry, searchService::aggReduceContextBuilder));
                    b.bind(Transport.class).toInstance(transport);
                    b.bind(TransportService.class).toInstance(transportService);
                    b.bind(NetworkService.class).toInstance(networkService);
                    b.bind(UpdateHelper.class).toInstance(new UpdateHelper(scriptService));
                    b.bind(MetadataIndexUpgradeService.class).toInstance(metadataIndexUpgradeService);
                    b.bind(ClusterInfoService.class).toInstance(clusterInfoService);
                    b.bind(SnapshotsInfoService.class).toInstance(snapshotsInfoService);
                    b.bind(GatewayMetaState.class).toInstance(gatewayMetaState);
                    b.bind(Discovery.class).toInstance(discoveryModule.getDiscovery());
                    {
                        processRecoverySettings(settingsModule.getClusterSettings(), recoverySettings);
                        b.bind(PeerRecoverySourceService.class).toInstance(new PeerRecoverySourceService(transportService,
                                indicesService, recoverySettings));
                        b.bind(PeerRecoveryTargetService.class).toInstance(new PeerRecoveryTargetService(threadPool,
                                transportService, recoverySettings, clusterService));
                    }
                    b.bind(HttpServerTransport.class).toInstance(httpServerTransport);
                    pluginComponents.stream().forEach(p -> b.bind((Class) p.getClass()).toInstance(p));
                    b.bind(PersistentTasksService.class).toInstance(persistentTasksService);
                    b.bind(PersistentTasksClusterService.class).toInstance(persistentTasksClusterService);
                    b.bind(PersistentTasksExecutorRegistry.class).toInstance(registry);
                    b.bind(RepositoriesService.class).toInstance(repositoryService);
                    b.bind(SnapshotsService.class).toInstance(snapshotsService);
                    b.bind(SnapshotShardsService.class).toInstance(snapshotShardsService);
                    b.bind(RestoreService.class).toInstance(restoreService);
                    b.bind(RerouteService.class).toInstance(rerouteService);
                    b.bind(ShardLimitValidator.class).toInstance(shardLimitValidator);
                    b.bind(FsHealthService.class).toInstance(fsHealthService);
                    b.bind(SystemIndices.class).toInstance(systemIndices);
                }
            );
            injector = modules.createInjector();

            // We allocate copies of existing shards by looking for a viable copy of the shard in the cluster and assigning the shard there.
            // The search for viable copies is triggered by an allocation attempt (i.e. a reroute) and is performed asynchronously. When it
            // completes we trigger another reroute to try the allocation again. This means there is a circular dependency: the allocation
            // service needs access to the existing shards allocators (e.g. the GatewayAllocator) which need to be able to trigger a
            // reroute, which needs to call into the allocation service. We close the loop here:
            clusterModule.setExistingShardsAllocators(injector.getInstance(GatewayAllocator.class));

            List<LifecycleComponent> pluginLifecycleComponents = pluginComponents.stream()
                .filter(p -> p instanceof LifecycleComponent)
                .map(p -> (LifecycleComponent) p).collect(Collectors.toList());
            resourcesToClose.addAll(pluginLifecycleComponents);
            resourcesToClose.add(injector.getInstance(PeerRecoverySourceService.class));
            this.pluginLifecycleComponents = Collections.unmodifiableList(pluginLifecycleComponents);
            client.initialize(injector.getInstance(new Key<Map<ActionType, TransportAction>>() {}),
                transportService.getTaskManager(),
                () -> clusterService.localNode().getId(),
                transportService.getLocalNodeConnection(),
                transportService.getRemoteClusterService(),
                namedWriteableRegistry);
            this.namedWriteableRegistry = namedWriteableRegistry;

            logger.debug("initializing HTTP handlers ...");
            actionModule.initRestHandlers(() -> clusterService.state().nodes());
            logger.info("initialized");

            success = true;
        } catch (IOException ex) {
            throw new ElasticsearchException("failed to bind service", ex);
        } finally {
            if (!success) {
                IOUtils.closeWhileHandlingException(resourcesToClose);
            }
        }
    }


    /**
     * Start the node. If the node is already started, this method is no-op.
     */
    public Node start() throws NodeValidationException {
        // 将local node的state设为STARTED状态
        if (!lifecycle.moveToStarted()) {
            return this;
        }

        logger.info("starting ...");
        // plugins start
        pluginLifecycleComponents.forEach(LifecycleComponent::start);

        injector.getInstance(MappingUpdatedAction.class).setClient(client);
        injector.getInstance(IndicesService.class).start();
        injector.getInstance(IndicesClusterStateService.class).start();
        injector.getInstance(SnapshotsService.class).start();
        injector.getInstance(SnapshotShardsService.class).start();
        injector.getInstance(RepositoriesService.class).start();
        injector.getInstance(SearchService.class).start();
        injector.getInstance(FsHealthService.class).start();
        nodeService.getMonitorService().start();

        final ClusterService clusterService = injector.getInstance(ClusterService.class);

        final NodeConnectionsService nodeConnectionsService = injector.getInstance(NodeConnectionsService.class);
        nodeConnectionsService.start();
        clusterService.setNodeConnectionsService(nodeConnectionsService);

        injector.getInstance(GatewayService.class).start();
        Discovery discovery = injector.getInstance(Discovery.class);
        clusterService.getMasterService().setClusterStatePublisher(discovery::publish);

        // Start the transport service now so the publish address will be added to the local disco node in ClusterService
        TransportService transportService = injector.getInstance(TransportService.class);
        transportService.getTaskManager().setTaskResultsService(injector.getInstance(TaskResultsService.class));
        transportService.getTaskManager().setTaskCancellationService(new TaskCancellationService(transportService));
        transportService.start();
        assert localNodeFactory.getNode() != null;
        assert transportService.getLocalNode().equals(localNodeFactory.getNode())
            : "transportService has a different local node than the factory provided";
        injector.getInstance(PeerRecoverySourceService.class).start();

        // Load (and maybe upgrade) the metadata stored on disk
        final GatewayMetaState gatewayMetaState = injector.getInstance(GatewayMetaState.class);
        gatewayMetaState.start(settings(), transportService, clusterService, injector.getInstance(MetaStateService.class),
            injector.getInstance(MetadataIndexUpgradeService.class), injector.getInstance(MetadataUpgrader.class),
            injector.getInstance(PersistedClusterStateService.class));
        if (Assertions.ENABLED) {
            try {
                assert injector.getInstance(MetaStateService.class).loadFullState().v1().isEmpty();
                final NodeMetadata nodeMetadata = NodeMetadata.FORMAT.loadLatestState(logger, NamedXContentRegistry.EMPTY,
                    nodeEnvironment.nodeDataPaths());
                assert nodeMetadata != null;
                assert nodeMetadata.nodeVersion().equals(Version.CURRENT);
                assert nodeMetadata.nodeId().equals(localNodeFactory.getNode().getId());
            } catch (IOException e) {
                assert false : e;
            }
        }
        // we load the global state here (the persistent part of the cluster state stored on disk) to
        // pass it to the bootstrap checks to allow plugins to enforce certain preconditions based on the recovered state.
        final Metadata onDiskMetadata = gatewayMetaState.getPersistedState().getLastAcceptedState().metadata();
        assert onDiskMetadata != null : "metadata is null but shouldn't"; // this is never null
        validateNodeBeforeAcceptingRequests(new BootstrapContext(environment, onDiskMetadata), transportService.boundAddress(),
            pluginsService.filterPlugins(Plugin.class).stream()
                .flatMap(p -> p.getBootstrapChecks().stream()).collect(Collectors.toList()));

        clusterService.addStateApplier(transportService.getTaskManager());
        // start after transport service so the local disco is known
        discovery.start(); // start before cluster service so that it can set initial state on ClusterApplierService
        clusterService.start();
        assert clusterService.localNode().equals(localNodeFactory.getNode())
            : "clusterService has a different local node than the factory provided";
        // start accepting incoming requests.
        // when the transport layer starts up it will block any incoming requests until this method is called.
        transportService.acceptIncomingRequests();
        // 一会着重看一下选举部分
        discovery.startInitialJoin();
        final TimeValue initialStateTimeout = INITIAL_STATE_TIMEOUT_SETTING.get(settings());
        configureNodeAndClusterIdStateListener(clusterService);

        if (initialStateTimeout.millis() > 0) {
            final ThreadPool thread = injector.getInstance(ThreadPool.class);
            ClusterState clusterState = clusterService.state();
            ClusterStateObserver observer =
                new ClusterStateObserver(clusterState, clusterService, null, logger, thread.getThreadContext());

            if (clusterState.nodes().getMasterNodeId() == null) {
                logger.debug("waiting to join the cluster. timeout [{}]", initialStateTimeout);
                final CountDownLatch latch = new CountDownLatch(1);
                // Wait for the next cluster state which satisfies statePredicate
                observer.waitForNextChange(new ClusterStateObserver.Listener() {
                    @Override
                    public void onNewClusterState(ClusterState state) { latch.countDown(); }

                    @Override
                    public void onClusterServiceClose() {
                        latch.countDown();
                    }

                    @Override
                    public void onTimeout(TimeValue timeout) {
                        logger.warn("timed out while waiting for initial discovery state - timeout: {}",
                            initialStateTimeout);
                        latch.countDown();
                    }
                }, state -> state.nodes().getMasterNodeId() != null, initialStateTimeout);

                try {
                    latch.await();
                } catch (InterruptedException e) {
                    throw new ElasticsearchTimeoutException("Interrupted while waiting for initial discovery state");
                }
            }
        }

        injector.getInstance(HttpServerTransport.class).start();

        if (WRITE_PORTS_FILE_SETTING.get(settings())) {
            TransportService transport = injector.getInstance(TransportService.class);
            writePortsFile("transport", transport.boundAddress());
            HttpServerTransport http = injector.getInstance(HttpServerTransport.class);
            writePortsFile("http", http.boundAddress());
        }

        logger.info("started");

        pluginsService.filterPlugins(ClusterPlugin.class).forEach(ClusterPlugin::onNodeStarted);

        return this;
    }
```

# [discovery.startInitialJoin()](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/cluster/coordination/Coordinator.java#L700)

```
    // https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/cluster/coordination/Coordinator.java#L700
    @Override
    public void startInitialJoin() {
        synchronized (mutex) {
            becomeCandidate("startInitialJoin");
        }
        clusterBootstrapService.scheduleUnconfiguredBootstrap();
    }
    // https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/cluster/coordination/Coordinator.java#L517
    void becomeCandidate(String method) {
        assert Thread.holdsLock(mutex) : "Coordinator mutex not held";
        logger.debug("{}: coordinator becoming CANDIDATE in term {} (was {}, lastKnownLeader was [{}])",
            method, getCurrentTerm(), mode, lastKnownLeader);

        if (mode != Mode.CANDIDATE) {
            final Mode prevMode = mode;
            mode = Mode.CANDIDATE;
            cancelActivePublication("become candidate: " + method);
            joinAccumulator.close(mode);
            joinAccumulator = joinHelper.new CandidateJoinAccumulator();

            peerFinder.activate(coordinationState.get().getLastAcceptedState().nodes());
            clusterFormationFailureHelper.start();

            leaderChecker.setCurrentNodes(DiscoveryNodes.EMPTY_NODES);
            leaderChecker.updateLeader(null);

            followersChecker.clearCurrentNodes();
            followersChecker.updateFastResponseState(getCurrentTerm(), mode);
            lagDetector.clearTrackedNodes();

            if (prevMode == Mode.LEADER) {
                cleanMasterService();
            }

            if (applierState.nodes().getMasterNodeId() != null) {
                applierState = clusterStateWithNoMasterBlock(applierState);
                clusterApplier.onNewClusterState("becoming candidate: " + method, () -> applierState, (source, e) -> {
                });
            }
        }

        preVoteCollector.update(getPreVoteResponse(), null);
    }

    // ClusterBootstrapService.java#L146 
     void scheduleUnconfiguredBootstrap() {
        if (unconfiguredBootstrapTimeout == null) {
            return;
        }

        if (transportService.getLocalNode().isMasterNode() == false) {
            return;
        }

        logger.info("no discovery configuration found, will perform best-effort cluster bootstrapping after [{}] " +
            "unless existing master is discovered", unconfiguredBootstrapTimeout);

        transportService.getThreadPool().scheduleUnlessShuttingDown(unconfiguredBootstrapTimeout, Names.GENERIC, new Runnable() {
            @Override
            public void run() {
                final Set<DiscoveryNode> discoveredNodes = getDiscoveredNodes();
                logger.debug("performing best-effort cluster bootstrapping with {}", discoveredNodes);
                startBootstrap(discoveredNodes, emptyList());
            }

            @Override
            public String toString() {
                return "unconfigured-discovery delayed bootstrap";
            }
        });
    }
    // ClusterBootstrapService.java#L178
    private void startBootstrap(Set<DiscoveryNode> discoveryNodes, List<String> unsatisfiedRequirements) {
        assert discoveryNodes.stream().allMatch(DiscoveryNode::isMasterNode) : discoveryNodes;
        assert unsatisfiedRequirements.size() < discoveryNodes.size() : discoveryNodes + " smaller than " + unsatisfiedRequirements;
        if (bootstrappingPermitted.compareAndSet(true, false)) {
            // VotingConfiguration:
            // A collection of persistent node ids, denoting the voting configuration for cluster state changes.
            doBootstrap(new VotingConfiguration(Stream.concat(discoveryNodes.stream().map(DiscoveryNode::getId),
                unsatisfiedRequirements.stream().map(s -> BOOTSTRAP_PLACEHOLDER_PREFIX + s))
                .collect(Collectors.toSet())));
        }
    }
    // ClusterBootstrapService.java#L192
    private void doBootstrap(VotingConfiguration votingConfiguration) {
        assert transportService.getLocalNode().isMasterNode();

        try {
            votingConfigurationConsumer.accept(votingConfiguration);
        } catch (Exception e) {
            logger.warn(new ParameterizedMessage("exception when bootstrapping with {}, rescheduling", votingConfiguration), e);
            transportService.getThreadPool().scheduleUnlessShuttingDown(TimeValue.timeValueSeconds(10), Names.GENERIC,
                new Runnable() {
                    @Override
                    public void run() {
                        doBootstrap(votingConfiguration);
                    }

                    @Override
                    public String toString() {
                        return "retry of failed bootstrapping with " + votingConfiguration;
                    }
                }
            );
        }
    }

```

那么ClusterBootstrapService doBootstrap的入参是从哪里来的呢？
看一下Coordinator的构造函数：
```
    /**
     * @param nodeName The name of the node, used to name the {@link java.util.concurrent.ExecutorService} of the {@link SeedHostsResolver}.
     * @param onJoinValidators A collection of join validators to restrict which nodes may join the cluster.
     */
    public Coordinator(String nodeName, Settings settings, ClusterSettings clusterSettings, TransportService transportService,
                       NamedWriteableRegistry namedWriteableRegistry, AllocationService allocationService, MasterService masterService,
                       Supplier<CoordinationState.PersistedState> persistedStateSupplier, SeedHostsProvider seedHostsProvider,
                       ClusterApplier clusterApplier, Collection<BiConsumer<DiscoveryNode, ClusterState>> onJoinValidators, Random random,
                       RerouteService rerouteService, ElectionStrategy electionStrategy, NodeHealthService nodeHealthService) {
        this.settings = settings;
        this.transportService = transportService;
        this.masterService = masterService;
        this.allocationService = allocationService;
        this.onJoinValidators = JoinTaskExecutor.addBuiltInJoinValidators(onJoinValidators);
        this.singleNodeDiscovery = DiscoveryModule.isSingleNodeDiscovery(settings);
        this.electionStrategy = electionStrategy;
        this.joinHelper = new JoinHelper(settings, allocationService, masterService, transportService, this::getCurrentTerm,
            this::getStateForMasterService, this::handleJoinRequest, this::joinLeaderInTerm, this.onJoinValidators, rerouteService,
            nodeHealthService);
        this.persistedStateSupplier = persistedStateSupplier;
        this.noMasterBlockService = new NoMasterBlockService(settings, clusterSettings);
        this.lastKnownLeader = Optional.empty();
        this.lastJoin = Optional.empty();
        this.joinAccumulator = new InitialJoinAccumulator();
        this.publishTimeout = PUBLISH_TIMEOUT_SETTING.get(settings);
        this.publishInfoTimeout = PUBLISH_INFO_TIMEOUT_SETTING.get(settings);
        this.random = random;
        this.electionSchedulerFactory = new ElectionSchedulerFactory(settings, random, transportService.getThreadPool());
        this.preVoteCollector = new PreVoteCollector(transportService, this::startElection, this::updateMaxTermSeen, electionStrategy,
            nodeHealthService);
        configuredHostsResolver = new SeedHostsResolver(nodeName, settings, transportService, seedHostsProvider);
        this.peerFinder = new CoordinatorPeerFinder(settings, transportService,
            new HandshakingTransportAddressConnector(settings, transportService), configuredHostsResolver);
        this.publicationHandler = new PublicationTransportHandler(transportService, namedWriteableRegistry,
            this::handlePublishRequest, this::handleApplyCommit);
        this.leaderChecker = new LeaderChecker(settings, transportService, this::onLeaderFailure, nodeHealthService);
        this.followersChecker = new FollowersChecker(settings, transportService, this::onFollowerCheckRequest, this::removeNode,
            nodeHealthService);
        this.nodeRemovalExecutor = new NodeRemovalClusterStateTaskExecutor(allocationService, logger);
        this.clusterApplier = clusterApplier;
        masterService.setClusterStateSupplier(this::getStateForMasterService);
        this.reconfigurator = new Reconfigurator(settings, clusterSettings);
        // 注意这里传入了Consumer<VotingConfiguration> votingConfigurationConsumer
        this.clusterBootstrapService = new ClusterBootstrapService(settings, transportService, this::getFoundPeers,
            this::isInitialConfigurationSet, this::setInitialConfiguration);
        this.lagDetector = new LagDetector(settings, transportService.getThreadPool(), n -> removeNode(n, "lagging"),
            transportService::getLocalNode);
        this.clusterFormationFailureHelper = new ClusterFormationFailureHelper(settings, this::getClusterFormationState,
            transportService.getThreadPool(), joinHelper::logLastFailedJoinAttempt);
        this.nodeHealthService = nodeHealthService;
    }

    /**
     * Sets the initial configuration to the given {@link VotingConfiguration}. This method is safe to call
     * more than once, as long as the argument to each call is the same.
     *
     * @param votingConfiguration The nodes that should form the initial configuration.
     * @return whether this call successfully set the initial configuration - if false, the cluster has already been bootstrapped.
     */
    public boolean setInitialConfiguration(final VotingConfiguration votingConfiguration) {
        synchronized (mutex) {
            final ClusterState currentState = getStateForMasterService();

            if (isInitialConfigurationSet()) {
                logger.debug("initial configuration already set, ignoring {}", votingConfiguration);
                return false;
            }

            if (getLocalNode().isMasterNode() == false) {
                logger.debug("skip setting initial configuration as local node is not a master-eligible node");
                throw new CoordinationStateRejectedException(
                    "this node is not master-eligible, but cluster bootstrapping can only happen on a master-eligible node");
            }

            if (votingConfiguration.getNodeIds().contains(getLocalNode().getId()) == false) {
                logger.debug("skip setting initial configuration as local node is not part of initial configuration");
                throw new CoordinationStateRejectedException("local node is not part of initial configuration");
            }

            final List<DiscoveryNode> knownNodes = new ArrayList<>();
            knownNodes.add(getLocalNode());
            peerFinder.getFoundPeers().forEach(knownNodes::add);

            if (votingConfiguration.hasQuorum(knownNodes.stream().map(DiscoveryNode::getId).collect(Collectors.toList())) == false) {
                logger.debug("skip setting initial configuration as not enough nodes discovered to form a quorum in the " +
                    "initial configuration [knownNodes={}, {}]", knownNodes, votingConfiguration);
                throw new CoordinationStateRejectedException("not enough nodes discovered to form a quorum in the initial configuration " +
                    "[knownNodes=" + knownNodes + ", " + votingConfiguration + "]");
            }

            logger.info("setting initial configuration to {}", votingConfiguration);
            final CoordinationMetadata coordinationMetadata = CoordinationMetadata.builder(currentState.coordinationMetadata())
                .lastAcceptedConfiguration(votingConfiguration)
                .lastCommittedConfiguration(votingConfiguration)
                .build();

            Metadata.Builder metadataBuilder = Metadata.builder(currentState.metadata());
            // automatically generate a UID for the metadata if we need to
            metadataBuilder.generateClusterUuidIfNeeded();
            metadataBuilder.coordinationMetadata(coordinationMetadata);

            coordinationState.get().setInitialState(ClusterState.builder(currentState).metadata(metadataBuilder).build());
            assert localNodeMayWinElection(getLastAcceptedState()) :
                "initial state does not allow local node to win election: " + getLastAcceptedState().coordinationMetadata();
            preVoteCollector.update(getPreVoteResponse(), null); // pick up the change to last-accepted version
            startElectionScheduler();
            return true;
        }
    }

    ClusterState getStateForMasterService() {
        synchronized (mutex) {
            // expose last accepted cluster state as base state upon which the master service
            // speculatively calculates the next cluster state update
            final ClusterState clusterState = coordinationState.get().getLastAcceptedState();
            if (mode != Mode.LEADER || clusterState.term() != getCurrentTerm()) {
                // the master service checks if the local node is the master node in order to fail execution of the state update early
                return clusterStateWithNoMasterBlock(clusterState);
            }
            return clusterState;
        }
    }

    public boolean isInitialConfigurationSet() {
        return getStateForMasterService().getLastAcceptedConfiguration().isEmpty() == false;
    }

    // votes，已经收到的投票
    // nodeIds，VotingConfiguration的节点列表，这是一个动态维护的具备 master 资格的节点列表，来自 LastAcceptedConfiguration或LastCommittedConfiguration
    // 将两个列表求交集，得到intersection，如果intersection对于nodeIds来说过半，则达到多数的要求。
    public boolean hasQuorum(Collection<String> votes) {
        final HashSet<String> intersection = new HashSet<>(nodeIds);
        // A.retainAll(B)
        // 这个方法改变了集合A中的元素，将存在于集合A中但不存在于集合B中的元素移除。
        intersection.retainAll(votes);
        return intersection.size() * 2 > nodeIds.size();
    }
```


# 总结
Node启动过程这种做的检查、初始化都梳理清楚了，但节点加入集群后同步数据，在该部分没有找到。

这个后续在看集群管理的时候，再找一下这个问题的答案。

