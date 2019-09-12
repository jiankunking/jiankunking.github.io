---
title: Arthas 学习笔记
categories:
  - JVM
tags:
  - JVM
  - Arthas
  - 原创
abbrlink: 37344
date: 2019-08-02 09:11:35
---

阿里 Arthas 学习笔记

<!-- more -->

# thread
查看当前线程信息，查看线程的堆栈。

参数说明：

| 参数名称 | 参数说明 | 示例 |
| ---- | ---------- | ---------- |
| id | 线程id |  |
| [n:] | 指定最忙的前N个线程并打印堆栈|  thread -n 3 |
| [b] | 找出当前阻塞其他线程的线程 | thread -b |
| [i <value>] | 指定cpu占比统计的采样间隔，单位为毫秒 |  |


> 注意， 目前只支持找出synchronized关键字阻塞住的线程， 如果是java.util.concurrent.Lock， 目前还不支持。

# jvm
查看当前JVM信息。

使用参考：
```
$ jvm
 RUNTIME                                                                                                                                                                                       
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 MACHINE-NAME                                           1@9db2689bb4d6                                                                                                                         
 JVM-START-TIME                                         2019-07-16 18:18:06                                                                                                                    
 MANAGEMENT-SPEC-VERSION                                2.0                                                                                                                                    
 SPEC-NAME                                              Java Virtual Machine Specification                                                                                                     
 SPEC-VENDOR                                            Oracle Corporation                                                                                                                     
 SPEC-VERSION                                           12                                                                                                                                     
 VM-NAME                                                OpenJDK 64-Bit Server VM                                                                                                               
 VM-VENDOR                                              Oracle Corporation                                                                                                                     
 VM-VERSION                                             12.0.1+12                                                                                                                              
 INPUT-ARGUMENTS                                        -XX:G1PeriodicGCInterval=120000                                                                                                        
                                                        -XX:G1PeriodicGCSystemLoadThreshold=0                                                                                                  
                                                                                                                                                                                               
 CLASS-PATH                                             application.jar                                                                                                                        
 BOOT-CLASS-PATH                                                                                                                                                                               
 LIBRARY-PATH                                           /usr/java/packages/lib:/usr/lib64:/lib64:/lib:/usr/lib                                                                                 
                                                                                                                                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CLASS-LOADING                                                                                                                                                                                 
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 LOADED-CLASS-COUNT                                     11046                                                                                                                                  
 TOTAL-LOADED-CLASS-COUNT                               11377                                                                                                                                  
 UNLOADED-CLASS-COUNT                                   331                                                                                                                                    
 IS-VERBOSE                                             false                                                                                                                                  
                                                                                                                                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 COMPILATION                                                                                                                                                                                   
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 NAME                                                   HotSpot 64-Bit Tiered Compilers                                                                                                        
 TOTAL-COMPILE-TIME                                     74558(ms)                                                                                                                              
                                                                                                                                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 GARBAGE-COLLECTORS                                                                                                                                                                            
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 G1 Young Generation                                    12027/52593(ms)                                                                                                                        
 [count/time]                                                                                                                                                                                  
 G1 Old Generation                                      0/0(ms)                                                                                                                                
 [count/time]                                                                                                                                                                                  
                                                                                                                                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 MEMORY-MANAGERS                                                                                                                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CodeCacheManager                                       CodeHeap 'non-nmethods'                                                                                                                
                                                        CodeHeap 'profiled nmethods'                                                                                                           
                                                        CodeHeap 'non-profiled nmethods'                                                                                                       
                                                                                                                                                                                               
 Metaspace Manager                                      Metaspace                                                                                                                              
                                                        Compressed Class Space                                                                                                                 
                                                                                                                                                                                               
 G1 Young Generation                                    G1 Eden Space                                                                                                                          
                                                        G1 Survivor Space                                                                                                                      
                                                        G1 Old Gen                                                                                                                             
                                                                                                                                                                                               
 G1 Old Generation                                      G1 Eden Space                                                                                                                          
                                                        G1 Survivor Space                                                                                                                      
                                                        G1 Old Gen                                                                                                                             
                                                                                                                                                                                               
                                                                                                                                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 MEMORY                                                                                                                                                                                        
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 HEAP-MEMORY-USAGE                                      184549376(176.00 MiB)/2113929216(1.97 GiB)/32178700288(29.97 GiB)/60812520(58.00 MiB)                                                  
 [committed/init/max/used]                                                                                                                                                                     
 NO-HEAP-MEMORY-USAGE                                   115539968(110.19 MiB)/7667712(7.31 MiB)/-1(-1 B)/108227072(103.21 MiB)                                                                 
 [committed/init/max/used]                                                                                                                                                                     
 PENDING-FINALIZE-COUNT                                 0                                                                                                                                      
                                                                                                                                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 OPERATING-SYSTEM                                                                                                                                                                              
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 OS                                                     Linux                                                                                                                                  
 ARCH                                                   amd64                                                                                                                                  
 PROCESSORS-COUNT                                       32                                                                                                                                     
 LOAD-AVERAGE                                           2.25                                                                                                                                   
 VERSION                                                3.10.0-514.26.2.el7.x86_64                                                                                                             
                                                                                                                                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 THREAD                                                                                                                                                                                        
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 COUNT                                                  1060                                                                                                                                   
 DAEMON-COUNT                                           25                                                                                                                                     
 PEAK-COUNT                                             1062                                                                                                                                   
 STARTED-COUNT                                          2463                                                                                                                                   
 DEADLOCK-COUNT                                         0                                                                                                                                      
                                                                                                                                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 FILE-DESCRIPTOR                                                                                                                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 MAX-FILE-DESCRIPTOR-COUNT                              -1                                                                                                                                     
 OPEN-FILE-DESCRIPTOR-COUNT                             -1                                                                                                                                     
Affect(row-cnt:0) cost in 14 ms.
```

