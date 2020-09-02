---
title: >-
  Elasticsearch java RestClient SocketTimeoutException: 12,000 milliseconds
  timeout on connection http-outgoing-12
categories:
  - ElasticSearch
tags:
  - ElasticSearch
  - RestClient
  - java
abbrlink: 40024
date: 2020-08-25 12:05:43
---


> java.net.SocketTimeoutException: 12,000 milliseconds timeout on connection http-outgoing-12

<!-- more -->

在网上交流的时候，发现很多朋友在用es client查询的时候，会出现平时很快，但会间歇性出现超时（比如一段时间没有请求，之后突然请求的情况），而且超时时间都是一样的。

后端出现的异常有可能有是这样的：

```
2020-01-20 17:48:12.330 [http-nio-8080-exec-10] INFO  c.j.logsearch.aspect.ServiceTimeConsumeAspect - Service：ESClients.getInstance(..)，cost：0ms
java.net.SocketTimeoutException: 12,000 milliseconds timeout on connection http-outgoing-12 [ACTIVE]
        at org.elasticsearch.client.RestClient$SyncResponseListener.get(RestClient.java:944)
        at org.elasticsearch.client.RestClient.performRequest(RestClient.java:233)
        at com.jiankunking.logsearch.util.ESQueryUtils.performRequest(ESQueryUtils.java:91)
        at com.jiankunking.logsearch.util.ESQueryUtils.performRequest(ESQueryUtils.java:70)
        at com.jiankunking.logsearch.util.ESQueryUtils$$FastClassBySpringCGLIB$$233350d5.invoke(<generated>)
        at org.springframework.cglib.proxy.MethodProxy.invoke(MethodProxy.java:218)
        at org.springframework.aop.framework.CglibAopProxy$CglibMethodInvocation.invokeJoinpoint(CglibAopProxy.java:769)
        at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:163)
        at org.springframework.aop.framework.CglibAopProxy$CglibMethodInvocation.proceed(CglibAopProxy.java:747)
        at org.springframework.aop.aspectj.MethodInvocationProceedingJoinPoint.proceed(MethodInvocationProceedingJoinPoint.java:88)
        at com.jiankunking.logsearch.aspect.ServiceTimeConsumeAspect.doAround(ServiceTimeConsumeAspect.java:28)
        at jdk.internal.reflect.GeneratedMethodAccessor79.invoke(Unknown Source)
        at java.base/jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
        at java.base/java.lang.reflect.Method.invoke(Method.java:567)
        at org.springframework.aop.aspectj.AbstractAspectJAdvice.invokeAdviceMethodWithGivenArgs(AbstractAspectJAdvice.java:644)
        at org.springframework.aop.aspectj.AbstractAspectJAdvice.invokeAdviceMethod(AbstractAspectJAdvice.java:633)
        at org.springframework.aop.aspectj.AspectJAroundAdvice.invoke(AspectJAroundAdvice.java:70)
        at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:175)
        at org.springframework.aop.framework.CglibAopProxy$CglibMethodInvocation.proceed(CglibAopProxy.java:747)
        at org.springframework.aop.interceptor.ExposeInvocationInterceptor.invoke(ExposeInvocationInterceptor.java:93)
        at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:186)
        at org.springframework.aop.framework.CglibAopProxy$CglibMethodInvocation.proceed(CglibAopProxy.java:747)
        at org.springframework.aop.framework.CglibAopProxy$DynamicAdvisedInterceptor.intercept(CglibAopProxy.java:689)
        at com.jiankunking.logsearch.util.ESQueryUtils$$EnhancerBySpringCGLIB$$e5bf21cb.performRequest(<generated>)
        at com.jiankunking.logsearch.service.caicloud.LogBusinessService.getApps(LogBusinessService.java:111)
        at com.jiankunking.logsearch.controller.caicloud.LogBusinessController.getAppNames(LogBusinessController.java:78)
        at com.jiankunking.logsearch.controller.caicloud.LogBusinessController$$FastClassBySpringCGLIB$$6c6f7900.invoke(<generated>)
        at org.springframework.cglib.proxy.MethodProxy.invoke(MethodProxy.java:218)
        at org.springframework.aop.framework.CglibAopProxy$CglibMethodInvocation.invokeJoinpoint(CglibAopProxy.java:769)
        at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:163)
        at org.springframework.aop.framework.CglibAopProxy$CglibMethodInvocation.proceed(CglibAopProxy.java:747)
        at org.springframework.aop.aspectj.MethodInvocationProceedingJoinPoint.proceed(MethodInvocationProceedingJoinPoint.java:88)
        at com.jiankunking.logsearch.aspect.ControllerTimeConsumeAspect.doAround(ControllerTimeConsumeAspect.java:34)
        at jdk.internal.reflect.GeneratedMethodAccessor76.invoke(Unknown Source)
        at java.base/jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
        at java.base/java.lang.reflect.Method.invoke(Method.java:567)
        at org.springframework.aop.aspectj.AbstractAspectJAdvice.invokeAdviceMethodWithGivenArgs(AbstractAspectJAdvice.java:644)
        at org.springframework.aop.aspectj.AbstractAspectJAdvice.invokeAdviceMethod(AbstractAspectJAdvice.java:633)
        at org.springframework.aop.aspectj.AspectJAroundAdvice.invoke(AspectJAroundAdvice.java:70)
        at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:175)
        at org.springframework.aop.framework.CglibAopProxy$CglibMethodInvocation.proceed(CglibAopProxy.java:747)
        at org.springframework.aop.interceptor.ExposeInvocationInterceptor.invoke(ExposeInvocationInterceptor.java:93)
        at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:186)
        at org.springframework.aop.framework.CglibAopProxy$CglibMethodInvocation.proceed(CglibAopProxy.java:747)
        at org.springframework.aop.framework.CglibAopProxy$DynamicAdvisedInterceptor.intercept(CglibAopProxy.java:689)
        at com.jiankunking.logsearch.controller.caicloud.LogBusinessController$$EnhancerBySpringCGLIB$$ff6c8d2c.getAppNames(<generated>)
        at jdk.internal.reflect.GeneratedMethodAccessor125.invoke(Unknown Source)
        at java.base/jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
        at java.base/java.lang.reflect.Method.invoke(Method.java:567)
        at org.springframework.web.method.support.InvocableHandlerMethod.doInvoke(InvocableHandlerMethod.java:190)
        at org.springframework.web.method.support.InvocableHandlerMethod.invokeForRequest(InvocableHandlerMethod.java:138)
        at org.springframework.web.servlet.mvc.method.annotation.ServletInvocableHandlerMethod.invokeAndHandle(ServletInvocableHandlerMethod.java:106)
        at org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter.invokeHandlerMethod(RequestMappingHandlerAdapter.java:888)
        at org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter.handleInternal(RequestMappingHandlerAdapter.java:793)
        at org.springframework.web.servlet.mvc.method.AbstractHandlerMethodAdapter.handle(AbstractHandlerMethodAdapter.java:87)
        at org.springframework.web.servlet.DispatcherServlet.doDispatch(DispatcherServlet.java:1040)
        at org.springframework.web.servlet.DispatcherServlet.doService(DispatcherServlet.java:943)
        at org.springframework.web.servlet.FrameworkServlet.processRequest(FrameworkServlet.java:1006)
        at org.springframework.web.servlet.FrameworkServlet.doGet(FrameworkServlet.java:898)
        at javax.servlet.http.HttpServlet.service(HttpServlet.java:634)
        at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:883)
        at javax.servlet.http.HttpServlet.service(HttpServlet.java:741)
        at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:231)
        at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)
        at org.apache.tomcat.websocket.server.WsFilter.doFilter(WsFilter.java:53)
        at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:193)
        at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)
        at org.springframework.web.filter.RequestContextFilter.doFilterInternal(RequestContextFilter.java:100)
        at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:119)
        at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:193)
        at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)
        at org.springframework.web.filter.FormContentFilter.doFilterInternal(FormContentFilter.java:93)
        at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:119)
        at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:193)
        at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)
        at org.springframework.web.filter.CharacterEncodingFilter.doFilterInternal(CharacterEncodingFilter.java:201)
        at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:119)
        at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:193)
        at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)
        at org.apache.catalina.core.StandardWrapperValve.invoke(StandardWrapperValve.java:202)
        at org.apache.catalina.core.StandardContextValve.invoke(StandardContextValve.java:96)
        at org.apache.catalina.authenticator.AuthenticatorBase.invoke(AuthenticatorBase.java:526)
        at org.apache.catalina.core.StandardHostValve.invoke(StandardHostValve.java:139)
        at org.apache.catalina.valves.ErrorReportValve.invoke(ErrorReportValve.java:92)
        at org.apache.catalina.core.StandardEngineValve.invoke(StandardEngineValve.java:74)
        at org.apache.catalina.connector.CoyoteAdapter.service(CoyoteAdapter.java:343)
        at org.apache.coyote.http11.Http11Processor.service(Http11Processor.java:367)
```

