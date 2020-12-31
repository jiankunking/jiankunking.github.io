---
title: 集成容器云
categories:
  - Kubernetes
tags:
  - Kubernetes
  - Architecture
  - Design
abbrlink: 19366
date: 2020-11-10 16:17:27
---

> 赋予[控制台](https://www.jiankunking.com/console-architecture.html)基于Kubernetes的一些能力

<!-- more -->

<!-- 背景：
公司内部购买了一套基于Kubernetes的容器管理平台（Compass），而我们内部开发者主要使用的[控制台](https://www.jiankunking.com/console-architecture.html),两者相互割裂，而且所以就把Compass中常用功能集成进来。图中虚线框是对接Compass的api，其余的都是对接的Kubernetes。

> 还有一个原因就是Compass的日志、打包、权限等功能做的不好，导致对于开发者来说，Compass的主要作用是用来部署。 -->

# 功能分析

图中虚线框是直接对接Compass的api，其余的都是对接的Kubernetes，但兼容了Compass。

![](/images/integrated-container-cloud/集成容器云.png)

# 集群规模

Kubernetes 集群数 10+，单集群机器30+。


