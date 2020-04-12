---
layout: w
title: 个人常用命令集锦
date: 2020-04-12 10:55:56
categories:
  - jiankunking
tags:
  - Commands
---

个人常用命令集锦 持续更新

<!-- more -->

# OS

1、 立刻关机
```
halt
```
2、 centos安装yum
```
apt-get install yum
```
3、 查找文件夹
```
find / - name 需要查找文件名称
```
4、 vi里面 查找字符串
“/”，后面跟要查找的字符串，再按回车。vi将光标定位在该串下一次出现的地方上。键入n跳到该串的下一个出现处，键入N跳到该串的上一个出现处。
要查找一个以search为行首的行，则键入/^search ，要查找一个以search为行尾的行，则键入/search＄。
5、 解压
```
tar -zxvf archive_name.tar.gz
unzip elasticsearch-head-master.zip
unzip -oq elastic-job-lite-console.war -d elastic-job-lite-console
```

//unzip 命令详解
http://www.2cto.com/os/201308/239355.html

6、 压缩
```
tar czvf robot4.tar robot4
```

7、 查看文件修改时间
```
stat 555.txt
```

8、 查看当前目录下所有文件夹及文件
```
tree
```
如果想把内容输出到文本
```
tree > file.txt
```

9、 读取标准输入的数据，并将其内容输出成文件
```
tee
```
例如：
```
bin/logstash -f config/logstash-hdy.conf  --debug | tee debug.log
```
将调试日志输入到文本中

10、 显示当前所有Java进程pid的命令
```
jps
```

11、 查看文件大小（后缀是m）
```
du -sh  alarm.log | sort -rn
```
12、 linux 端口占用
```
netstat -anp | grep 80
lsof -i:17428
```
13、 Ubuntu内存cpu监控
```
sudo apt-get install htop
```
安装完成后执行命令：htop即可

14、远程拷贝文件
```
scp monitor-kafka-consumer-0.0.1-SNAPSHOT.jar root@10.119.37.115:/usr/local
```

15、放开所有端口
```
iptables -I IN_public_allow 1 -j ACCEPT
```
16、java后台启动jar包 后台启动，并且不记录日志输出
```
nohup java -jar jarfilename.jar >/dev/null &
nohup java -jar jarfilename.jar >log.txt &
```
17、Centos版本查看
```
cat /etc/redhat-release
```
18、移除当前目录下非war结尾的文件
```
find . ! -name "*.war"  -exec rm -rf {} \;
```
19、war 解压
```
//解压 到activiti-app文件夹中（没有会自动创建）
unzip activiti-app.war -d activiti-app
```
20、linux java安装路径查看
http://www.cnblogs.com/kerrycode/p/4762921.html
21、查看文件的第5行到第10行
```
sed -n '5,10p' /etc/passwd
```
22、查找过滤文本文件内容
```
//查看cockpit-schedule-task.log日志中包含CustomDayCounterThread关键字
//忽略大小写，可以用-i参数
grep -i CustomDayCounterThread cockpit-schedule-task.log
```
23、根据进程号 查找程序所在文件夹
```
ll /proc/PID 比如“ll /proc/12132
```
24、更改用户的密码过期时间
比如：给jiankunking延期3000天
```
sudo chage -M 3000 jiankunking
```
查看jiankunking过期时间信息
```
chage -l jiankunking
```
25、查询当前文件夹下文件数量
```
ls -l | grep "^-" | wc -l
```

查询某个文件夹下所有文件（包含文件夹中的文件）
```
find ./monitor-cockpit -type f | wc -l
```
wc是(Word Count)的缩写，即统计单词数。 -l 统计行数