# sysprop
查看当前JVM的系统属性(System Property)。

与jinfo 信息类似，不过sysprop提供修改单个属性值的功能。

查看单个属性，支持通过TAB键自动补全。

# sysenv
查看当前JVM的环境属性(System Environment Variables)。

查看单个属性，支持通过TAB键自动补全。

# sc、sm、jad

## sc
查看JVM已加载的类信息,可以package前缀模糊匹配。

## sm
查看已加载类的方法信息。
```
$ monitor com.jiankunking.logsearch.services.LogSearchService queryStringByKeyWord
Press Q or Ctrl+C to abort.
Affect(class-cnt:1 , method-cnt:1) cost in 90 ms.
 timestamp            class                                                method                total  success  fail  avg-rt(ms)  fail-rate                                                   
---------------------------------------------------------------------------------------------------------------------------------------------                                                  
 2019-08-02 10:37:50  com.jiankunking.logsearch.services.LogSearchService  queryStringByKeyWord  61     61       0     96.68       0.00%                                                       

 timestamp            class                                                method                total  success  fail  avg-rt(ms)  fail-rate                                                   
---------------------------------------------------------------------------------------------------------------------------------------------                                                  
 2019-08-02 10:38:50  com.jiankunking.logsearch.services.LogSearchService  queryStringByKeyWord  27     27       0     51.06       0.00%                                                       

 timestamp            class                                                method                total  success  fail  avg-rt(ms)  fail-rate                                                   
---------------------------------------------------------------------------------------------------------------------------------------------                                                  
 2019-08-02 10:39:50  com.jiankunking.logsearch.services.LogSearchService  queryStringByKeyWord  0      0        0     0.00        0.00%  
```

## jad
反编译指定已加载类的源码。

jad 命令将 JVM 中实际运行的 class 的 byte code 反编译成 java 代码，便于你理解业务逻辑；

* 在 Arthas Console 上，反编译出来的源码是带语法高亮的，阅读更方便
* 当然，反编译出来的 java 代码可能会存在语法错误，但不影响你进行阅读理解

> sc、sm、jad 三个命令可以结合使用。

# classloader
查看classloader的继承树，urls，类加载信息。

classloader 命令将 JVM 中所有的classloader的信息统计出来，并可以展示继承树，urls等。

可以让指定的classloader去getResources，打印出所有查找到的resources的url。对于ResourceNotFoundException比较有用。

# mc、redefine

## mc
Memory Compiler/内存编译器，编译.java文件生成.class。

## redefine
加载外部的.class文件，redefine jvm已加载的类。

> mc、redefine 可以结合使用

