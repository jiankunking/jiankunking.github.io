---
title: ElasticSearch的一些限制
date: 2021-12-22 19:38:21
categories:
  - ElasticSearch
tags:
  - ElasticSearch
  - 限制
  - 原创
---

1、 数组字段，数组大小无限制。
[There is no hard limit but it's definitely recommended to keep those arrays "reasonable". When performing an update, Elasticsearch needs to fetch the entire doc, apply the update, then index the updated document and replicate the entire updated document to the replica, so very large arrays would come with a performance penalty indeed.](https://discuss.elastic.co/t/what-are-the-limitations-of-array-size-in-elastic-search/108413)

2、 文档大小限制：2GB

Given that the default http.max_content_length is set to 100MB, Elasticsearch will refuse to index any document that is larger than that. You might decide to increase that particular setting, but Lucene still has a limit of about 2GB.

https://stackoverflow.com/questions/28841221/what-is-the-maximum-elasticsearch-document-size/28841656#28841656

https://www.elastic.co/guide/en/elasticsearch/reference/current/general-recommendations.html

3、单字段大小限制

未找到资料，感觉整个文档不超就好