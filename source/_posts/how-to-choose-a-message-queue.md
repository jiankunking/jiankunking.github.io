---
layout: w
title: 该如何选择消息队列？
date: 2020-06-12 17:55:29
categories:
  - MQ
tags:
  - MQ
  - 读书笔记
  - 原创
---

消息队列高手课 笔记

作者：李玥

<!-- more -->

在了解了上面这些开源消息队列各自的特点和优劣势后,我相信你对于消息队列的选择已经可以做到心中有数了。我也总结了几条选择的建议供你参考。

* 如果说,消息队列并不是你将要构建系统的主角之一,你对消息队列功能和性能都没有很高的要求,只需要一个开箱即用易于维护的产品,我建议你使用RabbitMQ。

* 如果你的系统使用消息队列主要场景是处理在线业务,比如在交易系统中用消息队列传递订单那 RocketMQ的低延迟和金融级的稳定性是你需要的。

* 如果你需要处理海量的消息,像收集日志、监控信息或是前端的埋点这类数据,或是你的应用场景大量使用了大数据、流计算相关的开源产品,那 Kafka是最适合你的消息队列。

如果我说的这些场景和你的场景都不符合,你看了我之前介绍的这些消息队列的特点后,还是不知道如何选择,那就选你最熟悉的吧,毕竟这些产品都能满足大多数应用场景,使用熟悉的产品还可以快速上手不是?

<a href="/attachments/消息队列高手课/02该如何选择消息队列.pdf" target="_blank">该如何选择消息队列？</a>