# monitor
```
$ monitor com.jiankunking.logsearch.services.LogSearchService queryStringByKeyWord
Press Q or Ctrl+C to abort.
Affect(class-cnt:1 , method-cnt:1) cost in 90 ms.
 timestamp            class                                                method                total  success  fail  avg-rt(ms)  fail-rate                                                   
---------------------------------------------------------------------------------------------------------------------------------------------                                                  
 2019-08-02 10:37:50  com.jiankunking.logsearch.services.LogSearchService  queryStringByKeyWord  61     61       0     96.68       0.00%                                                       

 timestamp            class                                                method                total  success  fail  avg-rt(ms)  fail-rate                                                   
---------------------------------------------------------------------------------------------------------------------------------------------                                                  
 2019-08-02 10:38:50  com.jiankunking.logsearch.services.LogSearchService  queryStringByKeyWord  27     27       0     51.06       0.00%                                                       

 timestamp            class                                                method                total  success  fail  avg-rt(ms)  fail-rate                                                   
---------------------------------------------------------------------------------------------------------------------------------------------                                                  
 2019-08-02 10:39:50  com.jiankunking.logsearch.services.LogSearchService  queryStringByKeyWord  0      0        0     0.00        0.00%  
```

# watch

方法执行数据观测。

让你能方便的观察到指定方法的调用情况。能观察到的范围为：返回值、抛出异常、入参，通过编写OGNL 表达式进行对应变量的查看。

> 这个有点强大啊

```
$ watch  com.jiankunking.logsearch.services.LogSearchService queryStringByKeyWord  "{params,target,returnObj}" -x 2 -b -s -n 2
Press Q or Ctrl+C to abort.
Affect(class-cnt:1 , method-cnt:1) cost in 111 ms.
ts=2019-08-02 10:48:48; [cost=0.006503ms] result=@ArrayList[
    @Object[][
        @String[monitor],
        @String[console],
        null,
        @String[all],
        @String[all],
        null,
        null,
        @Integer[100],
        @Long[1564713816522],
        @Long[1564714116522],
        null,
        @[desc],
    ],
    @LogSearchService[
        log=@Logger[Logger[com.jiankunking.logsearch.services.LogSearchService]],
        esFilterService=@ESFilterService[com.jiankunking.logsearch.services.ESFilterService@58ebfd03],
        indexPrefixService=@IndexPrefixService[com.jiankunking.logsearch.services.IndexPrefixService@19fb8826],
        searchAfterSort=@String[][isEmpty=false;size=3],
    ],
    null,
]
ts=2019-08-02 10:48:48; [cost=91.878471ms] result=@ArrayList[
    @Object[][
        @String[monitor],
        @String[console],
        null,
        @String[all],
        @String[all],
        null,
        null,
        @Integer[100],
        @Long[1564713816522],
        @Long[1564714116522],
        null,
        @[desc],
    ],
    @LogSearchService[
        log=@Logger[Logger[com.jiankunking.logsearch.services.LogSearchService]],
        esFilterService=@ESFilterService[com.jiankunking.logsearch.services.ESFilterService@58ebfd03],
        indexPrefixService=@IndexPrefixService[com.jiankunking.logsearch.services.IndexPrefixService@19fb8826],
        searchAfterSort=@String[][isEmpty=false;size=3],
    ],
    @SearchResult[
        metadata=@MetaData[MetaData(total=21431)],
        items=@ArrayList[isEmpty=false;size=100],
    ],
]
```

# trace

方法内部调用路径，并输出方法路径上的每个节点上耗时

trace 命令能主动搜索 class-pattern／method-pattern 对应的方法调用路径，渲染和统计整个调用链路上的所有性能开销和追踪调用链路。

