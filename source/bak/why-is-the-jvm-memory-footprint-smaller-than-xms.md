---
title: 为什么JVM内存占用小于Xms？
categories:
  - JVM
tags:
  - JVM
  - Java
  - 原创
abbrlink: 13923
date: 2020-04-19 09:34:58
---

以下面这个命令启动：

```
java -server -Xms15g -Xmx15g -jar /app.jar
```

应用程序的内存占用会是多少？

<!-- more -->

周四的时候，同事突然问了一个问题，为什么设置了Xms=Xmx=15g之后，应用程序的内存占用远远小于Xms？

具体启动命令如下：
```
//为了方便查看，手动换行
java -server -Xms15g -Xmx15g 
-XX:+UseConcMarkSweepGC 
-XX:+CMSParallelRemarkEnabled
-XX:+UseCMSInitiatingOccupancyOnly 
-XX:CMSInitiatingOccupancyFraction=77 
-XX:+ScavengeBeforeFullGC 
-XX:+CMSScavengeBeforeRemark 
-Djava.security.egd=file:/dev/./urandom 
-jar /app.jar --spring.profiles.active=prod
```

下面看一下真实的内存占用

先从系统层面看：

top:
![](/images/why-is-the-jvm-memory-footprint-smaller-than-xms/top.png)

free:
![](/images/why-is-the-jvm-memory-footprint-smaller-than-xms/free.png)

从系统层面可以看到，应用内存占用远小于Xms，难道是JVM参数没有生效？

下面借助[arthas](https://github.com/alibaba/arthas)看一下JVM相关信息

```
 RUNTIME
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 MACHINE-NAME                                   7@authserver-5fc5c7c775-9fs2m
 JVM-START-TIME                                 2020-04-15 00:04:27
 MANAGEMENT-SPEC-VERSION                        1.2
 SPEC-NAME                                      Java Virtual Machine Specification
 SPEC-VENDOR                                    Oracle Corporation
 SPEC-VERSION                                   1.8
 VM-NAME                                        Java HotSpot(TM) 64-Bit Server VM
 VM-VENDOR                                      Oracle Corporation
 VM-VERSION                                     25.111-b14
 INPUT-ARGUMENTS                                -javaagent:/var/agent/pinpoint-agent/pinpoint-bootstrap.jar
                                                -Xms15g
                                                -Xmx15g
                                                -XX:+UseConcMarkSweepGC
                                                -XX:+CMSParallelRemarkEnabled
                                                -XX:+UseCMSInitiatingOccupancyOnly
                                                -XX:CMSInitiatingOccupancyFraction=77
                                                -XX:+ScavengeBeforeFullGC
                                                -XX:+CMSScavengeBeforeRemark
                                                -Djava.security.egd=file:/dev/./urandom

 CLASS-PATH                                     /app.jar:/var/agent/pinpoint-agent/pinpoint-bootstrap.jar
 BOOT-CLASS-PATH                                /usr/java/jre1.8.0_111/lib/resources.jar:/usr/java/jre1.8.0_111/lib/rt.jar:/usr/java/jre1.8.0_111/lib/sunrsasign.jar
                                                :/usr/java/jre1.8.0_111/lib/jsse.jar:/usr/java/jre1.8.0_111/lib/jce.jar:/usr/java/jre1.8.0_111/lib/charsets.jar:/usr
                                                /java/jre1.8.0_111/lib/jfr.jar:/usr/java/jre1.8.0_111/classes
 LIBRARY-PATH                                   /usr/java/packages/lib/amd64:/usr/lib64:/lib64:/lib:/usr/lib

---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CLASS-LOADING
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 LOADED-CLASS-COUNT                             21926
 TOTAL-LOADED-CLASS-COUNT                       21944
 UNLOADED-CLASS-COUNT                           18
 IS-VERBOSE                                     false

---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 COMPILATION
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 NAME                                           HotSpot 64-Bit Tiered Compilers
 TOTAL-COMPILE-TIME                             366850(ms)

---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 GARBAGE-COLLECTORS
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 ParNew                                         1797/78247(ms)
 [count/time]
 ConcurrentMarkSweep                            3/460(ms)
 [count/time]

---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 MEMORY-MANAGERS
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CodeCacheManager                               Code Cache

 Metaspace Manager                              Metaspace
                                                Compressed Class Space

 ParNew                                         Par Eden Space
                                                Par Survivor Space

 ConcurrentMarkSweep                            Par Eden Space
                                                Par Survivor Space
                                                CMS Old Gen


---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 MEMORY
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 HEAP-MEMORY-USAGE                              15992750080(14.9 GiB)/16106127360(15.0 GiB)/15992750080(14.9 GiB)/2393542120(2.2 GiB)
 [committed/init/max/used]
 NO-HEAP-MEMORY-USAGE                           255647744(243.8 MiB)/2555904(2.4 MiB)/-1(-1 B)/247922192(236.4 MiB)
 [committed/init/max/used]
 PENDING-FINALIZE-COUNT                         0

---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 OPERATING-SYSTEM
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 OS                                             Linux
 ARCH                                           amd64
 PROCESSORS-COUNT                               16
 LOAD-AVERAGE                                   5.08
 VERSION                                        4.4.0-141-generic

---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 THREAD
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 COUNT                                          256
 DAEMON-COUNT                                   103
 PEAK-COUNT                                     263
 STARTED-COUNT                                  41467
 DEADLOCK-COUNT                                 0

---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 FILE-DESCRIPTOR
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 MAX-FILE-DESCRIPTOR-COUNT                      1048576
 OPEN-FILE-DESCRIPTOR-COUNT                     811
Affect(row-cnt:0) cost in 6 ms.
```

注意HEAP-MEMORY-USAGE部分
```
HEAP-MEMORY-USAGE 15992750080(14.9 GiB)/16106127360(15.0 GiB)/15992750080(14.9 GiB)/2393542120(2.2 GiB) [committed/init/max/used]
```

从这里可以看到JVM参数是生效的，那为什么内存占用不是15g？