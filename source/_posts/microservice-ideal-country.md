---
title: 微服务理想国
categories:
  - Architecture
tags:
  - Architecture
  - Microservice
  - 原创
abbrlink: 60483
date: 2019-10-23 08:53:40
---

> 微服务的现在、未来

<!-- more -->



* [Jenkins](https://jenkins.io/zh/) CI&CD
* [Kubernetes](https://kubernetes.io/) 调度、负载、高可用
	* 自动化容器的部署和复制
	* 随时扩展或收缩容器规模
	* 将容器组织成组，并且提供容器间的负载均衡
	* 很容易地升级应用程序容器的新版本
	* 提供容器弹性，如果容器失效就替换它，等等...
* [Istio](https://istio.io/) 监控、熔断、限流
	* 流量管理（Connect）：智能控制服务之间的调用流量，能够实现灰度升级、AB 测试和红黑部署等功能
	* 安全加固（Secure）：自动为服务之间的调用提供认证、授权和加密。
	* 控制（Control）：应用用户定义的 policy，保证资源在消费者中公平分配。
	* 观察（Observe）：查看服务运行期间的各种数据，比如日志、监控和 tracing，了解服务的运行情况。
* [SkyWalking](http://skywalking.apache.org/zh/) 监控
	* 分布式系统的应用程序性能监视工具
* 收集Kubernetes Pod日志到[ElasticSearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)进行日志检索
* 通过[Prometheus](https://prometheus.io/)监控机器、实例的运行情况
* 通过[Alertmanager](https://prometheus.io/docs/alerting/alertmanager/)将监控信息进行告警

其中最重要的Kubernetes服务，[腾讯云](https://cloud.tencent.com/product/tke)、[阿里云](https://www.aliyun.com/product/kubernetes?spm=5176.13342246.1kquk9v2l.2.42243ccbAwomc4&aly_as=i7TpRzFx)都已经支持。

微服务的未来应该是开发人员只需要写Sping Boot或者Gin/Iris应用就可以了，剩下的就交给Kubernetes。