es client请求代码如下(jdk 11)：

```
public String performRequest(String cluster, String project, String method, String endpoint, String query, String keyword)
            throws IOException {
        Response response;
        if (StringUtils.isEmpty(method)) {
            method = HttpMethod.GET.name();
        }
        query = clearType(query);
        log.info(query);
        Request request = new Request(
                method,
                endpoint);
        request.setEntity(new NStringEntity(
                query,
                ContentType.APPLICATION_JSON));
        RestClient restClient = null;
        try {
            restClient = esClients.getInstance(project, cluster);
            response = restClient.performRequest(request);
        } catch (IOException ex) {
            if (ex.getMessage().contains("400 Bad Request") && ex.getMessage().contains("parse_exception")) {
                if (StringUtils.isNotEmpty(keyword)) {
                    throw new ESParseException("elasticsearch无法解析:" + keyword + " 请参考query_string语法");
                }
                throw new ESParseException(ex.getMessage());
            }
            ex.printStackTrace();
            throw ex;
        } finally {
        }
        String result = EntityUtils.toString(response.getEntity());
        return result;
    }

private HashMap<String, RestClient> clients = new HashMap<>();
    @Autowired
    private ConfigService configService;
    public RestClient getInstance(String project, String cluster) {
        if (clients.containsKey(cluster)) {
            return clients.get(cluster);
        }
        String esAddress = "";
        List<ESCluster> esClusters = configService.getESClusters(project);
        for (ESCluster esCluster : esClusters) {
            if (esCluster.getName().equals(cluster)) {
                esAddress = esCluster.getAddress();
                break;
            }
        }
        if (clients.containsKey(cluster)) {
            return clients.get(cluster);
        }
        synchronized (clients) {
            if (clients.containsKey(cluster)) {
                return clients.get(cluster);
            }
            RestClient restClient = getNewRestClient(esAddress);
            clients.put(cluster, restClient);
            return restClient;
        }
    }

    private RestClient getNewRestClient(String esAddress) {
        RestClient restClient = RestClient
                .builder(EnvionmentVariables.getHttpHostArray(esAddress))
                .setRequestConfigCallback(requestConfigBuilder ->
                        requestConfigBuilder
                                .setConnectTimeout(1 * 1000)
                                //.setConnectionRequestTimeout(0)
                                .setSocketTimeout(12 * 1000))
                .build();
        return restClient;
    }
```

