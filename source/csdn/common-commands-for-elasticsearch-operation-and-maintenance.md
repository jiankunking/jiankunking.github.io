---
title: Elasticsearch 常用命令
abbrlink: 2539
date: 2021-02-05 16:04:53
categories:
  - ElasticSearch
tags:
  - ElasticSearch
  - 原创
---

> Elasticsearch 常用命令

<!-- more -->

* _reindex

```
curl --location --request POST 'http://10.138.25.214:9200/_reindex' \
--header 'Content-Type: application/json' \
--data-raw '{
  "source": {
    "index": "deploy-log"
  },
  "dest": {
    "index": "deploy-log-2018.12.24"
  }
}'
```

* 创建index

```
curl --location --request PUT 'http://10.138.25.214:9200/deploy-log'
```

* 创建mapping

```
curl --location --request POST 'http://10.138.25.214:9200/deploy-log/deploy_log' \
--header 'Content-Type: application/javascript' \
--data-raw '{
    "settings":{
        "number_of_shards":5,
        "number_of_replicas":1
    },
    "mappings":{
        "deploy_log":{
            "properties":{
                "project":{
                    "type":"keyword",
                    "index":"not_analyzed"
                },
                "app":{
                    "type":"string",
                    "index":"not_analyzed"
                },
                "endpoint":{
                    "type":"ip"
                },
                "containerName":{
                    "type":"string",
                    "index":"not_analyzed"
                },
                "timestamp":{
                    "type":"long"
                },
                "message":{
                    "type":"text"
                }
            }
        }
    }
}'
```

* 删除index

```
curl --location --request DELETE 'http://10.133.0.87:9200/.kibana_1'
```

* _termvectors

```
curl --location --request GET 'http://10.138.25.214:9200/deploy-log/deploy_log/AWfK6rkZ_ashmo4ko1yd/_termvectors?fields=containerName'
```

* index插入内容

```
curl --location --request POST 'http://10.163.204.193:9200/logstash-2020.10.27/deploy_log' \
--header 'Content-Type: application/javascript' \
--data-raw '{
    "project":"monitor",
    "app":"elasticsearch1111",
    "env":"dev",
    "containerName":"monitor1545302038695",
    "endpoint":"10.138.40.223",
    "timestamp":1545302038,
    "message":"image: hub.docker.terminus.io:5000/es-ext:log-search_1811301023_PRO_180410"
}'
```

* mapping删除

```
curl --location --request DELETE 'http://10.138.25.214:9200/deploy-log/deploy_log/_mapping'
```

* _template删除

```
curl --location --request DELETE 'http://10.138.25.214:9200/_template/d*'
```

* 查询_template

```
curl --location --request GET 'http://10.138.25.214:9201/_template?pretty'
```

* indices

```
curl --location --request GET 'http://10.138.16.190:9200/_cat/indices?v'
```

* allocate_replica(reroute)

```
curl --location --request POST 'http://10.163.204.80:9200/_cluster/reroute?retry_failed=true' \
--header 'Content-Type: application/json' \
--data-raw '{
    "commands":[
        {
            "allocate_replica":{
                "index":".kibana_1",
                "shard":0,
                "node":"10.163.204.80"
            }
        }
    ]
}'
```

* cluster.routing.allocation.enable

```
curl --location --request PUT 'http://10.138.16.188:9200/_cluster/settings' \
--header 'Content-Type: application/json' \
--data-raw '{
    "transient":{
        "cluster.routing.allocation.enable":"all"
    }
}'
```

* template更新(新增)

6.x

```
curl --location --request PUT 'http://10.163.204.193:9200/_template/k8s-log-template2222' \
--header 'Content-Type: application/json' \
--data-raw '{
	"order": 0,
	"index_patterns": [
		"logstash-*"
	],
	"settings": {
		"index": {
			"number_of_shards": "12",
			"number_of_replicas": "1",
			"translog.durability": "async",
			"translog.flush_threshold_size": "1024mb",
			"translog.sync_interval": "120s",
			"refresh_interval": "120s"
		}
	},
	"mappings": {
		"_default_": {
			"_all": {
				"enabled": false
			},
			"dynamic_templates": [
				{
					"strings_as_keywords": {
						"mapping": {
							"type": "keyword"
						},
						"match_mapping_type": "string",
						"unmatch": "log"
					}
				},
				{
					"log": {
						"match": "log",
						"match_mapping_type": "string",
						"mapping": {
							"type": "text",
							"analyzer": "standard",
							"norms": false
						}
					}
				}
			]
		}
	},
	"aliases": {}
}'
```

