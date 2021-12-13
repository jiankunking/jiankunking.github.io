---
title: '[译]ElasticSearch中如何处理关联数据？'
categories:
  - ElasticSearch
tags:
  - ElasticSearch
  - Nested
  - Parent/Child
  - Denormalization
  - 翻译
abbrlink: 15549
date: 2021-12-11 17:47:59
---

Inner Object、Nested、Parent/Child、Denormalization
<!-- more -->

现实世界中的数据很少是简单的--通常情况下，数据之间有着错综复杂的联系。

你如何在 Elasticsearch 中表示关系数据？ 有几种机制可用于提供关系支持。 每个都有其优点和缺点，使它们适用于不同的情况。

# Inner Objects

最简单的机制被命名为“内部对象”。 它们是嵌入在父文档中的JSON对象：
```
{
    "name": "Zach",
    "car": {
        "make": "Saturn",
        "model": "SL"
    }
}
```

简单吧?“car”字段是一个JSON对象，内部对象有两个属性(“make”和“model”)。只要根对象和内部对象之间有一对一的关系，这个内部对象映射就可以工作。每个人最多有一辆“车”。

但如果Zach有两辆车，而另一个人Bob只有一辆车呢?
```
{
    "name": "Zach",
    "car": [
        {
            "make": "Saturn",
            "model": "SL"
        },
        {
            "make": "Subaru",
            "model": "Imprezza"
        }
    ]
}
{
	"name": "Bob",
	"car": [
		{
			"make": "Saturn",
			"model": "Imprezza"
		}
	]
}
```

忽略Saturn未制造过Imprezza汽车的事实，当我们搜索它时会发生什么?逻辑上，只有Bob有一个“Saturn Imprezza”，所以我们应该能够执行如下查询:
```
query: car.make=Saturn AND car.model=Imprezza
```

这样对吗？如果执行该查询，您将搜到两个文档。Elasticsearch在内部将inner objects打平成单个对象。所以Zach's的实体实际上是这样的:
```
{
    "name": "Zach",
    "car.make": [
        "Saturn",
        "Subaru"
    ],
    "car.model": [
        "SL",
        "Imprezza"
    ]
}
```

这就解释了为什么会搜索到两条数据。Elasticsearch本质上是扁平的，因此在内部文档被表示为扁平化的字段。

# Nested