pom文件如下：
```
         <dependency>
            <groupId>org.elasticsearch.client</groupId>
            <artifactId>elasticsearch-rest-high-level-client</artifactId>
            <version>7.4.0</version>
        </dependency>
        <dependency>
            <groupId>org.elasticsearch</groupId>
            <artifactId>elasticsearch</artifactId>
            <version>7.4.0</version>
        </dependency>
```

其实原因很简单就是es client持有的http连接断开了(es用的http client默认keepalive的时间是永远)，当这时有请求过去，请求会一直没有返回，从而触发了超时。

知道了原因，问题就好解决了

```
    // https://www.elastic.co/guide/en/elasticsearch/client/java-rest/current/_timeouts.html
    // setConnectTimeout 默认是 1秒 setSocketTimeout 默认30秒
    private RestClient getNewRestClient(String esAddress) {
        RestClient restClient = RestClient
                .builder(EnvionmentVariables.getHttpHostArray(esAddress))
                .setHttpClientConfigCallback(httpClientBuilder -> httpClientBuilder
                        .setKeepAliveStrategy(getConnectionKeepAliveStrategy())
                        .setMaxConnPerRoute(10))
                .setRequestConfigCallback(requestConfigBuilder ->
                        requestConfigBuilder
                                .setConnectTimeout(1 * 1000)
                                .setConnectionRequestTimeout(2 * 1000)
                                .setSocketTimeout(12 * 1000))
                .build();
        return restClient;
    }

    private ConnectionKeepAliveStrategy getConnectionKeepAliveStrategy() {
        return (response, context) -> {
            //HeaderElementIterator it = new BasicHeaderElementIterator
            //        (response.headerIterator(HTTP.CONN_KEEP_ALIVE));
            //while (it.hasNext()) {
            //    HeaderElement he = it.nextElement();
            //    String param = he.getName();
            //    String value = he.getValue();
            //    if (value != null && param.equalsIgnoreCase
            //            ("timeout")) {
            //        return Long.parseLong(value) * 1000;
            //    }
            //}
            //return 60 * 1000;//如果没有约定，则默认定义时长为60s
            return 2 * 60 * 1000;
        };
    }
```