7.x

```
curl --location --request PUT 'http://10.163.204.193:9200/_template/k8s-log-template2222' \
--header 'Content-Type: application/json' \
--data-raw '{
	"order": 0,
	"index_patterns": [
		"logstash-*"
	],
	"settings": {
		"index": {
			"number_of_shards": "12",
			"number_of_replicas": "1",
			"refresh_interval": "30s"
		}
	},
	"mappings": {
		"dynamic_templates": [
			{
				"strings_as_keywords": {
					"unmatch": "log",
					"mapping": {
						"type": "keyword"
					},
					"match_mapping_type": "string"
				}
			},
			{
				"log": {
					"mapping": {
						"norms": false,
						"analyzer": "standard",
						"type": "text"
					},
					"match_mapping_type": "string",
					"match": "log"
				}
			},
			{
				"@timestamp": {
					"mapping": {
						"type": "date"
					},
					"match_mapping_type": "date",
					"match": "@timestamp"
				}
			}
		]
	},
	"aliases": {}
}'
```

* 查询_mapping

```
curl --location --request GET 'http://10.133.0.87:9200/logstash-2019.12.04/_mapping'
```

* 修改indices.breaker.fielddata.limit

```
curl --location --request PUT 'http://10.133.0.89:9200/_cluster/settings' \
--header 'Content-Type: application/json' \
--data-raw '{
    "persistent":{
        "indices.breaker.fielddata.limit":"75%"
    }
}'
```

* 清理cache

```
curl --location --request POST 'http://10.133.0.89:9200/logstash-*/_cache/clear?fields=*'
```

* 查询_cluster/settings

```
curl --location --request GET 'http://10.133.0.89:9200/_cluster/settings'
```

* 修改indices.breaker.total.limit

```
curl --location --request PUT 'http://10.133.0.89:9200/_cluster/settings' \
--header 'Content-Type: application/json' \
--data-raw '{
    "transient":{
        "indices.breaker.total.limit":"80%"
    }
}'
```

* 修改max_shards_per_node

```
curl --location --request PUT 'http://10.163.204.80:9200/_cluster/settings' \
--header 'Content-Type: application/json' \
--data-raw '{
  "persistent": {
    "cluster": {
      "max_shards_per_node":10000
    }
  }
}'
```

* remote cluster info

```
curl --location --request GET 'http://10.133.0.86:9201/_remote/info' \
--header 'Authorization: Basic ZWxhc3RpYzplbGFzdGlj'
```

* 修改索引number_of_replicas

```
curl --location --request PUT 'http://10.163.204.80:9200/security-tracelogdev-20200223/_settings' \
--header 'Content-Type: application/json' \
--data-raw '{
    "index" : {
        "number_of_replicas" : 0
    }
}'
```

* allocation.exclude._ip节点下线

```
curl --location --request PUT 'http://10.163.204.80:9200/_cluster/settings' \
--header 'Content-Type: application/json' \
--data-raw '{
  "transient" : {
    "cluster.routing.allocation.exclude._ip" : "10.163.204.81,10.163.204.82"
  }
}'
```

* shard移动到某个节点(reroute)

```
curl --location --request POST 'http://10.163.204.80:9200/_cluster/reroute?retry_failed=true' \
--header 'Content-Type: application/json' \
--data-raw '{
	"commands": [
		{
			"move": {
				"index": "security-tracelogdev-20200223",
				"shard": 2,
				"from_node": "10.163.204.81",
				"to_node": "10.163.204.80"
			}
		}
	]
}'
```

* 调整refresh_interval