作为内部对象的替代方案，Elasticsearch提供了[“嵌套类型”](https://www.elastic.co/guide/en/elasticsearch/reference/current/nested.html)的概念。 嵌套文档在文档级别看起来与内部对象相同，但提供了我们上面缺少的功能（以及一些限制）。

嵌套文档示例：
```
{
    "name": "Zach",
    "car": [
        {
            "make": "Saturn",
            "model": "SL"
        },
        {
            "make": "Subaru",
            "model": "Imprezza"
        }
    ]
}
```

在mapping级别，必须显式声明嵌套类型（与自动检测的内部对象不同）：
```
{
    "person": {
        "properties": {
            "name": {
                "type": "string"
            },
            "car": {
                "type": "nested"
            }
        }
    }
}
```

内部对象的问题是，每个嵌套的JSON对象没有被视为文档的独立部分。相反，它们将内部对象相同属性名对应的属性进行合并。

而嵌套文档则不是这样。每个嵌套的文档保持独立，您可以执行一个查询，比如:
```
car.make=Saturn AND car.model=Imprezza
```
这样就不会有问题了。


Elasticsearch 从根本上来说仍然是扁平的，但它在内部管理嵌套关系。当您创建嵌套文档时，Elasticsearch实际上索引两个单独的文档（根对象和嵌套对象），然后在内部将两者关联起来。 两个文档都存储在同一个Shard上的同一个Lucene块中，因此读取性能仍然非常快。

这种安排确实有一些缺点。 最明显的是，您只能使用特殊的“嵌套查询”访问这些嵌套文档。

由于所有的文档都存储在同一个Lucene块中，Lucene从不允许对它的段进行随机的写，更新嵌套文档中的一个字段将强制对整个文档进行重新索引。

这包括根对象和任何其他嵌套对象，即使它们没有被修改。在内部，ES将旧文档标记为已删除，更新字段，然后将所有内容重新索引到一个新的Lucene块中。如果您的数据经常更改，那么嵌套文档reindexing开销将不可忽略。

最后，不可能在嵌套文档之间“交叉引用”。一个嵌套文档不能“看到”另一个嵌套文档的属性。例如，您不能过滤“A.name”，但可以过滤“B.age”上的facet。你可以通过使用'include_in_root'来解决这个问题，它有效地将嵌套的文档复制到根目录中，但这让你回到了内部对象的问题。

# Parent/Child

Elasticsearch 提供的最后一个方法是[父/子类型](https://www.elastic.co/guide/en/elasticsearch/reference/current/parent-join.html)。 该方案比嵌套的耦合更松散，并为您提供一组稍微强大的查询。 让我们看一个例子，其中一个人有多个家（在不同的州）。 parent的映射，比如：
```
{
    "mappings": {
        "person": {
            "name": {
                "type": "string"
            }
        }
    }
}
```

children拥有自己的映射，但具有特殊的`_parent`属性：
```
{
    "homes": {
        "_parent": {
            "type": "person"
        },
        "state": {
            "type": "string"
        }
    }
}
```

`_parent`字段告诉 Elasticsearch “homes”类型是“人员”person的子代。 向该方案添加文档非常容易。 父文档正常索引：

```
$ curl -XPUT localhost:9200/test/person/zach/ -d'
{
    "name": "Zach"
}
```
并且索引子文档几乎和正常一样，除了您需要在查询参数中指定这个子文档属于哪个父文档（在本例中为“zach”，这是我们在上述文档中使用的 ID）：
```
$ curl -XPOST localhost:9200/test/homes?parent=zach -d'
{
    "state": "Ohio"
}
$ curl -XPOST localhost:9200/test/homes?parent=zach -d'
{
    "state": "South Carolina"
}
```

这两个文档现在都与“zach”父文档相关联，这允许您使用特殊查询，例如：
* [Has Parent Filter/Has Parent Query](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-has-parent-query.html), 它适用于父文档并返回子文档。
* [Has Child Filter/Has Child Query](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-has-child-query.html), 适用于子文档并返回父文档。

您可以单独查询父类型或子类型，因为它们是一级类型并且会像普通查询一样响应（只是不能使用关系值）。

Nested的一个大问题是它们的存储：所有东西都存储在同一个Lucene块中。父/子通过分离两个文档并仅将它们松散耦合来消除此限制。这有一些优点和缺点。松散耦合意味着您可以更自由地更新/删除子文档，因为它们对父文档或其他子文档没有影响。

Nested的一个大问题是它们的存储:所有内容都存储在同一个Lucene块中。Parent/Child通过分离两个文档并松散耦合它们来消除这种限制。这样做有利有弊。松散耦合意味着你可以更自由地更新/删除子文档，因为它们对父文档或其他子文档没有影响。

缺点是Parent/Child的性能略低于嵌套。子文档被路由到与父文档相同的shard，所以它们仍然受益于shard级别的缓存和内存过滤。但是它们没有嵌套的那么快，因为它们不在同一个Lucene块中。还有一点内存开销，因为ElasticSearch需要在内存中保留一个“连接表”，用于管理关系。

最后，坦率地说，您将遇到排序或评分非常困难的情况。例如，不可能知道哪个子文档匹配您的'Has_Child'过滤器，只知道返回的父文档中的一个文档匹配了条件。这可能会令人沮丧，这取决于您的用例。

# Denormalization

有时最好的选择是在适当的地方简单地对数据进行反规范化。Elasticsearch提供的关系工具非常适合某些场景……但从来没有打算提供您期望从RDBM中得到的健壮关系特性。

从本质上讲，Elasticsearch是一个扁平的层次结构，试图将关系数据强制放入其中可能非常具有挑战性。有时，最好的解决方案是明智地选择要反规范化的数据，以及可以接受第二个查询来检索子查询的位置。非规范化可以为您提供最大的权力和灵活性。

当然，这也带来了管理开销的负担。您可以管理关系，并执行所需的查询/过滤器来关联各种类型。

# Conclusion and Recap

简单概括一下：
## Inner Object
* 简单,快速,性能
* 仅适用于保持一对一关系时
* 不需要特殊查询

## Nested

* 嵌套文档存储在同一个Lucene块中，这有助于提高读取/查询性能。读取嵌套文档比读取等效的父/子文档要快。
* 更新嵌套文档(父文档或子文档)中的单个字段将迫使ES重新索引整个嵌套文档。对于大型嵌套文档来说，这可能是非常昂贵的
* “交叉引用”嵌套文档是不可能的
* 最适合不经常更改的数据

## Parent/Child

* 子节点与父节点分开存储，但是被路由到相同的碎片。因此，parent/children在读/查询方面的性能略低于嵌套
* 父/子映射有一点额外的内存开销，因为ES在内存中维护一个“连接”列表
* 更新子文档不会影响父文档或任何其他子文档，这可能会节省大量大型文档的索引
* Parent/Child的排序/评分可能很困难，因为Has Child/Has Parent操作有时是不透明的

## Denormalization

* 你可以自己管理所有的关系!
* 最灵活、管理开销最大
* 可能是更多或更少的性能取决于您的设置


原文地址：https://www.elastic.co/cn/blog/managing-relations-inside-elasticsearch