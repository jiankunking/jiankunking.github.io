---
title: PaaS平台架构设计
abbrlink: 50317
date: 2019-01-10 14:18:30
categories:
  - Architecture
tags:
  - Architecture
  - PaaS
  - 原创
---

> 构建一个PaaS平台（原生Docker已逐步下线，目前主要使用[Kubernetes](https://www.jiankunking.com/docking-container-cloud.html)）

<!-- more -->

# 背景

目前在用的PaaS平台是之前购买的一个商业产品，但没有源码，运维期也早就结束了，所以在后期使用过程中会遇到一些各种各样的问题，对于使用、运维都造成一定的困扰。

老PaaS的架构及基本功能如下：
![](/images/pass-platform-design/老PaaS架构.png)

# 重构

为什么选择重构PaaS平台而不是全部迁移kubernates集群？
kubernates集群的确提供了很多优秀的特性，比如：RC、滚动更新或回滚、资源监控和日志记录、负载均衡等等。

但在目前我们这边的环境来看，迁移kubernates集群有如下几个问题：

* 无法无感知迁移，即迁移到kubernates集群的过程中及迁移到kubernates集群后，不增加用户的使用、学习成本，但应用引入kubernates集群之后，很难保证这一点。因为我们这边的用户大多是我们公司的供应商，供应商其实不太关心，你平台所提供的各种新特性、功能，更不想因为这些新特性、功能增加他们的使用、学习成本。
* 我们这边很多项目本身是有硬负载的，比如F5，所以kubernates提供的负载均衡功能，也就显的不那么重要。
* 日志部分，我们已经打通各个平台的日志、监控，不再需其他的组件。
* 滚动更新或回滚，老PaaS平台木有，重构后新版中准备加入（二期）。
* RC类似功能，目前不打算支持。

## 架构及用到组件梳理
![](/images/pass-platform-design/新PaaS架构及组件.png)

## 新PaaS功能点梳理
![](/images/pass-platform-design/PaaS功能点.png)

# 迁移

通过无缝迁移，在用户无感知的情况下实现迁移。

> 为什么要做到无感知迁移？
老PaaS中目前的项目数量是：193个，应用数量是：673个
总实例数：1485，其中生产环境的实例数：894
如果这些项目、应用，因为你的重构都需要改动的话，那么推广难度是很大的，所以需要尽量做到，对于用户来说无感知迁移。

以下迁移部分，都需要在新PaaS上线前完成并在上线一段时间准实时同步过来。
![](/images/pass-platform-design/老PaaS迁移.png)