```
curl --location --request PUT 'http://10.163.204.193:9200/logstash-2020.09.24/_settings' \
--header 'Content-Type: application/json' \
--data-raw '{
	"refresh_interval": "10s"
}'
```

* 修改disk.watermark.high

```
curl --location --request PUT 'http://10.163.204.193:9200/_cluster/settings' \
--header 'Content-Type: application/json' \
--data-raw '{
    "persistent" : {
        "cluster.routing.allocation.disk.watermark.low":"90%",
        "cluster.routing.allocation.disk.watermark.high" : "95%"
    }
}'
```

* 修改recovery相关配置

```
curl --location --request PUT 'http://10.163.204.193:9201/_cluster/settings' \
--header 'Content-Type: application/json' \
--data-raw '{
	"persistent": {
		"indices.recovery.max_bytes_per_sec": "40mb",
		"cluster.routing.allocation.node_concurrent_recoveries": "2"
	}
}'
```

* 查看某个节点的thread_pool状态

```
curl --location --request GET 'http://10.163.204.193:9200/_nodes/10.163.204.193-node1/stats/thread_pool?human&pretty'
```

* es集群thread_pool write状态

```
curl --location --request GET 'http://10.163.204.193:9200/_cat/thread_pool/write?v&h=node_name,ip,name,type,active,size,queue,queue_size,largest,rejected,completed&pretty'
```

* 查看集群indices缓存信息

```
curl --location --request GET 'http://10.162.166.136:9201/_cluster/settings?include_defaults&flat_settings&local&filter_path=defaults.indices*'
```

* 索引关闭

```
curl --location --request POST 'http://10.162.166.45:9201/hmcenter-*/_close'
```

* 索引打开

```
curl --location --request POST 'http://10.162.166.45:9201/console*/_open'
```

* es写入速度调优

```
curl --location --request PUT 'http://10.163.204.193:9200/logstash-2021.01.11/_settings' \
--header 'Content-Type: application/json' \
--data-raw '{
  "index" : {
    "translog.durability" : "async",
    "translog.flush_threshold_size" : "1024mb",
    "translog.sync_interval" : "120s"
  }
}'
```

* 查询_ingest/pipeline

```
curl --location --request GET 'http://10.163.204.193:9200/_ingest/pipeline'
```

* 集群read_only_allow_delete

```
curl --location --request PUT 'http://10.133.0.84:9200/_settings' \
--header 'Content-Type: application/json' \
--data-raw '{
    "index": {
        "blocks": {
            "read_only_allow_delete": "false"
        }
    }
}'
```

* 查看索引_settings

```
curl --location --request GET 'http://10.163.204.193:9200/.monitoring-es-6-2021.01.27/_settings?pretty'
```

* 索引read_only_allow_delete

```
curl --location --request PUT 'http://10.163.204.193:9200/.monitoring-es-6-2021.01.28/_settings' \
--header 'Content-Type: application/json' \
--data-raw '{
    "index": {
        "blocks": {
            "read_only_allow_delete": "false"
        }
    }
}'
```

* 查询_cluster/stats

```
curl --location --request GET 'http://10.163.204.193:9200/_cluster/stats'
```

* 查看集群_nodes/hot_threads

```
curl --location --request GET 'http://10.163.204.193:9200/_nodes/hot_threads'
```

* 查询某个节点的hot_threads

```
curl --location --request GET 'http://10.163.204.193:9200/_nodes/10.163.204.193/hot_threads'
```

* 某个节点的stats/thread_pool

```
curl --location --request GET 'http://10.163.204.193:9200/_nodes/10.163.204.193/stats/thread_pool?human&pretty'
```

* 查看某个模板

```
curl --location --request GET 'http://10.163.204.193:9200/_template/.monitoring-es?pretty'
```

* 索引备份
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
* es重启
先kill 杀死es
```
sh bin/elasticsearch -d
```
* elasticsearch 查看集群所有设置（包含默认的）
```
http://10.138.1.1:9200/_cluster/settings?include_defaults=true
```
* elasticsearch设置密码
```
./bin/elasticsearch-setup-passwords interactive
```
* 查看es集群恢复情况
```
http://10.138.1.1:9200/_cluster/allocation/explain?pretty
```