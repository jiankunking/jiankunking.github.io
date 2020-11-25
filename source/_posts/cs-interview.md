---
title: cs-interview
categories:
  - Interview
tags:
  - Interview
  - 原创
abbrlink: 48210
date: 2017-02-02 08:22:15
---

# Java部分
1. java比较 icompare
2. tomcat 热部署 加载方式与双亲委派模型？
3. java io api 过滤器模式？
4. threadLocal 实现原理？
5. tcp ip协议
6. 服务端如何确定seesion是同一个？
7. 内存屏障（Memory Barriers）
8. lock synchronized ReentrantLock
9. jvm JVM的年轻代分为哪几代？年轻代什么时候会进入老年代？
10. jvm JVM 垃圾回收算法？（注意年轻代与老年代是不一样的）?
11. jvm内存模型 一个变量初始化 怎么分配内存 分配到什么地方？
12. 不使用双亲委派模型的缺点？
13. java 开源序列化框架有哪些？彼此之间有什么区别（优缺点）？
14. java.util.concurrent hashmap 相关问题
15. JAVA线程sleep和wait方法区别
16. PriorityQueue（优先级队列） 堆相关问题
17. 常见的负载均衡算法
18. java 阻塞队列 相关问题，阻塞具体是如何实现的？
19. 静态代码块. 构造代码块. 构造函数以及Java类初始化顺序
20. java 枚举的实现，内部如何进行存储的？
21. 静态内部类与普通内部类，在用法. 初始化方面的区别？
22. java 原子性 可见性 顺序性是通过什么来保证的?
23. java 多线程内共享的模型
24. 阻塞非阻塞与同步异步
25. java nio原理
26. 读写锁 自旋锁 尝试锁（cas） cas如何保证，查询到修改这个过程是原子的？
27. 一个类中的静态变量是在类加载的哪个步骤加载的？
28. synchronized与ReentrantLock 实现原理区别？
29. threadlocal 实现原理？应用场景？
30. 常见的设计模式
31. 分布式事务
32. 线程池工作原理及机制
33. 线程挂了 保活
34. keepalive 保活策略？
35. Protocol Buffers 适用场景？
36. http tcp 相比多了些什么？有什么不一样的地方？
37. http与https区别？加密算法是？
38. wait 是释放锁？为什么释放了锁，线程就挂起了。为什么线程wait了就挂起了？
39. CMS 垃圾回收
40. hashmap 线程不安全 什么时候会出现？会出现什么问题？（hashmap为啥线程不安全？）
41. equals 比较原理？
42. jvm 内存分布
43. arraylist linklist
44. interger 为null 转int 会发生什么？
45. hashmap与hashset的关系？
46. 线程与协程的区别？协程的优势？
47. JDK8 如何实现协程？
48. java lambda 实现原理
49. java stream 实现原理
50. 永久代(permanent generation)与Metaspace
51. 如何保证GC ROOTS找的全？（比如中G1中）
52. G1清理老年代. 年轻代是遍历所有吗？
53. 可重入锁和不可重入锁？不可重入锁有啥缺陷？
54. CPU密集型 Java线程池大小为何会大多被设置成CPU核心数+1？
55. 什么情况下会出现ClassNotFoundException？
56. 线程有几种状态？
57. 如何动态上报JVM信息，以便后期排查OOM等问题？
58. ConcurrentHashMap put的时候加锁的是数组上的元素 还是啥？
59. Concurrenthashmap中用到的优化技巧？
60. LRU如何实现？
61. 为什么Concurrenthashmap扩容是安全的？
62. LinkedHashMap和HashMap 区别？
63. CompletableFuture get(long timeout, TimeUnit unit) throws TimeoutException, ExecutionException实现
[https://medium.com/@sergeykuptsov/how-it-works-in-java-completablefuture-3031dbbca66d](https://medium.com/@sergeykuptsov/how-it-works-in-java-completablefuture-3031dbbca66d)
64、Java time-based map/cache with expiring keys
[https://stackoverflow.com/questions/3802370/java-time-based-map-cache-with-expiring-keys](https://stackoverflow.com/questions/3802370/java-time-based-map-cache-with-expiring-keys)


# MySQL部分
1. mysql 时间 比较无效 原因？
2. mysql 数据库 索引 是以什么数据结构形式存储的？
3. mysql与sql server 异同点？ 原理上？
4. 索引顺序对于索引效果的影响？
5. 数据库索引如何优化（从哪几个方面）？
6. mysql优化有哪些？
7. 比如一个表中有100条数据，a字段的值，是从1到100，我要更新其中的数据，where条件时a>10
mysql通过innodb引擎的话，是通过表锁还是行锁？
8. mysql mvcc多版本并发控制
9. mysql为什么选中B+ TREE而不是B TREE？两种数据结构有什么区别？
10. mysql 范围查询？索引的数据结构是如何处理的？
11. mysql事务提交原理？
12. 聚集索引 非聚集索引 查询效率？
13. mysql 乐观锁 悲观锁
14. 数据库分库分表

# 基础
1. 进程间通信方式有哪些？
2. 有些信号你能捕获，有些信号你是捕获不了的，捕获不了的信号有哪些？
3. zookeeper 可以通过watch，用来做进程间通信，那么zk底层是使用什么方式来实现进程间通信的？依赖操作系统如何实现的？
4. socket通信
5. keepalive时间限制
6. tcp 如何处理粘包问题
7. http协议 如何区分header头还有body体
8. tcp 协议网络段 协议簇
9. 一次完整的http请求
10. http code 302 304含义

# 线上
1. 如何线上debug?比如线上的cpu爆了，这个步骤是？
2. 线上fd耗光了，如何排查？
3. 如何定位OOM 问题？

# Kakfa
1. kafka某个broker上是否可以有无限个topic?或者万级别的topic?
2. kafka 设计，还有broker上文件存储
3. kakfa是否支持顺序消费消息？
4. zk在kafka集群中的作用
5. kafka 消费时候可以批量拉取？
6. 消息队列 选型 为什么选择kafka?
7. kafka增加. 删除节点时如何迁移数据？新的数据如何分配？
8. kafka写入消息 如何保证回滚或者保证不被消费
9. kafka 如何确保消息消费且只消费一次？

# ElasticSearch
1. 在ElasticSearch中，集群(Cluster),节点(Node),分片(Shard),Indices(索引),replicas(备份)之间是什么关系？
2. elasticsearch整个建索引. 查询的过程
3. elasticsearch如何选举
4. ik 是如何进行分词的？
5. es Scroll 原理？ Search After原理？
6. es 副本作用？
7. mysql elasticsearch 查询对比？（比如整个搜索流程）
8. elasticsearch match filter 差异点？
9. es 评分机制/原理

# OpenTSDB
1. OpenTSDB与HBase 关系

# 脑经急转弯
1. 判断一个整数是2的N次方？
2. 二叉树拷贝（非递归）
3. BitMap算法（应用）

# 其他
1. 分布式锁有哪些实现方式？
2. 分布式事务
3. 异地多活
4. zookeeper集群 当一个节点挂了一天，当再次启动的时候，如何识别哪个是leader？
5. 有什么知名的开源apm(Application Performance Management)工具吗？
6. pinpoint 原理？
7. consul template作用？如何与prometheus交互的？


# 金融
1. 同业拆借
2. 信用卡消费一笔钱，是如何到收款人的账户的？（整个流转过程）
3. 复式记账

# Spring
1. spring 注入 接口即如何注入一个接口的多个实现类？
2. spring 中用到的设计模式？spring中一次完整的http请求链路？