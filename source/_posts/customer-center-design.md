---
title: 客户中心架构设计
categories:
  - Architecture
tags:
  - Architecture
  - OAuth
  - Login
  - 原创
abbrlink: 42705
date: 2019-09-29 09:05:32
---

> 客户中心梳理

<!-- more -->

# 现状
客户数据分散在多个系统之间，而这多个系统中又有三个最为主要的系统：365、Y、E。
* 365的客户账号登陆用的是CAS
* E、Y系统定时同步CAS数据，自己维护了一份数据

客户中心的目的是实现客户维度的账户数据统一，以替换掉目前客户多套账户数据，系统之间通过数据表同步实现账户数据同步的现状。

从客户中心的名称中就可以知道，该部分对应的主体是客户，而非平常To C的用户。

> 这里的客户账号主要是公司的经销商、各级门店的员工。

客户与To C用户两者之间最大的区别在于：账号注册、账户管理的不同。客户账号的注册主要是通过分配，而非自己注册。

# 服务层面

服务主要拆分为以下几部分：
* OpenApi：客户中心网关、OAuth部分
* 账户服务：与账户相关的服务
* 短信服务：
	* 将集团Web Services短信服务转换成HTTP REST服务（下面简称SMS服务）
	* Nginx 代理（组内服务发送短信是调用SMS服务，SMS服务再通过Nginx代理调用集团短信服务）
* 后台管理服务：公告通知

更新细致的描述如下图：
![服务架构图](/images/customer-center-design/客户中心服务架构.png)

# OAuth

<!-- > 本文OAuth 2.0的授权类型为授权码（OAuth 2.0 Grant Types：Authorization Code） -->

OAuth部分主要是熟悉下面这个图，只是有时扮演OAuth Server、有时扮演OAuth Client而已。

> 比如微信登陆，OpenApi就是微信OAuth Server的client。

![Authorization Code](/images/customer-center-design/oauth_web_server_flow.png)

OAuth涉及的点有：
* Authorization Code：有效期内只能使用一次
* Access Token是采用JWT还是一个随机字符串？
	* JWT不依赖存储，但一旦颁发无法取消其有效性
	* 随机字符串一般都是一个字符ID，具体的数据是存储在Redis中