xargs用作替换工具，读取输入数据重新格式化后输出
26、查找某个文件夹下 包含error的内容
```
find ./monitor-cockpit -type f | xargs cat | grep -i error
```
27、ssh登陆
```
ssh jiankunking@10.138.40.221
```
28、回到你操作过的上一个目录去
只需敲入 cd – 就会返回到你操作过的上一个目录中去。
29、kill -HUP pid
pid 是进程标识。如果想要更改配置而不需停止并重新启动服务，请使用该命令。在对配置文件作必要的更改后，发出该命令以动态更新服务配置。
30、tcpdump
```
tcpdump -i ens160 host 10.119.37.147 and port 17428
//-X表示解码
tcpdump -i ens160 host 10.119.37.147 -X
```
31、判断当前主机是物理机还是虚拟机
```
dmidecode -s system-product-name
```
32、通过命令监听端口
```
nc -l 1211
```
33、Linux快速查询到历史输入命令
```
ctrl+r
```
按下这个快捷键后，进入了反向搜索状态，这时你输入一个字符，系统会找到最近一个包含这个字符的命令，如果不是你想要的命令，你可以继续输入，系统继续查找最近一个包含你所输入的字符串的命令，直到找到你要的命令。
找到你想要的命令后，你可以按回车执行这条命令，还可以按上下键查找该命令前后的命令，按左右键移动光标并修改这条命令。
为了提高查找效率，你应该输入该条命令中最特别的字符（别的命令不包含的字符）
34、ssh 调试模式
```
ssh -v  jiankunking@10.119.37.199
```

35、linux查询某个关键字附近几行
```
grep -C 40 AlarmThread_run_error cockpit-schedule-task-2017-11-17.3.log
```

36、杀掉所有含有关键字"ansible"的进程
```
ps -ef|grep ansible|grep -v grep|cut -c 9-15|xargs kill -9
```
https://www.cnblogs.com/lichkingct/archive/2010/08/27/1810463.html
37、linux时间排序
```
//按照时间升序
ls -lrt
//按照时间降序（最新修改的排在前面）
ls -lt
```

38、临时配置java环境
```
export JAVA_HOME=/usr/local/java/jdk1.7.0_79
export CLASSPATH=.:$JAVA_HOME/lib/dt.jar:$JAVA_HOME/lib/tools.jar
export PATH=$JAVA_HOME/bin:$PATH
```
39、将当前时间以Unix时间戳表示
```
date +%s
```
40、Ubuntu /etc/hosts 生效
```
sudo /etc/init.d/networking restart
```
41、~
当前用户的根目录
比如：jiankunking用户  ~代表：/home/jiankunking
比如：root用户 ~代表：/root

42、查找当前目录下所有包含sshd_config字符串的文件
```
find .|xargs grep -ri "sshd_config"
```
43、使用env命令显示所有的环境变量
```
env
```
44、linux命令查看开放哪些端口
```
netstat -nupl (UDP类型的端口)
netstat -ntpl (TCP类型的端口)
```

45、su sudo
su - root(或者其他用户名)这里加了"-"后表示也切换的当前的环境变量到新用户的环境变量，
su root（或者其他用户名）表示不切换环境变量到当前用户下。
46、查看IP连接数状况
```
netstat -nat|grep ":80"|awk '{print $5}' |awk -F: '{print $1}' | sort| uniq -c|sort -n
```
47、查看连接的各种状态
```
netstat -n | awk '/^tcp/ {++S[$NF]} END {for(a in S) print a, S[a]}'
```
48、Linux 快速清空文件内容
```
> test.txt（文件大小被截为0字节）

//文件内容清空
echo > filebeat.yml
```
https://my.oschina.net/open1900/blog/99061

49、文件赋予执行权限

u：表示文件所有者 
g：表示同组用户 
o：表示其它用户 
a：表示所有用户 

opt则是代表操作，可以为： 
+：添加某个权限 
-：取消某个权限 
=：赋予给定的权限，并取消原有的权限

50、将/data/hlht/data/elasticsearch赋给elsearch用户组中的elsearch用户
```
chown -R elsearch:elsearch  /data/hlht/data/elasticsearch
chmod 777 /data/hlht/data/elasticsearch
```
查看当前用户所属组：groups

51、查看磁盘剩余空间
```
df -hl ./*
```
52、查看某个目录下文件资源占用大小
```
du -sh /var/log/*
```
53、查看文件夹下文件排序并显示
```
du -sh ./*| sort -k1 -n
```
54、某个进程内存占用
top -p 进程号
显示内存单位是K

55、CentOS7使用firewalld打开关闭防火墙与端口
https://www.cnblogs.com/moxiaoan/p/5683743.html

56、添加具有root权限用户
```
useradd es
vi /etc/sudoers
es ALL=(ALL)  NOPASSWD:ALL
```
测试 
su es -
sudo su -
56、查看磁盘空间大小命令（linux系统以磁盘分区为单位查看文件系统）
```
df -hl
```
57、查看已经挂载的分区和文件系统类型
```
df -T
```
58、0.0.0.0
一个非常特殊的IP：0.0.0.0
这个IP相当于java中的this，代表当前设备的IP。

