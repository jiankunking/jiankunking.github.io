---
title: Sentry 高可用部署
abbrlink: 31935
date: 2020-02-16 19:30:15
categories:
  - Sentry
tags:
  - Sentry
  - Deploy
  - 原创
---

> Sentry 高可用部署，部署分析基于Sentry 10.1.0.dev 05e720a7
> 对应dockerhub镜像版本分别为：
getsentry/snuba:31c967e774759c0548652d986645fdff844e0a39
getsentry/sentry:8549f2a492c803bab77af26e7417272975b9369a
getsentry/symbolicator:94cdbb7b543ebe53744144305db21a56b6a0d5a8


<!-- more -->

Sentry官方对于[自托管](https://docs.sentry.io/server/)推荐的部署方式是[Docker Compose](https://docs.sentry.io/server/installation/),但这种方式有以下几个缺点：
* 所有服务都部署在一台机器上
* 所有的组件都不是高可用的

对于生产环境来说，组件高可用是一个必备的条件，所以有了下面的高可用部署，高可用部署分为两部分：
* Sentry依赖中间件的高可用
* Sentry本身组件的高可用

# Sentry 服务

Sentry具体的服务关系及依赖，具体见下图：

![](/images/sentry-high-availability-deploy/Sentry.png)

需要注意以下几点：
* symbolicator、symbolicator-cleanup 依赖挂载卷sentry-symbolicator:/data
* web、cron、worker、post-process-forwarder、sentry-cleanup 也依赖挂载卷，具体可以可见：https://docs.sentry.io/server/filestore/

为什么需要关注挂载卷？

因为挂载卷依赖存储服务，如果没用高可用的存储服务，Sentry自身组件就难以做到全部高可用。

# 部署

## Sentry依赖中间件

* Sentry依赖中间件的高可用，可以通过购买云服务商的服务来实现或者自己搭建。
* 通过修改sentry onpremise将Sentry依赖的服务替换为相关的ip或者域名，具体代码可以参考：[jiankunking/onpremise](https://github.com/jiankunking/onpremise)。

## Sentry自身服务

将Sentry服务拆分，部署到kubernetes集群中，具体设置参考onpremise中docker-compose.yml中的启动命令、端口、环境变量来设置。

其中有以下几点需要注意：
* Sentry各个服务的启动命令，相比docker-compose.yml中command，不太一致，简单列一下：
	* snuba api
	* snuba consumer --auto-offset-reset=latest --max-batch-time-ms 750
	* snuba replacer --auto-offset-reset=latest --max-batch-size 3
	* symbolicator run
	* sentry run web --loglevel DEBUG
	* sentry run cron
	* sentry run worker
	* ......
* [snuba](https://github.com/jiankunking/snuba) api默认监听的是127.0.0.1，修改为0.0.0.0，具体修改位置参见：
https://github.com/jiankunking/snuba/commit/69fee6253c6a78e7c2668bf6c86692e4df8fe012
* [sentry](https://github.com/jiankunking/sentry) sentry/conf/server.py中KAFKA_CLUSTERS默认是localhost:9092,修改方式参见：
https://github.com/jiankunking/onpremise/blob/master/sentry/cover/server.py#L1640
* 构建sentry镜像，当启动命令为post-process-forwarder时，需要将自定义后的config.yml、sentry.conf.py拷贝到镜像/etc/sentry目录下，具体参见：
https://github.com/jiankunking/onpremise/blob/master/sentry/Dockerfile#L10
* sentry 环境变量中添加C_FORCE_ROOT=true，可以强制以root身份运行
* [install.sh脚本](https://github.com/jiankunking/onpremise/blob/master/install.sh)
	* [初始化clickhouse数据库结构](https://github.com/jiankunking/onpremise/blob/master/install.sh#L113)
	* [添加初始用户](https://github.com/jiankunking/onpremise/blob/master/install.sh#L142)
* sentry worker依赖于sentry cron，所以不能只部署worker，否则会有下面的错误提示：Background workers haven't checked in recently. This is likely an issue with your configuration or the workers aren't running.
	
# 小结

总的来说，将sentry部署到kubernetes中，需要注意的点还是挺多的，很多细节需要看代码来排查。

2020-06-17 更新

Sentry 社区版不支持高可用的ClickHouse分布式表。

```
Distributed tables are not officially supported. 
DATASET_MODE would switch to distributed table names, but bootstrap won't work. 
You would have to manage your tables (create and all DDL operations) manually. 
This is not a support process, I can give you some hints, but you would be doing it at your own risk.

On the other hand, we are working on this support though we cannot commit to a timeline at this time.
```

[The environment variable DATASET_MODE does not work](https://github.com/getsentry/snuba/issues/847)