* OAuth 框架选择
	* Java
		* [Spring Security](https://github.com/spring-projects/spring-security)
		* [Shiro](http://shiro.apache.org)
	* Golang
		* [OpenShift OSIN](https://github.com/openshift/osin)
		* ......

## OAuth Server
OAuth Server需要做以下事情：
* /authorize接口，负责校验是否登录（比如校验Header中bear令牌）及登陆账号是否需要别的操作（比如账号合并时的登陆账号id是一个临时id，这时需要强制跳转到账号合并、选择的页面，通过用户选择将多个账号合并为一个账号）
  * 已登录，设置Cookie，跳转请求authorize接口参数中的redirect_uri并携带code及state
  * 未登录，跳转鉴权中心的登陆页
    * 用户在鉴权中心的登录页输入用户名密码,校验通过，跳转请求authorize接口参数中的redirect_uri并携带code及state
* /token接口，负责校验code，颁发access_token及refresh_token
* /refresh_token接口，负责通过refresh_token刷新access_token
* /logout接口，清理Cookie

> code分为两种情况：一种是通过浏览器传递给接入方后端；一种是通过移动端获取到code后，通过调用接入方后端接口传递给接入方后端。
> redirect_uri、post_logout_redirect_uri 需要校验是否与配置的一样。

## OAuth Client
OAuth Client对接OAuth Server需要做以下事情：
* 拦截请求，校验是否已登录
  * 已登录，放行
  * 未登录，跳转OAuth Server的/authorize接口接口
    * 根据code获取用户信息，设置Cookie、颁发自己的token（access_token、refresh_token）
* /token接口，调用鉴权中心的密码模式校验密码，获取用户信息，颁发access_token、refresh_token
* /refresh_token接口，负责通过refresh_token刷新access_token
* 对于Web端而言，打开首页的时候，先调用me或者profile等接口获取用户信息
  * 如果能获取到，则意味着登录成功
  * 如果获取不到，则前端调用后端/login接口
    * 后端/login接口（接口需要传递参数redirect_uri）校验是否登录
      * 未登录，跳转鉴权中心的登陆页
      * 已登录，跳转参数redirect_uri
* 对于移动端而言，调用/token接口
* /logout接口，清理自己设置的Cookie，再调用鉴权中心的登出接口
* /callback接口，供OAuth Server回调


# 实现

## 一期

从服务架构图中可以看出，业务逻辑最复杂的是账户服务。

账户服务的复杂的地方主要在：
* 数据清理逻辑服务（多系统账户合并）
* 多系统迭代替换时间不一致

### 账户合并
下面简单说一下多系统账户合并的逻辑：
* 多账户合并在账户首次登陆的时候进行（账户登录，需要区分出是否是首次登陆）
* 检验账户是否需要合并的逻辑是：当前登陆账户名、手机号在多个系统之间重复
	* 账户名登陆不仅仅需要校验账户名，还需要校验账户名对应的手机号
	* 手机号登陆不仅仅需要校验手机号，还需要校验手机号对应的账户名
* 重复账户数据选择、修改、补充合并

> 这部分开发的时候，有个坑就是业务人员本身不熟悉自己的业务，合并的细节基本都是开发人员通过数据库数据自己梳理，再与业务人员确认。

### 切换

系统很多，但登陆用到的主要有两部分：
* CAS登陆（大部分系统客户用的都是CAS登陆）
* Y、E系统，该系统自己维护了一份客户账号数据

初始的计划是在一期将所有系统客户登陆统一替换掉，后来由于Y、E系统自身业务优先级的原因，无法参与这次切换，又将替换范围调整为替换CAS。

业务范围调整造成了两个影响：
* 不需要多系统账号合并
* 业务范围调整的时候，账户服务根据之前的逻辑已经开发完成

这就引入了另一个问题，虽然最复杂的多系统账户合并不要了，但很多的功能点在CAS替换与多系统统一替换中基本都是一样的（由于需要合并多个系统间的账户数据，而多个系统目前的账户数据又是千奇百怪，所以根据账户数据来源的不同，分别存储在不同的表中，所以对于账户数据的操作这部分需要再次开发）。简单的CTRL+C CTRL+V再复制一份，再在公共部分加一些if else？还是通过别的方式实现？

主要的重复点在：
* 账户绑定手机号
* 账户登录
* 账户密码通过手机号重置
* 发送短信验证码

基本上都是输入一样，但最终处理的时候校验、操作的表都有所不同，这个可以通过命令模式来处理。

将统一账户的处理逻辑、CAS账户的处理逻辑分别放置到Receiver中，通过不同的Command来起到隔离而又不会重复代码的作用。 

> 命令模式：将一个请求封装为一个对象，使发出请求的责任和执行请求的责任分割开。这样两者之间通过命令对象进行沟通，这样方便将命令对象进行储存、传递、调用、增加与管理。

## 二期

对接之前未对接的Y、E系统，这时E系统已经合并到Y系统了，所以这时只需要对接Y系统就好。

对接Y系统主要是根据各种业务规则进行账号清洗、合并。

![数据清洗](/images/customer-center-design/数据清洗.png)

# 其它
## 短信发送
1、线程池发送（以防短信服务不稳，造成OOM,设定BlockingQueue长度）
2、抽象短信服务基类BaseVerificationCodeSender，因为有可能对接多个短信服务，但线程池及需要做的事是一样的。

![具体的实现类](/images/customer-center-design/CocSmsVerificationCodeSender.png)

## 验证码校验
由于集团短信服务不太稳定，所以每类（登陆、忘记密码、修改手机号等）验证码缓存最多三个未过期的短信验证码。

> 只要验证了一个，该手机号缓存某类的验证码，均失效。

## 其它
略

# 附录

``` text
     +--------+                               +---------------+
     |        |--(A)- Authorization Request ->|   Resource    |
     |        |                               |     Owner     |
     |        |<-(B)-- Authorization Grant ---|               |
     |        |                               +---------------+
     |        |
     |        |                               +---------------+
     |        |--(C)-- Authorization Grant -->| Authorization |
     | Client |                               |     Server    |
     |        |<-(D)----- Access Token -------|               |
     |        |                               +---------------+
     |        |
     |        |                               +---------------+
     |        |--(E)----- Access Token ------>|    Resource   |
     |        |                               |     Server    |
     |        |<-(F)--- Protected Resource ---|               |
     +--------+                               +---------------+
```



