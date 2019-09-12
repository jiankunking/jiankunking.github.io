---
title: API网关架构设计
categories:
  - Architecture
tags:
  - Architecture
  - Gateway
  - Design
  - API
  - 原创
abbrlink: 9163
date: 2018-07-11 10:41:52
---

> 构建一个API网关

<!-- more -->

# 定义

API Gateway一个比较广泛的定义如下：

> API网关是一个服务器，是系统的唯一入口。从面向对象设计的角度看，它与外观模式类似。API网关封装了系统内部架构，为每个客户端提供一个定制的API。
API网关方式的核心要点是，所有的客户端和消费端都通过统一的网关接入微服务，在网关层处理所有的非业务功能。通常，网关也是提供REST/HTTP的访问API。服务端通过API-GW注册和管理服务。

从定义中可以归纳出一下几个核心点：

1. 服务调用的统一入口
2. AuthN（Authentication is establishing the your identity.）
3. AuthZ （Authorization is establishing your privileges.）
4. 监控（请求延迟、异常数、审计日志、访问日志）
5. 高可用
6. 白名单、黑名单
7. 限流
8. 熔断
9. 服务发现
10. 协议支持 （协议转换）
11. …

# 思维导图

![](/images/api-gateway-design/API-Gateway.png)

介绍几个概念：
1. 先说RC（Replication Controller）是什么？

	RC保证在同一时间能够运行指定数量的Pod副本，保证Pod总是可用。如果实际Pod数量比指定的多就结束掉多余的，如果实际数量比指定的少就启动缺少的。当Pod失败、被删除或被终结时RC会自动创建新的Pod来保证副本数量。所以即使只有一个Pod也应该使用RC来进行管理。

2. HPA
	Horizontal Pod Autoscaling，简称HPA，是Kubernetes中实现POD水平自动伸缩的功能。

	HPA是kubernetes里面pod弹性伸缩的实现,它能根据设置的监控阀值进行pod的弹性扩缩容，目前默认HPA只能支持cpu和内存的阀值检测扩缩容，但也可以通过custom metric api 调用prometheus实现自定义metric 来更加灵活的监控指标实现弹性伸缩。

# 取舍

取舍也就是如何构建适合自己的API Gateway？

其实，这个问题也可以拓展为如何开发适应自己业务的某系统，个人感觉应该从以下几点考虑：

* 自己的业务系统需要什么样的功能？
* 业界中该类系统都是如何实现的？
* 自己的基础设施情况（主要是PaaS及中间件）如何？

综合1、2考虑，在满足业务需求的前提下，往远了考虑，往简单了实现（既满足目前的功能，又方便以后拓展）。
回到API Gateway这个话题，那就需要考虑一下，自己的业务系统是否需要以上列出的所有功能点？如果不是或者目前不是，那我应该先实现哪一部分？

其中，作为一个Gateway，以下几点应该是基础功能：

* 服务调用的统一入口
* AuthN（Authentication is establishing the your identity.）
* AuthZ （Authorization is establishing your privileges.）
* 监控（请求延迟、异常数、审计日志、访问日志）
* 高可用

剩下的功能实现就要看业务需要及时间了。
如果系统本身的访问量不大，那么限流、熔断是否就可以先不实现？

## 为什么需要关注自己的基础设施情况（主要是PaaS及中间件）？

比如基础设施中已提供Kubernetes集群服务，那么毫无疑问的高可用方案，应该选择RC方案。如果没有Kubernetes集群服务，那么高可用就需要考虑别的方案了。

> 可以发现其实手撕一个api网关，也不是多么难的事情，其中很多点，底层包都已经提供了支持，只是需要支持的功能比较多。