59、服务重新加载
```
systemctl daemon-reload
```
60、Linux下 查看哪些进程占用的CPU内存资源最多
linux下获取占用内存资源最多的10个进程，可以使用如下命令组合：
```
ps aux|head -1;ps aux|grep -v PID|sort -rn -k +4|head
```
linux下获取占用CPU资源最多的10个进程，可以使用如下命令组合：
```
ps aux|head -1;ps aux|grep -v PID|sort -rn -k +3|head
```
或者
在命令行提示符执行top命令
输入大写P，则结果按CPU占用降序排序。输入大写M，结果按内存占用降序排序。（注：大写P可以在capslock状态输入p，或者按Shift+p）

61、磁盘io利用率
```
iostat -xdm 1
```
%util 代表磁盘繁忙程度。100% 表示磁盘繁忙, 0%表示磁盘空闲。但是注意,磁盘繁忙不代表磁盘(带宽)利用率高  
https://www.cnblogs.com/quixotic/p/3258730.html

进程级IO监控 iotop 
iotop 顾名思义, io版的top  

62、多U多核CPU监控
在top基本视图中，按键盘数字“1”，可监控每个逻辑CPU的状况
第三行：cpu状态
6.7% us — 用户空间占用CPU的百分比。
0.4% sy — 内核空间占用CPU的百分比。
0.0% ni — 改变过优先级的进程占用CPU的百分比
92.9% id — 空闲CPU百分比
0.0% wa — IO等待占用CPU的百分比
0.0% hi — 硬中断（Hardware IRQ）占用CPU的百分比
0.0% si — 软中断（Software Interrupts）占用CPU的百分比

63、centos查看安装了某个包
yum方法安装的，可以用yum list installed查找，如果是查找指定包，命令后加 | grep "软件名或者包名"； 

64、swap
关闭
```
swapoff -a
```
在关闭的时候，可以通过free -mh查看swap内存占用，swapoff -a会逐渐将swap内存转移到内存中
打开
```
swapon -a
echo "vm.swappiness = 1">> /etc/sysctl.conf 
sysctl -p  (执行这个使其生效，不用重启)
```
66、软连接
将/data/blog/wordpress/nginx_conf/2_jiankunking.com.key（真实存在） 软连接到/etc/nginx/目录下
```
ln -s /data/blog/wordpress/nginx_conf/2_jiankunking.com.key  /etc/nginx/
```
67、移动到文件末尾
可以按 shift+g  即可跳到文件底部
要返回文件顶部的时候 按 gg即可
shift+$是移动到行尾，0是移动到行首


