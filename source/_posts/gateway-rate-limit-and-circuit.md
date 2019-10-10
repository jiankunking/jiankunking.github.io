---
title: 网关限流与熔断
abbrlink: 57686
date: 2019-09-26 14:17:01
categories:
  - Architecture
tags:
  - Architecture
  - Gateway
  - Rate
  - Limit
  - Circuit
  - 原创
  - Hide
---

> 网关限流、熔断实现分析

<!-- more -->

# 一、限流
常见的限流算法主要有：
* 计数器算法
* 令牌桶算法
* 漏桶算法

## 计数器算法
该算法在实际中使用较少，其实现简单粗暴：
一般我们会限制一秒钟的能够通过的请求数，比如限流qps为100，算法的实现思路就是从第一个请求进来开始计时，在接下去的1s内，每来一个请求，就把计数加1，如果累加的数字达到了100，那么后续的请求就会被全部拒绝。等到1s结束后，把计数恢复成0，重新开始计数。

## 漏桶算法
漏桶(Leaky Bucket)算法思路很简单,水(请求)先进入到漏桶里,漏桶以一定的速度出水(接口有响应速率),当水流入速度过大会直接溢出(访问频率超过接口响应速率),然后就拒绝请求,可以看出漏桶算法能强行限制数据的传输速率。

因为漏桶的漏出速率是固定的参数,所以,即使网络中不存在资源冲突(没有发生拥塞),漏桶算法也不能使流突发(burst)到端口速率.因此,漏桶算法对于存在突发特性的流量来说缺乏效率。

## 令牌桶算法
令牌桶算法是比较常见的限流算法之一，在令牌桶算法中，存在一个桶，用来存放固定数量的令牌。算法中存在一种机制，以一定的速率往桶中放令牌。每次请求调用需要先获取令牌，只有拿到令牌，才有机会继续执行，否则选择选择等待可用的令牌、或者直接拒绝。

对于令牌桶中令牌的产生一般有两种做法：

* 一种解法是，开启一个定时任务，由定时任务持续生成令牌。这样的问题在于会极大的消耗系统资源，如，某接口需要分别对每个用户做访问频率限制，假设系统中存在10W用户，则至多需要开启10W个定时任务来维持每个桶中的令牌数，这样的开销是巨大的。
* 另一种解法则是延迟计算，如上resync函数。该函数会在每次获取令牌之前调用，其实现思路为，若当前时间晚于nextFreeTicketMicros，则计算该段时间内可以生成多少令牌，将生成的令牌加入令牌桶中并更新数据。这样一来，只需要在获取令牌时计算一次即可。

> Guava RateLimiter与Golang rate.Limiter 都是采用方式二

### 解析Golang rate
```
// Limit 定义了事件的最大频率。
// Limit 被表示为每秒事件的数量。
// 值为0的Limit不允许任何事件。
type Limit float64

// ewLimiter返回一个新的Limiter实例，
// 件发生率为r，并允许至多b个令牌爆发。
func NewLimiter(r Limit, b int) *Limiter

// Every将事件之间的最小时间间隔转换为Limit。
func Every(interval time.Duration) Limit

// Wait 是 WaitN(ctx, 1)的简写。
func (lim *Limiter) Wait(ctx context.Context)

// WaitN 会发生阻塞直到 lim 允许的 n 个事件执行。
// 它返回一个 error 如果 n 超过了 Limiter的桶大小,
// Context会被取消, 或等待的时间超过了 Context 的 Deadline。
func (lim *Limiter) WaitN(ctx context.Context, n int) (err error)

// reserveN is a helper method for AllowN, ReserveN, and WaitN.
// maxFutureReserve specifies the maximum reservation wait duration allowed.
// reserveN returns Reservation, not *Reservation, to avoid allocation in AllowN and WaitN.
func (lim *Limiter) reserveN(now time.Time, n int, maxFutureReserve time.Duration) Reservation {
	lim.mu.Lock()

	if lim.limit == Inf {
		lim.mu.Unlock()
		return Reservation{
			ok:        true,
			lim:       lim,
			tokens:    n,
			timeToAct: now,
		}
	}

	now, last, tokens := lim.advance(now)

	// Calculate the remaining number of tokens resulting from the request.
	tokens -= float64(n)

	// Calculate the wait duration
	var waitDuration time.Duration
	if tokens < 0 {
		waitDuration = lim.limit.durationFromTokens(-tokens)
	}

	// Decide result
	ok := n <= lim.burst && waitDuration <= maxFutureReserve

	// Prepare reservation
	r := Reservation{
		ok:    ok,
		lim:   lim,
		limit: lim.limit,
	}
	if ok {
		r.tokens = n
		r.timeToAct = now.Add(waitDuration)
	}

	// Update state
	if ok {
		lim.last = now
		lim.tokens = tokens
		lim.lastEvent = r.timeToAct
	} else {
		lim.last = last
	}

	lim.mu.Unlock()
	return r
}

// advance calculates and returns an updated state for lim resulting from the passage of time.
// lim is not changed.
func (lim *Limiter) advance(now time.Time) (newNow time.Time, newLast time.Time, newTokens float64) {
	last := lim.last
	if now.Before(last) {
		last = now
	}

	// Avoid making delta overflow below when last is very old.
	maxElapsed := lim.limit.durationFromTokens(float64(lim.burst) - lim.tokens)
	elapsed := now.Sub(last)
	if elapsed > maxElapsed {
		elapsed = maxElapsed
	}

	// Calculate the new number of tokens, due to time that passed.
	delta := lim.limit.tokensFromDuration(elapsed)
	tokens := lim.tokens + delta
	if burst := float64(lim.burst); tokens > burst {
		tokens = burst
	}

	return now, last, tokens
}

// durationFromTokens is a unit conversion function from the number of tokens to the duration
// of time it takes to accumulate them at a rate of limit tokens per second.
func (limit Limit) durationFromTokens(tokens float64) time.Duration {
	seconds := tokens / float64(limit)
	return time.Nanosecond * time.Duration(1e9*seconds)
}

// tokensFromDuration is a unit conversion function from a time duration to the number of tokens
// which could be accumulated during that duration at a rate of limit tokens per second.
func (limit Limit) tokensFromDuration(d time.Duration) float64 {
	return d.Seconds() * float64(limit)
}
```

# 熔断