```
$ trace  com.jiankunking.logsearch.services.LogSearchService queryStringByKeyWord 
Press Q or Ctrl+C to abort.
Affect(class-cnt:1 , method-cnt:1) cost in 182 ms.
`---ts=2019-08-02 10:53:36;thread_name=http-nio-8080-exec-8;id=42d;is_daemon=true;priority=5;TCCL=org.springframework.boot.web.embedded.tomcat.TomcatEmbeddedWebappClassLoader@1095194
    `---[416.520613ms] com.jiankunking.logsearch.services.LogSearchService:queryStringByKeyWord()
        +---[0.019415ms] org.elasticsearch.search.builder.SearchSourceBuilder:<init>() #78
        +---[0.011853ms] org.elasticsearch.index.query.QueryBuilders:boolQuery() #79
        +---[0.02617ms] com.jiankunking.logsearch.services.ESFilterService:addProjectFilter() #80
        +---[0.005593ms] com.jiankunking.logsearch.util.StringUtils:isEmpty() #81
        +---[0.006519ms] java.lang.String:equals() #81
        +---[0.002157ms] com.jiankunking.logsearch.util.StringUtils:isEmpty() #84
        +---[0.002046ms] java.lang.String:equals() #84
        +---[0.004284ms] com.jiankunking.logsearch.util.StringUtils:isNotEmpty() #87
        +---[0.002342ms] com.jiankunking.logsearch.util.StringUtils:isNotEmpty() #90
        +---[0.002066ms] com.jiankunking.logsearch.util.StringUtils:isNotEmpty() #98
        +---[0.005008ms] org.elasticsearch.index.query.QueryBuilders:rangeQuery() #114
        +---[0.005904ms] com.jiankunking.logsearch.util.TimeUtils:toDate() #115
        +---[0.006666ms] org.elasticsearch.index.query.RangeQueryBuilder:gte() #115
        +---[0.002128ms] com.jiankunking.logsearch.util.TimeUtils:toDate() #116
        +---[0.004161ms] org.elasticsearch.index.query.RangeQueryBuilder:lte() #116
        +---[0.347063ms] org.elasticsearch.index.query.BoolQueryBuilder:must() #117
        +---[min=0.002196ms,max=0.030129ms,total=0.036436ms,count=3] org.elasticsearch.search.builder.SearchSourceBuilder:sort() #126
        +---[0.005683ms] org.elasticsearch.search.builder.SearchSourceBuilder:fetchSource() #131
        +---[0.003406ms] org.elasticsearch.search.builder.SearchSourceBuilder:size() #133
        +---[0.003613ms] org.elasticsearch.search.builder.SearchSourceBuilder:query() #133
        +---[0.321264ms] org.elasticsearch.search.builder.SearchSourceBuilder:toString() #134
        +---[0.00689ms] org.springframework.http.HttpMethod:name() #136
        +---[0.172438ms] com.jiankunking.logsearch.services.IndexPrefixService:getIndexPrefix() #136
        +---[0.012968ms] com.jiankunking.logsearch.util.ESQueryUtils:getEndpoint() #136
        +---[398.953869ms] com.jiankunking.logsearch.util.ESQueryUtils:performRequest() #136
        +---[0.336319ms] com.alibaba.fastjson.JSON:parse() #138
        +---[min=0.002461ms,max=0.013798ms,total=0.016259ms,count=2] java.util.Map:get() #140
        +---[0.006434ms] java.lang.Integer:intValue() #140
        +---[min=0.001908ms,max=0.002073ms,total=0.003981ms,count=2] java.util.Map:get() #141
        +---[0.007532ms] com.jiankunking.logsearch.dto.SearchResult:<init>() #145
        +---[0.004286ms] java.util.ArrayList:<init>() #146
        +---[0.005725ms] com.alibaba.fastjson.JSONArray:iterator() #148
        +---[min=8.07E-4ms,max=0.010324ms,total=0.124433ms,count=101] java.util.Iterator:hasNext() #148
        +---[min=8.16E-4ms,max=0.009674ms,total=0.114893ms,count=100] java.util.Iterator:next() #148
        +---[min=8.38E-4ms,max=0.013835ms,total=0.130734ms,count=100] com.alibaba.fastjson.JSONObject:get() #150
        +---[min=8.69E-4ms,max=0.005654ms,total=0.112518ms,count=100] com.jiankunking.logsearch.util.MapUtils:getSize() #151
        +---[min=7.84E-4ms,max=0.005522ms,total=0.106345ms,count=100] java.util.HashMap:<init>() #151
        +---[min=8.4E-4ms,max=0.016457ms,total=0.12907ms,count=100] com.alibaba.fastjson.JSONArray:iterator() #152
        +---[min=8.21E-4ms,max=0.002612ms,total=0.106495ms,count=100] java.util.Iterator:hasNext() #152
        +---[min=8.07E-4ms,max=0.018355ms,total=0.143992ms,count=100] java.util.Iterator:next() #152
        +---[min=8.72E-4ms,max=0.008687ms,total=0.132524ms,count=100] java.lang.String:valueOf() #153
        +---[min=8.07E-4ms,max=0.008049ms,total=0.110329ms,count=100] java.lang.String:contains() #153
        +---[min=8.46E-4ms,max=0.002612ms,total=0.109295ms,count=100] java.lang.String:valueOf() #156
        +---[min=8.86E-4ms,max=0.041239ms,total=0.178986ms,count=100] java.util.HashMap:put() #156
        +---[min=7.96E-4ms,max=0.008521ms,total=0.113489ms,count=100] com.alibaba.fastjson.JSONObject:get() #159
        +---[min=8.2E-4ms,max=0.016801ms,total=0.125154ms,count=100] java.util.Map:get() #159
        +---[min=8.39E-4ms,max=0.002089ms,total=0.106842ms,count=100] java.util.HashMap:put() #159
        +---[min=7.86E-4ms,max=0.002836ms,total=0.104852ms,count=100] com.alibaba.fastjson.JSONObject:get() #160
        +---[min=8.4E-4ms,max=0.003068ms,total=0.10763ms,count=100] java.util.HashMap:put() #160
        +---[min=8.02E-4ms,max=0.020112ms,total=0.122423ms,count=100] com.alibaba.fastjson.JSONObject:get() #161
        +---[min=8.22E-4ms,max=0.001939ms,total=0.104809ms,count=100] java.util.HashMap:put() #161
        +---[min=7.99E-4ms,max=0.00186ms,total=0.10316ms,count=100] com.alibaba.fastjson.JSONObject:get() #162
        +---[min=8.17E-4ms,max=0.012238ms,total=0.115955ms,count=100] java.util.Map:get() #162
        +---[min=8.14E-4ms,max=0.018342ms,total=0.124331ms,count=100] java.util.HashMap:put() #162
        +---[min=8.47E-4ms,max=0.003852ms,total=0.113692ms,count=100] com.alibaba.fastjson.JSONObject:containsKey() #164
        +---[min=8.11E-4ms,max=0.017145ms,total=0.122375ms,count=100] com.alibaba.fastjson.JSONObject:containsKey() #167
        +---[min=7.85E-4ms,max=0.002459ms,total=0.10233ms,count=100] com.alibaba.fastjson.JSONObject:get() #167
        +---[min=8.57E-4ms,max=0.005959ms,total=0.11281ms,count=100] java.util.Map:containsKey() #167
        +---[min=7.86E-4ms,max=0.016889ms,total=0.116022ms,count=100] com.alibaba.fastjson.JSONObject:get() #171
        +---[min=8.27E-4ms,max=0.007969ms,total=0.121529ms,count=100] java.util.Map:get() #171
        +---[min=8.24E-4ms,max=0.017969ms,total=0.126264ms,count=100] java.util.Map:containsKey() #171
        +---[min=7.83E-4ms,max=0.001924ms,total=0.101244ms,count=100] com.alibaba.fastjson.JSONObject:get() #172
        +---[min=7.92E-4ms,max=0.247702ms,total=0.502606ms,count=200] java.util.Map:get() #172
        +---[min=8.61E-4ms,max=0.010095ms,total=0.124106ms,count=100] java.util.HashMap:put() #172
        +---[min=7.84E-4ms,max=0.002789ms,total=0.100561ms,count=100] com.alibaba.fastjson.JSONObject:get() #174
        +---[min=8.18E-4ms,max=0.003825ms,total=0.105746ms,count=100] java.util.Map:get() #174
        +---[min=8.17E-4ms,max=0.003044ms,total=0.108946ms,count=100] java.util.Map:containsKey() #174
        +---[min=7.83E-4ms,max=0.010689ms,total=0.10957ms,count=100] com.alibaba.fastjson.JSONObject:get() #175
        +---[min=7.92E-4ms,max=0.018299ms,total=0.225606ms,count=200] java.util.Map:get() #175
        +---[min=8.53E-4ms,max=0.002182ms,total=0.108485ms,count=100] java.util.HashMap:put() #175
        +---[min=7.84E-4ms,max=0.005874ms,total=0.103371ms,count=100] com.alibaba.fastjson.JSONObject:get() #177
        +---[min=8.02E-4ms,max=0.002017ms,total=0.101695ms,count=100] java.util.Map:get() #177
        +---[min=8.26E-4ms,max=0.002735ms,total=0.106121ms,count=100] java.util.Map:containsKey() #177
        +---[min=8.0E-4ms,max=0.017176ms,total=0.130393ms,count=100] com.alibaba.fastjson.JSONObject:get() #178
        +---[min=8.03E-4ms,max=0.003318ms,total=0.204767ms,count=200] java.util.Map:get() #178
        +---[min=8.55E-4ms,max=0.008081ms,total=0.115006ms,count=100] java.util.HashMap:put() #178
        +---[min=9.11E-4ms,max=0.014017ms,total=0.136197ms,count=100] java.util.List:add() #180
        +---[0.005288ms] com.jiankunking.logsearch.dto.SearchResult:setItems() #182
        `---[0.002643ms] com.jiankunking.logsearch.dto.SearchResult:setTotal() #183