68、字符替换
# 86替换成 214
```
sed -i "s/10.133.0.86/10.138.25.214/g"  lishan.txt
```
# Vi/Vim
1、 粘贴时行首出现很多缩进和空格
在拷贝前输入:set paste (这样的话，vim就不会启动自动缩进，而只是纯拷贝粘贴）
> vi 打开文件后，直接输入:set paste，然后再按i

2、 通过vi删除空行
//dd       删除当前行。
先按esc退出编辑模式，再dd即可

3、 vi 换行
进入非编辑模式，字母o

4、Vim用快捷键快速移动光标至行尾
1）按end键
2）按住shift + 4

# Docker

1、 获取完整id
```
docker inspect -f  '{{.Id}}' d8e703d7e303
```

2、 退出并不关闭容器
```
ctrl + p 再 ctrl+q
```

3、 推送镜像到私服
```
sudo docker push hub.docker.jiankunking.io:5000/jetty:jetty8
//冒号前后不要有空格
```
4、 docker build
```
docker build -t runoob/ubuntu:v1 . 
docker build -t  jiankunking/kafka:0.8.2.2 -f kafka.Dockerfile .
```
5、docker add
ADD还支持自动解压tar文件，比如ADD trusty-core-amd64.tar.gz /会线自动解压内容再COPY到在容器的/目录下。

6、删除名称或标签为none的镜像
```
docker rmi -f  `docker images | grep '<none>' | awk '{print $3}'`
 ```
7、容器删除删除所有未运行的容器（已经运行的删除不了，未运行的就一起被删除了）
```
sudo docker rm $(sudo docker ps -a -q)
```
删除没有被使用的镜像
```
docker rmi $(docker images -q)
```
8、docker var目录占用高问题
如果是/var/lib/docker/devicemapper/mnt占用率高
那就找出占用最高的文件
```
du -sh /var/lib/docker/devicemapper/mnt/*
```
此时的文件名称是DeviceName
然后
```
docker ps | awk '{print "docker inspect "$1}'|grep -v CONTAINER|sh > ./inspect.log
docker ps | awk '{print "docker inspect "$1}'|grep -v CONTAINER|sh > ./inspect.log
```
进入inspect查看docker信息 找到对应的正在运行的docker id

9、更新docker 重启策略
```
docker update --restart=always  11756183ff8a
```
https://docs.docker.com/engine/reference/commandline/update/

10、更新容器的内存限制
```
# --memory-swap -1 表示不限制
# -memory-swap	内存+交换分区大小总限制。格式同上。必须比-m设置的大
docker update -m 1024m --memory-swap -1 fea22ac3fdd7
```

11、容器内CPU、内存限制在/sys/fs/cgroup下

12、docker 查看容器的网络连接
```
#! /bin/bash
echo $1
PID=$(docker inspect -f '{{.State.Pid}}' $1)
nsenter -t $PID -n netstat |grep ESTABLISHED
　　
sudo sh docker-netstat.sh demo
```

第一步可以用docker top 找到pid

151、当 OOM 发生时，系统会把相关的 OOM 信息，记录到日志中。所以，我们可以在终端中执行 dmesg 命令，查看系统日志，并定位 OOM 相关的日志。（即使docker容器OOM后，也可以查看）

# Idea

1、 idea 类中函数全部折叠
ctrl + shift + 减号
2、 idea 类中函数全部展开
ctrl + shift + 加号
3、 idea 回到调用方法
ctrl + alt + f7

# Kafka

1、 查看kafka主题数据
```
bin/kafka-topics.sh --zookeeper 10.138.22.194:2181 --describe --topic count_test_one
```
2、 手动调用消费端
```
./kafka-console-consumer.sh --zookeeper localhost:2181 --topic count_test_one --from-beginning
./kafka-console-consumer.sh --zookeeper localhost:2181 --topic count_test_one
./kafka-console-consumer.sh --bootstrap-server 10.119.37.115:9092,10.119.37.147:9092,10.119.37.148:9092   --topic dubbo |grep xiaoneng
```
3、kafka启动
```
bin/kafka-server-start.sh -daemon config/server.properties
```
4、kafka 消费端启动
```
java -jar monitor-kafka-consumer-0.0.1-SNAPSHOT.jar -Dtopic=custom
```
5、查看kafka所有topic
```
bin/kafka-topics.sh --list --zookeeper localhost:2181
```
6、kafka消费端 消费指定主题
```
./kafka-console-consumer.sh --zookeeper localhost:2181 --topic xiaonengdubbo2
```

7、获取kafka中所有组
```
./kafka-consumer-groups.sh  --bootstrap-server 10.138.16.189:9092 --list
```

8、查看kafka消费端堆积量
```
./kafka-consumer-groups.sh  --bootstrap-server 10.138.16.189:9092 --group interconn --describe
```

9、查看kafka版本
```
find ./libs/ -name 'kafka_*.jar.asc' |head -n1 | cut -d'/' -f3
```

10、查看kafka某个topic下partition信息
```
./kafka-topics.sh --zookeeper 10.138.16.188:2181  --topic dubbo --describe 
```

# Git

1、 git忽略文件命令
```
git update-index --assume-unchanged FILE 在FILE处输入要忽略的文件。
```
2、git rebase 
```
# 引起冲突的commits会被丢弃，因此，在使用skip时请慎重。
git rebase --skip
# 可以运行git rebase –continue继续直到完成
git rebase --continue 
```
3、git reflog
显示整个本地仓储的commit, 包括所有branch的commit, 甚至包括已经撤销的commit, 只要HEAD发生了变化, 就会在reflog里面看得到. git log只包括当前分支的commit.
4、git log --graph
--graph 参数会根据分枝提交历史绘出图像。这个命令通常和--oneline，--decorate一起使用
```
git log --graph --oneline --decorate
```
5、git log
可以使用--pretty=format:"<string>"来自定义输出的格式。输出格式有点像printf中的占位符。
举个例子，下面的命令中，%cn,%h和%cd会被提交者姓名，commit的hash缩写，提交的日期占据
```
git log --pretty=format:"%cn committed %h on %cd"
```
格式化参考
https://www.kernel.org/pub/software/scm/git/docs/git-log.html#_pretty_formats
6、git fetch
git fetch命令用于从另一个存储库下载对象和引用。
7、丢弃工作区的修改
命令git checkout -- readme.txt意思就是，把readme.txt文件在工作区的修改全部撤销，这里有两种情况：
一种是readme.txt自修改后还没有被放到暂存区，现在，撤销修改就回到和版本库一模一样的状态；
一种是readme.txt已经添加到暂存区后，又作了修改，现在，撤销修改就回到添加到暂存区后的状态。
总之，就是让这个文件回到最近一次git commit或git add时的状态。
8、采用主分支上的/response.go文件
```
git checkout c4a651ba96d25a15adbecb21025f0d1d60901b6a pkg/models/response.go
```
9、终止git log 命令
按 q ，然后回车， 即可退出

# Maven

1、打包时跳过测试  
```
mvn clean package  -Dmaven.test.skip=true
```

# Zookeeper

1、zookeeper 节点 命令查看
```
./zkCli.sh -timeout 5000 -r -server localhost:2181
```

# Nginx

1、nginx启动（nginx安装目录地址 -c nginx配置文件地址）
```
/usr/local/nginx/sbin/nginx -c /usr/local/nginx/conf/nginx.conf
```
2、查看nginx配置文件
```
nginx -t
```
# Mysql

1、查看mysql表分区
```
SELECT
	partition_name part,
	partition_expression expr,
	partition_description descr,
	table_rows
FROM
	information_schema. PARTITIONS
WHERE
	table_schema = SCHEMA ()
AND table_name = 'application_hour_count';
```
2、mysql 外键
禁用外键约束：
```
SET FOREIGN_KEY_CHECKS=0;
```
启动外键约束：
```
SET FOREIGN_KEY_CHECKS=1;
```
# MongoDB

1、登陆MongoDB
```
sudo ssh jiankunkingadmin@10.138.40.221
sudo docker ps
sudo docker exec -it 83aa14b64901 /bin/bash
mongo
```

# Kubernetes

1、进入指定namespace pod
```
kubectl exec -it --namespace=kube-system  g-lsb-proxy-nginx-r7zfl-2522744936-11rld /bin/sh
kubectl exec -it g-lsb-proxy-nginx-r7zfl-2522744936-9tz5k -n kube-system  /bin/bash
```
2、查看k8s pod状态
```
kubectl describe pods -n  console gateway-7d89b6f6fb-dj4qp
```
# Elasticsearch
1、索引备份
https://www.elastic.co/guide/en/elasticsearch/reference/5.4/docs-reindex.html
```
curl -XPOST 'localhost:9200/_reindex?pretty' -H 'Content-Type: application/json' -d'
{
  "source": {
    "index": "twitter"
  },
  "dest": {
    "index": "new_twitter"
  }
}
'
```
2、es重启
先kill 杀死es
```
sh bin/elasticsearch -d
```
3、elasticsearch 查看集群所有设置（包含默认的）
```
http://10.138.16.191:9200/_cluster/settings?include_defaults=true
```
# Prometheus

1、重新加载文件
```
curl -XPOST  http://127.0.0.1:9090/-/reload 
```
# Kibana

1、kibana启动
```
nohup ./bin/kibana >/dev/null &
bin/kibana-plugin install file:///usr/local/x-pack-5.6.9.zip
```
2、kibana查看非空字段
```
_exists_:labels
```
# Consul

1、查询当前集群下拥有的datacenter信息
```
consul members -wan
```
# Node.js

1、nodejs 更新
```
npm install -g n
n latest
```
2、npm更新
```
npm update
```
# ETCD
1、etcd 删除
指定api版本
```
export ETCDCTL_API=3
```
查询所有的key
```
etcdctl get / --prefix --keys-only
```
查找要删除的key
```
etcdctl get / --prefix --keys-only |grep 备品备件
```
按照key删除
```
etcdctl del /cmdb/hsirrfw/apps/备品备件
```
# Golang
1、go mod获取最新commit
```
go get github.com/jiankunking-interx/osin@75f6b6f1f2f8ad9472c1a209e91625bef7f57cc3
```