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
  protected Node(
    final Environment initialEnvironment,
    Collection<Class<? extends Plugin>> classpathPlugins,
    boolean forbidPrivateIndexSettings
  ) {
    final List<Closeable> resourcesToClose = new ArrayList<>(); // register everything we need to release in the case of an error
    boolean success = false;
    try {
      Settings tmpSettings = Settings
        .builder()
        .put(initialEnvironment.settings())
        .put(Client.CLIENT_TYPE_SETTING_S.getKey(), CLIENT_TYPE)
        .build();

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
        Constants.JVM_VERSION
      );
      if (jvmInfo.getBundledJdk()) {
        logger.info(
          "JVM home [{}], using bundled JDK [{}]",
          System.getProperty("java.home"),
          jvmInfo.getUsingBundledJdk()
        );
      } else {
        logger.info("JVM home [{}]", System.getProperty("java.home"));
        deprecationLogger.deprecate(
          "no-jdk",
          "no-jdk distributions that do not bundle a JDK are deprecated and will be removed in a future release"
        );
      }
      logger.info(
        "JVM arguments {}",
        Arrays.toString(jvmInfo.getInputArguments())
      );
      if (Build.CURRENT.isProductionRelease() == false) {
        logger.warn(
          "version [{}] is a pre-release version of Elasticsearch and is not suitable for production",
          Build.CURRENT.getQualifiedVersion()
        );
      }

      if (logger.isDebugEnabled()) {
        logger.debug(
          "using config [{}], data [{}], logs [{}], plugins [{}]",
          initialEnvironment.configFile(),
          Arrays.toString(initialEnvironment.dataFiles()),
          initialEnvironment.logsFile(),
          initialEnvironment.pluginsFile()
        );
      }

      // 创建PluginsService，加载modules目录下的所有模块和plugins目录下的所有插件
      // https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/plugins/PluginsService.java
      this.pluginsService =
        new PluginsService(
          tmpSettings,
          initialEnvironment.configFile(),
          initialEnvironment.modulesFile(),
          initialEnvironment.pluginsFile(),
          classpathPlugins
        );
      final Settings settings = pluginsService.updatedSettings();

      final Set<DiscoveryNodeRole> additionalRoles = pluginsService
        .filterPlugins(Plugin.class)
        .stream()
        .map(Plugin::getRoles)
        .flatMap(Set::stream)
        .collect(Collectors.toSet());
      DiscoveryNode.setAdditionalRoles(additionalRoles);

      /*
       * Create the environment based on the finalized view of the settings. This is to ensure that components get the same setting
       * values, no matter they ask for them from.
       */
      this.environment =
        new Environment(settings, initialEnvironment.configFile());
      Environment.assertEquivalent(initialEnvironment, this.environment);
      nodeEnvironment = new NodeEnvironment(tmpSettings, environment);
      logger.info(
        "node name [{}], node ID [{}], cluster name [{}], roles {}",
        NODE_NAME_SETTING.get(tmpSettings),
        nodeEnvironment.nodeId(),
        ClusterName.CLUSTER_NAME_SETTING.get(tmpSettings).value(),
        DiscoveryNode
          .getRolesFromSettings(settings)
          .stream()
          .map(DiscoveryNodeRole::roleName)
          .collect(Collectors.toCollection(LinkedHashSet::new))
      );
      resourcesToClose.add(nodeEnvironment);
      localNodeFactory =
        new LocalNodeFactory(settings, nodeEnvironment.nodeId());

      // 调用各插件的getExecutorBuilders，获取ExecutorBuilder
      final List<ExecutorBuilder<?>> executorBuilders = pluginsService.getExecutorBuilders(
        settings
      );
      // 创建线程池
      final ThreadPool threadPool = new ThreadPool(
        settings,
        executorBuilders.toArray(new ExecutorBuilder[0])
      );
      resourcesToClose.add(
        () -> ThreadPool.terminate(threadPool, 10, TimeUnit.SECONDS)
      );

      final ResourceWatcherService resourceWatcherService = new ResourceWatcherService(
        settings,
        threadPool
      );
      resourcesToClose.add(resourceWatcherService);
      // adds the context to the DeprecationLogger so that it does not need to be injected everywhere
      HeaderWarning.setThreadContext(threadPool.getThreadContext());
      resourcesToClose.add(
        () -> HeaderWarning.removeThreadContext(threadPool.getThreadContext())
      );

      final List<Setting<?>> additionalSettings = new ArrayList<>();
      // register the node.data, node.ingest, node.master, node.remote_cluster_client settings here so we can mark them private
      additionalSettings.add(NODE_DATA_SETTING);
      additionalSettings.add(NODE_INGEST_SETTING);
      additionalSettings.add(NODE_MASTER_SETTING);
      additionalSettings.add(NODE_REMOTE_CLUSTER_CLIENT);
      additionalSettings.addAll(pluginsService.getPluginSettings());
      final List<String> additionalSettingsFilter = new ArrayList<>(
        pluginsService.getPluginSettingsFilter()
      );
      for (final ExecutorBuilder<?> builder : threadPool.builders()) {
        additionalSettings.addAll(builder.getRegisteredSettings());
      }
      // 创建NodeClient
      client = new NodeClient(settings, threadPool);

      // 创建各种***Service对象和各种模***Module对象
      final ScriptModule scriptModule = new ScriptModule(
        settings,
        pluginsService.filterPlugins(ScriptPlugin.class)
      );
      final ScriptService scriptService = newScriptService(
        settings,
        scriptModule.engines,
        scriptModule.contexts
      );
      AnalysisModule analysisModule = new AnalysisModule(
        this.environment,
        pluginsService.filterPlugins(AnalysisPlugin.class)
      );
      // this is as early as we can validate settings at this point. we already pass them to ScriptModule as well as ThreadPool
      // so we might be late here already

      final Set<SettingUpgrader<?>> settingsUpgraders = pluginsService
        .filterPlugins(Plugin.class)
        .stream()
        .map(Plugin::getSettingUpgraders)
        .flatMap(List::stream)
        .collect(Collectors.toSet());

      final SettingsModule settingsModule = new SettingsModule(
        settings,
        additionalSettings,
        additionalSettingsFilter,
        settingsUpgraders
      );
      scriptModule.registerClusterSettingsListeners(
        scriptService,
        settingsModule.getClusterSettings()
      );
      final NetworkService networkService = new NetworkService(
        getCustomNameResolvers(
          pluginsService.filterPlugins(DiscoveryPlugin.class)
        )
      );

      List<ClusterPlugin> clusterPlugins = pluginsService.filterPlugins(
        ClusterPlugin.class
      );
      final ClusterService clusterService = new ClusterService(
        settings,
        settingsModule.getClusterSettings(),
        threadPool
      );
      clusterService.addStateApplier(scriptService);
      resourcesToClose.add(clusterService);
      final Set<Setting<?>> consistentSettings = settingsModule.getConsistentSettings();
      if (consistentSettings.isEmpty() == false) {
        clusterService.addLocalNodeMasterListener(
          new ConsistentSettingsService(
            settings,
            clusterService,
            consistentSettings
          )
            .newHashPublisher()
        );
      }
      final IngestService ingestService = new IngestService(
        clusterService,
        threadPool,
        this.environment,
        scriptService,
        analysisModule.getAnalysisRegistry(),
        pluginsService.filterPlugins(IngestPlugin.class),
        client
      );
      final SetOnce<RepositoriesService> repositoriesServiceReference = new SetOnce<>();
      final ClusterInfoService clusterInfoService = newClusterInfoService(
        settings,
        clusterService,
        threadPool,
        client
      );
      final UsageService usageService = new UsageService();

      ModulesBuilder modules = new ModulesBuilder();
      final MonitorService monitorService = new MonitorService(
        settings,
        nodeEnvironment,
        threadPool
      );
      final FsHealthService fsHealthService = new FsHealthService(
        settings,
        clusterService.getClusterSettings(),
        threadPool,
        nodeEnvironment
      );
      final SetOnce<RerouteService> rerouteServiceReference = new SetOnce<>();
      final InternalSnapshotsInfoService snapshotsInfoService = new InternalSnapshotsInfoService(
        settings,
        clusterService,
        repositoriesServiceReference::get,
        rerouteServiceReference::get
      );
      final ClusterModule clusterModule = new ClusterModule(
        settings,
        clusterService,
        clusterPlugins,
        clusterInfoService,
        snapshotsInfoService,
        threadPool.getThreadContext()
      );
      modules.add(clusterModule);
      IndicesModule indicesModule = new IndicesModule(
        pluginsService.filterPlugins(MapperPlugin.class)
      );
      modules.add(indicesModule);

      SearchModule searchModule = new SearchModule(
        settings,
        pluginsService.filterPlugins(SearchPlugin.class)
      );
      List<BreakerSettings> pluginCircuitBreakers = pluginsService
        .filterPlugins(CircuitBreakerPlugin.class)
        .stream()
        .map(plugin -> plugin.getCircuitBreaker(settings))
        .collect(Collectors.toList());
      final CircuitBreakerService circuitBreakerService = createCircuitBreakerService(
        settingsModule.getSettings(),
        pluginCircuitBreakers,
        settingsModule.getClusterSettings()
      );
      pluginsService
        .filterPlugins(CircuitBreakerPlugin.class)
        .forEach(
          plugin -> {
            CircuitBreaker breaker = circuitBreakerService.getBreaker(
              plugin.getCircuitBreaker(settings).getName()
            );
            plugin.setCircuitBreaker(breaker);
          }
        );
      resourcesToClose.add(circuitBreakerService);
      modules.add(new GatewayModule());

      PageCacheRecycler pageCacheRecycler = createPageCacheRecycler(settings);
      BigArrays bigArrays = createBigArrays(
        pageCacheRecycler,
        circuitBreakerService
      );
      modules.add(settingsModule);
      List<NamedWriteableRegistry.Entry> namedWriteables = Stream
        .of(
          NetworkModule.getNamedWriteables().stream(),
          IndicesModule.getNamedWriteables().stream(),
          searchModule.getNamedWriteables().stream(),
          pluginsService
            .filterPlugins(Plugin.class)
            .stream()
            .flatMap(p -> p.getNamedWriteables().stream()),
          ClusterModule.getNamedWriteables().stream()
        )
        .flatMap(Function.identity())
        .collect(Collectors.toList());
      final NamedWriteableRegistry namedWriteableRegistry = new NamedWriteableRegistry(
        namedWriteables
      );
      NamedXContentRegistry xContentRegistry = new NamedXContentRegistry(
        Stream
          .of(
            NetworkModule.getNamedXContents().stream(),
            IndicesModule.getNamedXContents().stream(),
            searchModule.getNamedXContents().stream(),
            pluginsService
              .filterPlugins(Plugin.class)
              .stream()
              .flatMap(p -> p.getNamedXContent().stream()),
            ClusterModule.getNamedXWriteables().stream()
          )
          .flatMap(Function.identity())
          .collect(toList())
      );
      final MetaStateService metaStateService = new MetaStateService(
        nodeEnvironment,
        xContentRegistry
      );
      final PersistedClusterStateService lucenePersistedStateFactory = new PersistedClusterStateService(
        nodeEnvironment,
        xContentRegistry,
        bigArrays,
        clusterService.getClusterSettings(),
        threadPool::relativeTimeInMillis
      );

      // collect engine factory providers from plugins
      final Collection<EnginePlugin> enginePlugins = pluginsService.filterPlugins(
        EnginePlugin.class
      );
      final Collection<Function<IndexSettings, Optional<EngineFactory>>> engineFactoryProviders = enginePlugins
        .stream()
        .map(
          plugin ->
            (Function<IndexSettings, Optional<EngineFactory>>) plugin::getEngineFactory
        )
        .collect(Collectors.toList());

      final Map<String, IndexStorePlugin.DirectoryFactory> indexStoreFactories = pluginsService
        .filterPlugins(IndexStorePlugin.class)
        .stream()
        .map(IndexStorePlugin::getDirectoryFactories)
        .flatMap(m -> m.entrySet().stream())
        .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

      final Map<String, IndexStorePlugin.RecoveryStateFactory> recoveryStateFactories = pluginsService
        .filterPlugins(IndexStorePlugin.class)
        .stream()
        .map(IndexStorePlugin::getRecoveryStateFactories)
        .flatMap(m -> m.entrySet().stream())
        .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

      final List<IndexStorePlugin.IndexFoldersDeletionListener> indexFoldersDeletionListeners = pluginsService
        .filterPlugins(IndexStorePlugin.class)
        .stream()
        .map(IndexStorePlugin::getIndexFoldersDeletionListeners)
        .flatMap(List::stream)
        .collect(Collectors.toList());

      final Map<String, IndexStorePlugin.SnapshotCommitSupplier> snapshotCommitSuppliers = pluginsService
        .filterPlugins(IndexStorePlugin.class)
        .stream()
        .map(IndexStorePlugin::getSnapshotCommitSuppliers)
        .flatMap(m -> m.entrySet().stream())
        .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

      final Map<String, Collection<SystemIndexDescriptor>> systemIndexDescriptorMap = pluginsService
        .filterPlugins(SystemIndexPlugin.class)
        .stream()
        .collect(
          Collectors.toUnmodifiableMap(
            plugin -> plugin.getClass().getSimpleName(),
            plugin -> plugin.getSystemIndexDescriptors(settings)
          )
        );
      final SystemIndices systemIndices = new SystemIndices(
        systemIndexDescriptorMap
      );

      final SystemIndexManager systemIndexManager = new SystemIndexManager(
        systemIndices,
        client
      );
      clusterService.addListener(systemIndexManager);

      final RerouteService rerouteService = new BatchedRerouteService(
        clusterService,
        clusterModule.getAllocationService()::reroute
      );
      rerouteServiceReference.set(rerouteService);
      clusterService.setRerouteService(rerouteService);

      final IndicesService indicesService = new IndicesService(
        settings,
        pluginsService,
        nodeEnvironment,
        xContentRegistry,
        analysisModule.getAnalysisRegistry(),
        clusterModule.getIndexNameExpressionResolver(),
        indicesModule.getMapperRegistry(),
        namedWriteableRegistry,
        threadPool,
        settingsModule.getIndexScopedSettings(),
        circuitBreakerService,
        bigArrays,
        scriptService,
        clusterService,
        client,
        metaStateService,
        engineFactoryProviders,
        indexStoreFactories,
        searchModule.getValuesSourceRegistry(),
        recoveryStateFactories,
        indexFoldersDeletionListeners,
        snapshotCommitSuppliers
      );

      final AliasValidator aliasValidator = new AliasValidator();

      final ShardLimitValidator shardLimitValidator = new ShardLimitValidator(
        settings,
        clusterService
      );
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
      pluginsService
        .filterPlugins(Plugin.class)
        .forEach(
          p ->
            p
              .getAdditionalIndexSettingProviders()
              .forEach(
                metadataCreateIndexService::addAdditionalIndexSettingProvider
              )
        );

      final MetadataCreateDataStreamService metadataCreateDataStreamService = new MetadataCreateDataStreamService(
        threadPool,
        clusterService,
        metadataCreateIndexService
      );

      Collection<Object> pluginComponents = pluginsService
        .filterPlugins(Plugin.class)
        .stream()
        .flatMap(
          p ->
            p
              .createComponents(
                client,
                clusterService,
                threadPool,
                resourceWatcherService,
                scriptService,
                xContentRegistry,
                environment,
                nodeEnvironment,
                namedWriteableRegistry,
                clusterModule.getIndexNameExpressionResolver(),
                repositoriesServiceReference::get
              )
              .stream()
        )
        .collect(Collectors.toList());

      ActionModule actionModule = new ActionModule(
        settings,
        clusterModule.getIndexNameExpressionResolver(),
        settingsModule.getIndexScopedSettings(),
        settingsModule.getClusterSettings(),
        settingsModule.getSettingsFilter(),
        threadPool,
        pluginsService.filterPlugins(ActionPlugin.class),
        client,
        circuitBreakerService,
        usageService,
        systemIndices,
        getRestCompatibleFunction()
      );
      modules.add(actionModule);

      final RestController restController = actionModule.getRestController();
      final NetworkModule networkModule = new NetworkModule(
        settings,
        pluginsService.filterPlugins(NetworkPlugin.class),
        threadPool,
        bigArrays,
        pageCacheRecycler,
        circuitBreakerService,
        namedWriteableRegistry,
        xContentRegistry,
        networkService,
        restController,
        clusterService.getClusterSettings()
      );
      Collection<UnaryOperator<Map<String, IndexTemplateMetadata>>> indexTemplateMetadataUpgraders = pluginsService
        .filterPlugins(Plugin.class)
        .stream()
        .map(Plugin::getIndexTemplateMetadataUpgrader)
        .collect(Collectors.toList());
      final MetadataUpgrader metadataUpgrader = new MetadataUpgrader(
        indexTemplateMetadataUpgraders
      );
      final MetadataIndexUpgradeService metadataIndexUpgradeService = new MetadataIndexUpgradeService(
        settings,
        xContentRegistry,
        indicesModule.getMapperRegistry(),
        settingsModule.getIndexScopedSettings(),
        systemIndices,
        scriptService
      );
      if (DiscoveryNode.isMasterNode(settings)) {
        clusterService.addListener(
          new SystemIndexMetadataUpgradeService(systemIndices, clusterService)
        );
      }
      new TemplateUpgradeService(
        client,
        clusterService,
        threadPool,
        indexTemplateMetadataUpgraders
      );
      final Transport transport = networkModule.getTransportSupplier().get();
      Set<String> taskHeaders = Stream
        .concat(
          pluginsService
            .filterPlugins(ActionPlugin.class)
            .stream()
            .flatMap(p -> p.getTaskHeaders().stream()),
          Stream.of(Task.X_OPAQUE_ID)
        )
        .collect(Collectors.toSet());
      final TransportService transportService = newTransportService(
        settings,
        transport,
        threadPool,
        networkModule.getTransportInterceptor(),
        localNodeFactory,
        settingsModule.getClusterSettings(),
        taskHeaders
      );
      final GatewayMetaState gatewayMetaState = new GatewayMetaState();
      final ResponseCollectorService responseCollectorService = new ResponseCollectorService(
        clusterService
      );
      final SearchTransportService searchTransportService = new SearchTransportService(
        transportService,
        client,
        SearchExecutionStatsCollector.makeWrapper(responseCollectorService)
      );
      final HttpServerTransport httpServerTransport = newHttpTransport(
        networkModule
      );
      final IndexingPressure indexingLimits = new IndexingPressure(settings);

      final RecoverySettings recoverySettings = new RecoverySettings(
        settings,
        settingsModule.getClusterSettings()
      );
      RepositoriesModule repositoriesModule = new RepositoriesModule(
        this.environment,
        pluginsService.filterPlugins(RepositoryPlugin.class),
        transportService,
        clusterService,
        bigArrays,
        xContentRegistry,
        recoverySettings
      );
      RepositoriesService repositoryService = repositoriesModule.getRepositoryService();
      repositoriesServiceReference.set(repositoryService);
      SnapshotsService snapshotsService = new SnapshotsService(
        settings,
        clusterService,
        clusterModule.getIndexNameExpressionResolver(),
        repositoryService,
        transportService,
        actionModule.getActionFilters()
      );
      SnapshotShardsService snapshotShardsService = new SnapshotShardsService(
        settings,
        clusterService,
        repositoryService,
        transportService,
        indicesService
      );
      RestoreService restoreService = new RestoreService(
        clusterService,
        repositoryService,
        clusterModule.getAllocationService(),
        metadataCreateIndexService,
        metadataIndexUpgradeService,
        clusterService.getClusterSettings(),
        shardLimitValidator
      );

      final DiskThresholdMonitor diskThresholdMonitor = new DiskThresholdMonitor(
        settings,
        clusterService::state,
        clusterService.getClusterSettings(),
        client,
        threadPool::relativeTimeInMillis,
        rerouteService
      );
      clusterInfoService.addListener(diskThresholdMonitor::onNewInfo);

      final DiscoveryModule discoveryModule = new DiscoveryModule(
        settings,
        transportService,
        namedWriteableRegistry,
        networkService,
        clusterService.getMasterService(),
        clusterService.getClusterApplierService(),
        clusterService.getClusterSettings(),
        pluginsService.filterPlugins(DiscoveryPlugin.class),
        clusterModule.getAllocationService(),
        environment.configFile(),
        gatewayMetaState,
        rerouteService,
        fsHealthService
      );
      this.nodeService =
        new NodeService(
          settings,
          threadPool,
          monitorService,
          discoveryModule.getDiscovery(),
          transportService,
          indicesService,
          pluginsService,
          circuitBreakerService,
          scriptService,
          httpServerTransport,
          ingestService,
          clusterService,
          settingsModule.getSettingsFilter(),
          responseCollectorService,
          searchTransportService,
          indexingLimits,
          searchModule.getValuesSourceRegistry().getUsageService()
        );

      final SearchService searchService = newSearchService(
        clusterService,
        indicesService,
        threadPool,
        scriptService,
        bigArrays,
        searchModule.getFetchPhase(),
        responseCollectorService,
        circuitBreakerService
      );

      final List<PersistentTasksExecutor<?>> tasksExecutors = pluginsService
        .filterPlugins(PersistentTaskPlugin.class)
        .stream()
        .map(
          p ->
            p.getPersistentTasksExecutor(
              clusterService,
              threadPool,
              client,
              settingsModule,
              clusterModule.getIndexNameExpressionResolver()
            )
        )
        .flatMap(List::stream)
        .collect(toList());

      final PersistentTasksExecutorRegistry registry = new PersistentTasksExecutorRegistry(
        tasksExecutors
      );
      final PersistentTasksClusterService persistentTasksClusterService = new PersistentTasksClusterService(
        settings,
        registry,
        clusterService,
        threadPool
      );
      resourcesToClose.add(persistentTasksClusterService);
      final PersistentTasksService persistentTasksService = new PersistentTasksService(
        clusterService,
        threadPool,
        client
      );
      // 绑定各种服务模块的实例
      modules.add(
        b -> {
          b.bind(Node.class).toInstance(this);
          b.bind(NodeService.class).toInstance(nodeService);
          b.bind(NamedXContentRegistry.class).toInstance(xContentRegistry);
          b.bind(PluginsService.class).toInstance(pluginsService);
          b.bind(Client.class).toInstance(client);
          b.bind(NodeClient.class).toInstance(client);
          b.bind(Environment.class).toInstance(this.environment);
          b.bind(ThreadPool.class).toInstance(threadPool);
          b.bind(NodeEnvironment.class).toInstance(nodeEnvironment);
          b
            .bind(ResourceWatcherService.class)
            .toInstance(resourceWatcherService);
          b.bind(CircuitBreakerService.class).toInstance(circuitBreakerService);
          b.bind(BigArrays.class).toInstance(bigArrays);
          b.bind(PageCacheRecycler.class).toInstance(pageCacheRecycler);
          b.bind(ScriptService.class).toInstance(scriptService);
          b
            .bind(AnalysisRegistry.class)
            .toInstance(analysisModule.getAnalysisRegistry());
          b.bind(IngestService.class).toInstance(ingestService);
          b.bind(IndexingPressure.class).toInstance(indexingLimits);
          b.bind(UsageService.class).toInstance(usageService);
          b
            .bind(AggregationUsageService.class)
            .toInstance(
              searchModule.getValuesSourceRegistry().getUsageService()
            );
          b
            .bind(NamedWriteableRegistry.class)
            .toInstance(namedWriteableRegistry);
          b.bind(MetadataUpgrader.class).toInstance(metadataUpgrader);
          b.bind(MetaStateService.class).toInstance(metaStateService);
          b
            .bind(PersistedClusterStateService.class)
            .toInstance(lucenePersistedStateFactory);
          b.bind(IndicesService.class).toInstance(indicesService);
          b.bind(AliasValidator.class).toInstance(aliasValidator);
          b
            .bind(MetadataCreateIndexService.class)
            .toInstance(metadataCreateIndexService);
          b
            .bind(MetadataCreateDataStreamService.class)
            .toInstance(metadataCreateDataStreamService);
          b.bind(SearchService.class).toInstance(searchService);
          b
            .bind(SearchTransportService.class)
            .toInstance(searchTransportService);
          b
            .bind(SearchPhaseController.class)
            .toInstance(
              new SearchPhaseController(
                namedWriteableRegistry,
                searchService::aggReduceContextBuilder
              )
            );
          b.bind(Transport.class).toInstance(transport);
          b.bind(TransportService.class).toInstance(transportService);
          b.bind(NetworkService.class).toInstance(networkService);
          b
            .bind(UpdateHelper.class)
            .toInstance(new UpdateHelper(scriptService));
          b
            .bind(MetadataIndexUpgradeService.class)
            .toInstance(metadataIndexUpgradeService);
          b.bind(ClusterInfoService.class).toInstance(clusterInfoService);
          b.bind(SnapshotsInfoService.class).toInstance(snapshotsInfoService);
          b.bind(GatewayMetaState.class).toInstance(gatewayMetaState);
          b.bind(Discovery.class).toInstance(discoveryModule.getDiscovery());
          {
            processRecoverySettings(
              settingsModule.getClusterSettings(),
              recoverySettings
            );
            b
              .bind(PeerRecoverySourceService.class)
              .toInstance(
                new PeerRecoverySourceService(
                  transportService,
                  indicesService,
                  recoverySettings
                )
              );
            b
              .bind(PeerRecoveryTargetService.class)
              .toInstance(
                new PeerRecoveryTargetService(
                  threadPool,
                  transportService,
                  recoverySettings,
                  clusterService
                )
              );
          }
          b.bind(HttpServerTransport.class).toInstance(httpServerTransport);
          pluginComponents
            .stream()
            .forEach(p -> b.bind((Class) p.getClass()).toInstance(p));
          b
            .bind(PersistentTasksService.class)
            .toInstance(persistentTasksService);
          b
            .bind(PersistentTasksClusterService.class)
            .toInstance(persistentTasksClusterService);
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
      clusterModule.setExistingShardsAllocators(
        injector.getInstance(GatewayAllocator.class)
      );

      List<LifecycleComponent> pluginLifecycleComponents = pluginComponents
        .stream()
        .filter(p -> p instanceof LifecycleComponent)
        .map(p -> (LifecycleComponent) p)
        .collect(Collectors.toList());
      resourcesToClose.addAll(pluginLifecycleComponents);
      resourcesToClose.add(
        injector.getInstance(PeerRecoverySourceService.class)
      );
      this.pluginLifecycleComponents =
        Collections.unmodifiableList(pluginLifecycleComponents);
      client.initialize(
        injector.getInstance(new Key<Map<ActionType, TransportAction>>() {}),
        transportService.getTaskManager(),
        () -> clusterService.localNode().getId(),
        transportService.getLocalNodeConnection(),
        transportService.getRemoteClusterService(),
        namedWriteableRegistry
      );
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

    final ClusterService clusterService = injector.getInstance(
      ClusterService.class
    );

    final NodeConnectionsService nodeConnectionsService = injector.getInstance(
      NodeConnectionsService.class
    );
    nodeConnectionsService.start();
    clusterService.setNodeConnectionsService(nodeConnectionsService);

    injector.getInstance(GatewayService.class).start();
    Discovery discovery = injector.getInstance(Discovery.class);
    clusterService
      .getMasterService()
      .setClusterStatePublisher(discovery::publish);

    // Start the transport service now so the publish address will be added to the local disco node in ClusterService
    TransportService transportService = injector.getInstance(
      TransportService.class
    );
    transportService
      .getTaskManager()
      .setTaskResultsService(injector.getInstance(TaskResultsService.class));
    transportService
      .getTaskManager()
      .setTaskCancellationService(
        new TaskCancellationService(transportService)
      );
    transportService.start();
    assert localNodeFactory.getNode() != null;
    assert transportService
      .getLocalNode()
      .equals(
        localNodeFactory.getNode()
      ) : "transportService has a different local node than the factory provided";
    injector.getInstance(PeerRecoverySourceService.class).start();

    // Load (and maybe upgrade) the metadata stored on disk
    final GatewayMetaState gatewayMetaState = injector.getInstance(
      GatewayMetaState.class
    );
    gatewayMetaState.start(
      settings(),
      transportService,
      clusterService,
      injector.getInstance(MetaStateService.class),
      injector.getInstance(MetadataIndexUpgradeService.class),
      injector.getInstance(MetadataUpgrader.class),
      injector.getInstance(PersistedClusterStateService.class)
    );
    if (Assertions.ENABLED) {
      try {
        assert injector
          .getInstance(MetaStateService.class)
          .loadFullState()
          .v1()
          .isEmpty();
        final NodeMetadata nodeMetadata = NodeMetadata.FORMAT.loadLatestState(
          logger,
          NamedXContentRegistry.EMPTY,
          nodeEnvironment.nodeDataPaths()
        );
        assert nodeMetadata != null;
        assert nodeMetadata.nodeVersion().equals(Version.CURRENT);
        assert nodeMetadata.nodeId().equals(localNodeFactory.getNode().getId());
      } catch (IOException e) {
        assert false : e;
      }
    }
    // we load the global state here (the persistent part of the cluster state stored on disk) to
    // pass it to the bootstrap checks to allow plugins to enforce certain preconditions based on the recovered state.
    final Metadata onDiskMetadata = gatewayMetaState
      .getPersistedState()
      .getLastAcceptedState()
      .metadata();
    assert onDiskMetadata != null : "metadata is null but shouldn't"; // this is never null
    validateNodeBeforeAcceptingRequests(
      new BootstrapContext(environment, onDiskMetadata),
      transportService.boundAddress(),
      pluginsService
        .filterPlugins(Plugin.class)
        .stream()
        .flatMap(p -> p.getBootstrapChecks().stream())
        .collect(Collectors.toList())
    );

    clusterService.addStateApplier(transportService.getTaskManager());
    // start after transport service so the local disco is known
    discovery.start(); // start before cluster service so that it can set initial state on ClusterApplierService
    clusterService.start();
    assert clusterService
      .localNode()
      .equals(
        localNodeFactory.getNode()
      ) : "clusterService has a different local node than the factory provided";
    // start accepting incoming requests.
    // when the transport layer starts up it will block any incoming requests until this method is called.
    transportService.acceptIncomingRequests();
    // 一会着重看一下选举部分
    discovery.startInitialJoin();
    final TimeValue initialStateTimeout = INITIAL_STATE_TIMEOUT_SETTING.get(
      settings()
    );
    configureNodeAndClusterIdStateListener(clusterService);

    if (initialStateTimeout.millis() > 0) {
      final ThreadPool thread = injector.getInstance(ThreadPool.class);
      ClusterState clusterState = clusterService.state();
      ClusterStateObserver observer = new ClusterStateObserver(
        clusterState,
        clusterService,
        null,
        logger,
        thread.getThreadContext()
      );

      if (clusterState.nodes().getMasterNodeId() == null) {
        logger.debug(
          "waiting to join the cluster. timeout [{}]",
          initialStateTimeout
        );
        final CountDownLatch latch = new CountDownLatch(1);
        // Wait for the next cluster state which satisfies statePredicate
        observer.waitForNextChange(
          new ClusterStateObserver.Listener() {
            @Override
            public void onNewClusterState(ClusterState state) {
              latch.countDown();
            }

            @Override
            public void onClusterServiceClose() {
              latch.countDown();
            }

            @Override
            public void onTimeout(TimeValue timeout) {
              logger.warn(
                "timed out while waiting for initial discovery state - timeout: {}",
                initialStateTimeout
              );
              latch.countDown();
            }
          },
          state -> state.nodes().getMasterNodeId() != null,
          initialStateTimeout
        );

        try {
          latch.await();
        } catch (InterruptedException e) {
          throw new ElasticsearchTimeoutException(
            "Interrupted while waiting for initial discovery state"
          );
        }
      }
    }

    injector.getInstance(HttpServerTransport.class).start();

    if (WRITE_PORTS_FILE_SETTING.get(settings())) {
      TransportService transport = injector.getInstance(TransportService.class);
      writePortsFile("transport", transport.boundAddress());
      HttpServerTransport http = injector.getInstance(
        HttpServerTransport.class
      );
      writePortsFile("http", http.boundAddress());
    }

    logger.info("started");

    pluginsService
      .filterPlugins(ClusterPlugin.class)
      .forEach(ClusterPlugin::onNodeStarted);

    return this;
  }
```

## 选举

[discovery.startInitialJoin()](https://github.com/jiankunking/elasticsearch/blob/master/server/src/main/java/org/elasticsearch/cluster/coordination/Coordinator.java#L700)

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
    logger.debug(
      "{}: coordinator becoming CANDIDATE in term {} (was {}, lastKnownLeader was [{}])",
      method,
      getCurrentTerm(),
      mode,
      lastKnownLeader
    );

    if (mode != Mode.CANDIDATE) {
      final Mode prevMode = mode;
      mode = Mode.CANDIDATE;
      cancelActivePublication("become candidate: " + method);
      joinAccumulator.close(mode);
      joinAccumulator = joinHelper.new CandidateJoinAccumulator();

      // 在activate()方法中调用onFoundPeersUpdated()方法检查集群中的节点是否达到多数
      // 如果达到多数则会发起选举流程startElectionScheduler()
      peerFinder.activate(
        coordinationState.get().getLastAcceptedState().nodes()
      );
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
        clusterApplier.onNewClusterState(
          "becoming candidate: " + method,
          () -> applierState,
          (source, e) -> {}
        );
      }
    }

    preVoteCollector.update(getPreVoteResponse(), null);
  }

  // CoordinatorPeerFinder
  /**
   * Invoked when the set of found peers changes. Note that invocations of this method are not fully synchronised, so we only guarantee
   * that the change to the set of found peers happens before this method is invoked. If there are multiple concurrent changes then there
   * will be multiple concurrent invocations of this method, with no guarantee as to their order. For this reason we do not pass the
   * updated set of peers as an argument to this method, leaving it to the implementation to call getFoundPeers() with appropriate
   * synchronisation to avoid lost updates. Also, by the time this method is invoked we may have been deactivated.
   */
  @Override
  protected void onFoundPeersUpdated() {
    synchronized (mutex) {
      final Iterable<DiscoveryNode> foundPeers = getFoundPeers();
      if (mode == Mode.CANDIDATE) {
        final VoteCollection expectedVotes = new VoteCollection();
        foundPeers.forEach(expectedVotes::addVote);
        expectedVotes.addVote(Coordinator.this.getLocalNode());
        final boolean foundQuorum = coordinationState
          .get()
          .isElectionQuorum(expectedVotes);

        if (foundQuorum) {
          if (electionScheduler == null) {
            startElectionScheduler();
          }
        } else {
          closePrevotingAndElectionScheduler();
        }
      }
    }

    clusterBootstrapService.onFoundPeersUpdated();
  }

  private void startElectionScheduler() {
    assert electionScheduler == null : electionScheduler;

    if (getLocalNode().isMasterNode() == false) {
      return;
    }

    final TimeValue gracePeriod = TimeValue.ZERO;
    electionScheduler =
      electionSchedulerFactory.startElectionScheduler(
        gracePeriod,
        new Runnable() {
          @Override
          public void run() {
            synchronized (mutex) {
              if (mode == Mode.CANDIDATE) {
                final ClusterState lastAcceptedState = coordinationState
                  .get()
                  .getLastAcceptedState();

                // https://github.com/elastic/elasticsearch/commit/d95b53d87bbfd082d949ab9610a21a805b3bdef2
                if (localNodeMayWinElection(lastAcceptedState) == false) {
                  logger.trace(
                    "skip prevoting as local node may not win election: {}",
                    lastAcceptedState.coordinationMetadata()
                  );
                  return;
                }

                final StatusInfo statusInfo = nodeHealthService.getHealth();
                if (statusInfo.getStatus() == UNHEALTHY) {
                  logger.debug(
                    "skip prevoting as local node is unhealthy: [{}]",
                    statusInfo.getInfo()
                  );
                  return;
                }

                if (prevotingRound != null) {
                  prevotingRound.close();
                }
                // PreVoteCollector start
                prevotingRound =
                  preVoteCollector.start(
                    lastAcceptedState,
                    getDiscoveredNodes()
                  );
              }
            }
          }

          @Override
          public String toString() {
            return "scheduling of new prevoting round";
          }
        }
      );
  }

  /**
   * Start a new pre-voting round.
   *
   * @param clusterState   the last-accepted cluster state
   * @param broadcastNodes the nodes from whom to request pre-votes
   * @return the pre-voting round, which can be closed to end the round early.
   */
  public Releasable start(
    final ClusterState clusterState,
    final Iterable<DiscoveryNode> broadcastNodes
  ) {
    PreVotingRound preVotingRound = new PreVotingRound(
      clusterState,
      state.v2().getCurrentTerm()
    );
    preVotingRound.start(broadcastNodes);
    return preVotingRound;
  }

  // PreVotingRound start
  void start(final Iterable<DiscoveryNode> broadcastNodes) {
    logger.debug("{} requesting pre-votes from {}", this, broadcastNodes);
    // https://github.com/elastic/elasticsearch/pull/32847
    // String REQUEST_PRE_VOTE_ACTION_NAME = "internal:cluster/request_pre_vote";
    broadcastNodes.forEach(
      n ->
        transportService.sendRequest(
          n,
          REQUEST_PRE_VOTE_ACTION_NAME,
          preVoteRequest,
          new TransportResponseHandler<PreVoteResponse>() {
            @Override
            public PreVoteResponse read(StreamInput in) throws IOException {
              return new PreVoteResponse(in);
            }

            @Override
            public void handleResponse(PreVoteResponse response) {
              handlePreVoteResponse(response, n);
            }

            @Override
            public void handleException(TransportException exp) {
              logger.debug(new ParameterizedMessage("{} failed", this), exp);
            }

            @Override
            public String executor() {
              return Names.GENERIC;
            }

            @Override
            public String toString() {
              return (
                "TransportResponseHandler{" +
                PreVoteCollector.this +
                ", node=" +
                n +
                '}'
              );
            }
          }
        )
    );
  }
```
request(REQUEST_PRE_VOTE_ACTION_NAME)发出去之后，谁来处理呢？看下PreVoteCollector的构造函数：
```
PreVoteCollector(
    final TransportService transportService,
    final Runnable startElection,
    final LongConsumer updateMaxTermSeen,
    final ElectionStrategy electionStrategy,
    NodeHealthService nodeHealthService
  ) {
    this.transportService = transportService;
    this.startElection = startElection;
    this.updateMaxTermSeen = updateMaxTermSeen;
    this.electionStrategy = electionStrategy;
    this.nodeHealthService = nodeHealthService;

    transportService.registerRequestHandler(
      REQUEST_PRE_VOTE_ACTION_NAME,
      Names.GENERIC,
      false,
      false,
      PreVoteRequest::new,
      (request, channel, task) ->
        channel.sendResponse(handlePreVoteRequest(request))
    );
  }
```
可以看出处理request(REQUEST_PRE_VOTE_ACTION_NAME)的是：
* 更新MaxTermSeen
* 判断leader是否为空，如果为空则直接返回response
* 判断发起PreVoteRequest的节点是否是leader，如果是则直接返回response
* 如果集群存在leader，并且这个leader不是发起PreVoteRequest的节点，则抛出异常：拒绝PreVoteRequest请求，因为集群中已存在leader
```
private PreVoteResponse handlePreVoteRequest(final PreVoteRequest request) {
    updateMaxTermSeen.accept(request.getCurrentTerm());

    Tuple<DiscoveryNode, PreVoteResponse> state = this.state;
    assert state != null : "received pre-vote request before fully initialised";

    final DiscoveryNode leader = state.v1();
    final PreVoteResponse response = state.v2();

    final StatusInfo statusInfo = nodeHealthService.getHealth();
    if (statusInfo.getStatus() == UNHEALTHY) {
      String message =
        "rejecting " +
        request +
        " on unhealthy node: [" +
        statusInfo.getInfo() +
        "]";
      logger.debug(message);
      throw new NodeHealthCheckFailureException(message);
    }

    if (leader == null) {
      return response;
    }

    if (leader.equals(request.getSourceNode())) {
      // This is a _rare_ case where our leader has detected a failure and stepped down, but we are still a follower. It's possible
      // that the leader lost its quorum, but while we're still a follower we will not offer joins to any other node so there is no
      // major drawback in offering a join to our old leader. The advantage of this is that it makes it slightly more likely that the
      // leader won't change, and also that its re-election will happen more quickly than if it had to wait for a quorum of followers
      // to also detect its failure.
      return response;
    }

    throw new CoordinationStateRejectedException(
      "rejecting " + request + " as there is already a leader"
    );
  }
```
request处理完了，再看一下response是如何处理？
* 更新MaxTermSeen
* 如果满足以下两种情况之一，则忽略该response：
    * response中lastAcceptedTerm大于clusterState中的term
    * response中lastAcceptedTerm等于clusterState中的term并且response中lastAcceptedVersion大于clusterState中的version
* 节点接收所有没有被忽略的response
* 节点根据接收到的response来构造Join(选票)
* 调用electionStrategy.isElectionQuorum()判断选票是否达到大多数，如果没有则直接返回
* 根据electionStarted来判断选举是否已经开始，如果已经开始则直接返回
* 调用startElection.run()来发起选举
```
private void handlePreVoteResponse(
    final PreVoteResponse response,
    final DiscoveryNode sender
  ) {
    if (isClosed.get()) {
      logger.debug("{} is closed, ignoring {} from {}", this, response, sender);
      return;
    }

    updateMaxTermSeen.accept(response.getCurrentTerm());

    if (
      response.getLastAcceptedTerm() > clusterState.term() ||
      (
        response.getLastAcceptedTerm() == clusterState.term() &&
        response.getLastAcceptedVersion() > clusterState.version()
      )
    ) {
      logger.debug(
        "{} ignoring {} from {} as it is fresher",
        this,
        response,
        sender
      );
      return;
    }

    preVotesReceived.put(sender, response);

    // create a fake VoteCollection based on the pre-votes and check if there is an election quorum
    final VoteCollection voteCollection = new VoteCollection();
    final DiscoveryNode localNode = clusterState.nodes().getLocalNode();
    final PreVoteResponse localPreVoteResponse = getPreVoteResponse();

    preVotesReceived.forEach(
      (node, preVoteResponse) ->
        voteCollection.addJoinVote(
          new Join(
            node,
            localNode,
            preVoteResponse.getCurrentTerm(),
            preVoteResponse.getLastAcceptedTerm(),
            preVoteResponse.getLastAcceptedVersion()
          )
        )
    );

    if (
      electionStrategy.isElectionQuorum(
        clusterState.nodes().getLocalNode(),
        localPreVoteResponse.getCurrentTerm(),
        localPreVoteResponse.getLastAcceptedTerm(),
        localPreVoteResponse.getLastAcceptedVersion(),
        clusterState.getLastCommittedConfiguration(),
        clusterState.getLastAcceptedConfiguration(),
        voteCollection
      ) ==
      false
    ) {
      logger.debug(
        "{} added {} from {}, no quorum yet",
        this,
        response,
        sender
      );
      return;
    }

    if (electionStarted.compareAndSet(false, true) == false) {
      logger.debug(
        "{} added {} from {} but election has already started",
        this,
        response,
        sender
      );
      return;
    }

    logger.debug(
      "{} added {} from {}, starting election",
      this,
      response,
      sender
    );
    startElection.run();
  }
```

从Coordinator的构造函数中可以看出：
```
this.preVoteCollector = new PreVoteCollector(transportService, 
this::startElection, 
this::updateMaxTermSeen, 
electionStrategy,
nodeHealthService);
```
startElection.run()其实调用的就是Coordinator中的startElection：
* 节点会构造StartJoinRequest,StartJoinRequest中的term的值取节点当前term与maxTermSeen的最大值并加1。
* 并将该请求发送给discoveredNodes
* 该节点的discoveredNodes在接收到StartJoinRequest后会使用handleStartJoin(StartJoinRequest startJoinRequest)方法来处理该请求：如果StartJoinRequest中的term大于discoveredNodes的currentTerm，就会构造Join来为节点投票。

> 暂未找到transportService.registerRequestHandler接受StartJoinRequest的方法入口
> 该部分以下，都是整理自：https://www.modb.pro/db/33681，后续自己再梳理一下。
```
private void startElection() {
    synchronized (mutex) {
      // The preVoteCollector is only active while we are candidate, but it does not call this method with synchronisation, so we have
      // to check our mode again here.
      if (mode == Mode.CANDIDATE) {
        if (localNodeMayWinElection(getLastAcceptedState()) == false) {
          logger.trace(
            "skip election as local node may not win it: {}",
            getLastAcceptedState().coordinationMetadata()
          );
          return;
        }

        final StartJoinRequest startJoinRequest = new StartJoinRequest(
          getLocalNode(),
          Math.max(getCurrentTerm(), maxTermSeen) + 1
        );
        logger.debug("starting election with {}", startJoinRequest);
        getDiscoveredNodes()
          .forEach(
            node -> joinHelper.sendStartJoinRequest(startJoinRequest, node)
          );
      }
    }
  }

  //  CoordinationState::handleStartJoin
  /**
   * May be safely called at any time to move this instance to a new term.
   *
   * @param startJoinRequest The startJoinRequest, specifying the node requesting the join.
   * @return A Join that should be sent to the target node of the join.
   * @throws CoordinationStateRejectedException if the arguments were incompatible with the current state of this object.
   */
  public Join handleStartJoin(StartJoinRequest startJoinRequest) {
    // 选民处理要求投票的请求。
    // 由于候选人在发起StartJoinRequest的时候将 term+1了，因此请求中的term应该大于本节点term
    if (startJoinRequest.getTerm() <= getCurrentTerm()) {
      logger.debug(
        "handleStartJoin: ignoring [{}] as term provided is not greater than current term [{}]",
        startJoinRequest,
        getCurrentTerm()
      );
      throw new CoordinationStateRejectedException(
        "incoming term " +
        startJoinRequest.getTerm() +
        " not greater than current term " +
        getCurrentTerm()
      );
    }

    logger.debug(
      "handleStartJoin: leaving term [{}] due to {}",
      getCurrentTerm(),
      startJoinRequest
    );

    if (joinVotes.isEmpty() == false) {
      final String reason;
      if (electionWon == false) {
        reason = "failed election";
      } else if (startJoinRequest.getSourceNode().equals(localNode)) {
        reason = "bumping term";
      } else {
        reason = "standing down as leader";
      }
      logger.debug("handleStartJoin: discarding {}: {}", joinVotes, reason);
    }

    persistedState.setCurrentTerm(startJoinRequest.getTerm());
    assert getCurrentTerm() == startJoinRequest.getTerm();
    lastPublishedVersion = 0;
    lastPublishedConfiguration = getLastAcceptedConfiguration();
    startedJoinSinceLastReboot = true;
    electionWon = false;
    joinVotes = new VoteCollection();
    publishVotes = new VoteCollection();

    return new Join(
      localNode,
      startJoinRequest.getSourceNode(),
      getCurrentTerm(),
      getLastAcceptedTerm(),
      getLastAcceptedVersion()
    );
  }
```

当节点收到选票后会使用handleJoin()方法来处理，具体处理逻辑如下：

* 判断选民返回的投票(Join)中的term与当前节点的term的是否相等，如果不相等则会抛出CoordinationStateRejectedException("incoming term does not match current term")，拒绝将选票添加
* 判断startedJoinSinceLastReboot是否为false，这个场景是指在节点reboot后term没有增加，当startedJoinSinceLastReboot为false时，抛出CoordinationStateRejectedException("ignored join as term has not been incremented yet after reboot”)，拒绝将选票添加
* 判断选民返回的投票(Join)中的lastAcceptedTerm与当前节点的lastAcceptedTerm的关系，如果前者大于后者，则抛出异常CoordinationStateRejectedException，拒绝将选票添加
* 如果选民返回的投票(Join)中的lastAcceptedTerm与当前节点的lastAcceptedTerm相等，但是Join中的lastAcceptedVersion大于当前节点的lastAcceptedVersion，则抛出CoordinationStateRejectedException并拒绝将选票添加
* 判断节点的lastAcceptedConfiguration是否为空，如果为空则抛出CoordinationStateRejectedException
* 将该选票添加到joinVotes中
* 判断是否到达法定人数
```
  // CoordinationState::handleJoin
 /**
   * May be safely called at any time to move this instance to a new term.
   *
   * @param startJoinRequest The startJoinRequest, specifying the node requesting the join.
   * @return A Join that should be sent to the target node of the join.
   * @throws CoordinationStateRejectedException if the arguments were incompatible with the current state of this object.
   */
  public Join handleStartJoin(StartJoinRequest startJoinRequest) {
    if (startJoinRequest.getTerm() <= getCurrentTerm()) {
      logger.debug(
        "handleStartJoin: ignoring [{}] as term provided is not greater than current term [{}]",
        startJoinRequest,
        getCurrentTerm()
      );
      throw new CoordinationStateRejectedException(
        "incoming term " +
        startJoinRequest.getTerm() +
        " not greater than current term " +
        getCurrentTerm()
      );
    }

    logger.debug(
      "handleStartJoin: leaving term [{}] due to {}",
      getCurrentTerm(),
      startJoinRequest
    );

    if (joinVotes.isEmpty() == false) {
      final String reason;
      if (electionWon == false) {
        reason = "failed election";
      } else if (startJoinRequest.getSourceNode().equals(localNode)) {
        reason = "bumping term";
      } else {
        reason = "standing down as leader";
      }
      logger.debug("handleStartJoin: discarding {}: {}", joinVotes, reason);
    }

    persistedState.setCurrentTerm(startJoinRequest.getTerm());
    assert getCurrentTerm() == startJoinRequest.getTerm();
    lastPublishedVersion = 0;
    lastPublishedConfiguration = getLastAcceptedConfiguration();
    startedJoinSinceLastReboot = true;
    electionWon = false;
    joinVotes = new VoteCollection();
    publishVotes = new VoteCollection();

    return new Join(
      localNode,
      startJoinRequest.getSourceNode(),
      getCurrentTerm(),
      getLastAcceptedTerm(),
      getLastAcceptedVersion()
    );
  }
```

最后processJoinRequest(JoinRequest joinRequest, JoinHelper.JoinCallback joinCallback)方法中当该节点收到多数的投票后会调用becomeLeader("handleJoinRequest")方法使得该节点的状态由candidate转换为leader。至此集群的master节点就选出来了。
```
private void processJoinRequest(
    JoinRequest joinRequest,
    JoinHelper.JoinCallback joinCallback
  ) {
    final Optional<Join> optionalJoin = joinRequest.getOptionalJoin();
    synchronized (mutex) {
      updateMaxTermSeen(joinRequest.getTerm());

      final CoordinationState coordState = coordinationState.get();
      final boolean prevElectionWon = coordState.electionWon();

      optionalJoin.ifPresent(this::handleJoin);
      joinAccumulator.handleJoinRequest(
        joinRequest.getSourceNode(),
        joinCallback
      );

      if (prevElectionWon == false && coordState.electionWon()) {
        becomeLeader("handleJoinRequest");
      }
    }
  }
```

# 总结
Node启动过程这种做的检查、初始化、加入集群都梳理清楚了，但节点加入集群后同步数据，在该部分没有找到。

这个后续在看集群管理的时候，再找一下这个问题的答案。



参考：
https://www.modb.pro/db/33681
https://easyice.cn/archives/332