```

# stack

输出当前方法被调用的调用路径。

很多时候我们都知道一个方法被执行，但这个方法被执行的路径非常多，或者你根本就不知道这个方法是从那里被执行了，此时你需要的是 stack 命令。

```
$ stack  com.jiankunking.logsearch.services.LogSearchService queryStringByKeyWord 
Press Q or Ctrl+C to abort.
Affect(class-cnt:1 , method-cnt:1) cost in 173 ms.
ts=2019-08-02 10:55:44;thread_name=http-nio-8080-exec-1;id=426;is_daemon=true;priority=5;TCCL=org.springframework.boot.web.embedded.tomcat.TomcatEmbeddedWebappClassLoader@1095194
    @com.jiankunking.logsearch.controller.LogSearchController.searchByKeyWord()
        at com.jiankunking.logsearch.controller.LogSearchController$$FastClassBySpringCGLIB$$61775844.invoke(<generated>:-1)
        at org.springframework.cglib.proxy.MethodProxy.invoke(MethodProxy.java:204)
        at org.springframework.aop.framework.CglibAopProxy$CglibMethodInvocation.invokeJoinpoint(CglibAopProxy.java:746)
        at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:163)
        at org.springframework.aop.aspectj.MethodInvocationProceedingJoinPoint.proceed(MethodInvocationProceedingJoinPoint.java:88)
        at com.jiankunking.logsearch.aspect.ControllerTimeConsumeAspect.doAround(ControllerTimeConsumeAspect.java:34)
        at jdk.internal.reflect.GeneratedMethodAccessor91.invoke(null:-1)
        at jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
        at java.lang.reflect.Method.invoke(Method.java:567)
        at org.springframework.aop.aspectj.AbstractAspectJAdvice.invokeAdviceMethodWithGivenArgs(AbstractAspectJAdvice.java:644)
        at org.springframework.aop.aspectj.AbstractAspectJAdvice.invokeAdviceMethod(AbstractAspectJAdvice.java:633)
        at org.springframework.aop.aspectj.AspectJAroundAdvice.invoke(AspectJAroundAdvice.java:70)
        at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:174)
        at org.springframework.aop.interceptor.ExposeInvocationInterceptor.invoke(ExposeInvocationInterceptor.java:92)
        at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:185)
        at org.springframework.aop.framework.CglibAopProxy$DynamicAdvisedInterceptor.intercept(CglibAopProxy.java:688)
        at com.jiankunking.logsearch.controller.LogSearchController$$EnhancerBySpringCGLIB$$2f145034.searchByKeyWord(<generated>:-1)
        at jdk.internal.reflect.GeneratedMethodAccessor97.invoke(null:-1)
        at jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
        at java.lang.reflect.Method.invoke(Method.java:567)
        at org.springframework.web.method.support.InvocableHandlerMethod.doInvoke(InvocableHandlerMethod.java:209)
        at org.springframework.web.method.support.InvocableHandlerMethod.invokeForRequest(InvocableHandlerMethod.java:136)
        at org.springframework.web.servlet.mvc.method.annotation.ServletInvocableHandlerMethod.invokeAndHandle(ServletInvocableHandlerMethod.java:102)
        at org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter.invokeHandlerMethod(RequestMappingHandlerAdapter.java:891)
        at org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter.handleInternal(RequestMappingHandlerAdapter.java:797)
        at org.springframework.web.servlet.mvc.method.AbstractHandlerMethodAdapter.handle(AbstractHandlerMethodAdapter.java:87)
        at org.springframework.web.servlet.DispatcherServlet.doDispatch(DispatcherServlet.java:991)
        at org.springframework.web.servlet.DispatcherServlet.doService(DispatcherServlet.java:925)
        at org.springframework.web.servlet.FrameworkServlet.processRequest(FrameworkServlet.java:974)
        at org.springframework.web.servlet.FrameworkServlet.doGet(FrameworkServlet.java:866)
        at javax.servlet.http.HttpServlet.service(HttpServlet.java:635)
        at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:851)
        at javax.servlet.http.HttpServlet.service(HttpServlet.java:742)
        at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:231)
        at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)
        at org.apache.tomcat.websocket.server.WsFilter.doFilter(WsFilter.java:52)
        at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:193)
        at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)
        at org.springframework.web.filter.RequestContextFilter.doFilterInternal(RequestContextFilter.java:99)
        at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:107)
        at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:193)
        at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)
        at org.springframework.web.filter.HttpPutFormContentFilter.doFilterInternal(HttpPutFormContentFilter.java:109)
        at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:107)
        at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:193)
        at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)
        at org.springframework.web.filter.HiddenHttpMethodFilter.doFilterInternal(HiddenHttpMethodFilter.java:93)
        at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:107)
        at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:193)
        at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)
        at org.springframework.web.filter.CharacterEncodingFilter.doFilterInternal(CharacterEncodingFilter.java:200)
        at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:107)
        at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:193)
        at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)
        at org.apache.catalina.core.StandardWrapperValve.invoke(StandardWrapperValve.java:198)
        at org.apache.catalina.core.StandardContextValve.invoke(StandardContextValve.java:96)
        at org.apache.catalina.authenticator.AuthenticatorBase.invoke(AuthenticatorBase.java:493)
        at org.apache.catalina.core.StandardHostValve.invoke(StandardHostValve.java:140)
        at org.apache.catalina.valves.ErrorReportValve.invoke(ErrorReportValve.java:81)
        at org.apache.catalina.core.StandardEngineValve.invoke(StandardEngineValve.java:87)
        at org.apache.catalina.connector.CoyoteAdapter.service(CoyoteAdapter.java:342)
        at org.apache.coyote.http11.Http11Processor.service(Http11Processor.java:800)
        at org.apache.coyote.AbstractProcessorLight.process(AbstractProcessorLight.java:66)
        at org.apache.coyote.AbstractProtocol$ConnectionHandler.process(AbstractProtocol.java:806)
        at org.apache.tomcat.util.net.NioEndpoint$SocketProcessor.doRun(NioEndpoint.java:1498)
        at org.apache.tomcat.util.net.SocketProcessorBase.run(SocketProcessorBase.java:49)
        at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1128)
        at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:628)
        at org.apache.tomcat.util.threads.TaskThread$WrappingRunnable.run(TaskThread.java:61)
        at java.lang.Thread.run(Thread.java:835)
