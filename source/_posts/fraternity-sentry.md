---
title: 友爱的Sentry
categories:
  - Sentry
tags:
  - Sentry
  - Redis
  - OOM
  - 原创
abbrlink: 16311
date: 2021-11-17 18:19:49
---

最近Sentry的Redis一直报内存占用高，看Sentry日志能看到:
```
OOM command not allowed when used memory > 'maxmemory'
```

然后上网看了一下，发现了几个有意思的回复:

![](/images/fraternity-sentry/1.png)
![](/images/fraternity-sentry/2.png)


感觉Sentry社区很“友爱”，就是硬钢。

那么，Sentry Redis中存储的都是什么内容呢？
![](/images/fraternity-sentry/3.png)

截图来源：
https://github.com/getsentry/sentry/issues/1183
https://github.com/getsentry/sentry/issues/13785
https://forum.sentry.io/t/redis-hitting-oom/2810