---
title: 通过Docker部署ZooKeeper集群
categories:
  - ZooKeeper
tags:
  - ZooKeeper
  - Docker
  - Install
  - Cluster
abbrlink: 53552
date: 2020-05-08 18:24:35
---

容器化部署ZooKeeper集群

<!-- more -->

以3.5.7为例

配置文件：
```
tickTime=2000
initLimit=5
syncLimit=2
autopurge.snapRetainCount=3
autopurge.purgeInterval=0
maxClientCnxns=60
admin.enableServer=true
clientPort=2181
```

docker-compose.yml文件：
```
version: '3.1'

services:
  zookeeper:
    image: zookeeper:3.5.7
    restart: always
    container_name: zk-3
    volumes:
      - /data/zk/data:/data
      - /data/zk/datalog:/datalog
      - /home/zk/zookeeper-3.5.7/conf/zoo.cfg:/apache-zookeeper-3.5.7-bin/conf/zoo.cfg
    environment:
      ZOO_MY_ID: 3
      ZOO_SERVERS: server.1=10.133.204.193:2888:3888;2181 server.2=10.133.204.194:2888:3888;2181 server.3=0.0.0.0:2888:3888;2181
    ports:
      - 2181:2181
      - 2888:2888
      - 3888:3888
      - 8080:8080
```

查看集群状态，主从信息
```
docker exec -it zk-3 bash ./bin/zkServer.sh status
```