```

# tt
方法执行数据的时空隧道，记录下指定方法每次调用的入参和返回信息，并能对这些不同的时间下调用进行观测。

# options 

全局开关

|     名称     |   默认值    | 描述  |
|  ----------  | ----------  |----  |
| unsafe  | false |是否支持对系统级别的类进行增强，打开该开关可能导致把JVM搞挂，请慎重选择！  |
| dump  | false |是否支持被增强了的类dump到外部文件中，如果打开开关，class文件会被dump到/${application dir}/arthas-class-dump/目录下，具体位置详见控制台输出|
| batch-re-transform  | true |是否支持批量对匹配到的类执行retransform操作  |
| json-format  | false |是否支持json化的输出  |
| disable-sub-class  | false |是否禁用子类匹配，默认在匹配目标类的时候会默认匹配到其子类，如果想精确匹配，可以关闭此开关  |
| debug-for-asm  | false |打印ASM相关的调试信息  |
| save-result  | false |是否打开执行结果存日志功能，打开之后所有命令的运行结果都将保存到/home/admin/logs/arthas/arthas.log中  |
| job-timeout  | id |异步后台任务的默认超时时间，超过这个时间，任务自动停止；比如设置 1d, 2h, 3m, 25s，分别代表天、小时、分、秒  |
