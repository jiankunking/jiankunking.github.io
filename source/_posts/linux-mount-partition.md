---
title: Linux 磁盘分区、挂载
categories:
  - Linux
tags:
  - Linux
  - Mount
  - Partition
  - 原创
abbrlink: 20473
date: 2020-02-26 15:47:16
---

Linux 磁盘分区、挂载

<!-- more -->

查看已挂账的磁盘

```
df -hl /*
```

查看分区

```
fdisk -l
```

分区指定文件系统（会格式化）
```
mkfs.xfs -f /dev/vdb
```
挂载
```
mount /dev/vdb /data
```


**以上挂载重启后失效**

查看挂载结果
```
df -TH
```
blkid 磁盘分区，查询磁盘分区的UUID。
```
blkid /dev/vdb
```

vim编辑/etc/fstab
```
UUID=37aeb018-9dfd-412f-81c1-583f1eb1189f /data                   xfs     defaults        0 2
```

lsblk 查看分区和磁盘