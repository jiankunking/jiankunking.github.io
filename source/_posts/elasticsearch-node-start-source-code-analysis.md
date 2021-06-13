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
            // Node实例添加validateNodeBeforeAcceptingRequests
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

     /**
     * Start the node. If the node is already started, this method is no-op.
     */
    public Node start() throws NodeValidationException {
        if (!lifecycle.moveToStarted()) {
            return this;
        }

        logger.info("starting ...");
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
        transportService.acceptIncomingRequests();
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

# 总结
Node启动过程这种做的检查、初始化都梳理清楚了，但节点加入集群后同步数据，在该部分没有找到。

这个后续在看集群管理的时候，再找一下这个问题的答案。