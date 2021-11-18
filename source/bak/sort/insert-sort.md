---
title: 插入排序
abbrlink: 39378
date: 2014-01-08 09:42:35
categories:
  - Algorithm
tags:
  - Algorithm
  - Sort
---

> 插入排序含义及代码示例

<!-- more -->

# 代码示例

```
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Sort
{
    class InsertSorter
    {
        public static int[] Sort(int[] a)
        {
            InsertSort(a);
            return a;
        }

        private static void InsertSort(int[] myArray)
        {
            int i, j,temp;            
            for (i = 1; i < myArray.Length; i++)
            {
            	//保存当前数据，当前数据即待插入的数据 
                temp = myArray[i];       
                //将数组标号i及i之前的元素，排成递增序列
                for (j = i - 1; j >= 0 && myArray[j] >temp; j--)
                {
                    myArray[j + 1] = myArray[j];               
                }
                myArray[j + 1] = temp;
            }
	 	}

    }
}
```

# 插入
![](/images/insert-sort/1.jpg)

# 例子
## 例一

关键字序列T=（13，6，3，31，9，27，5，11） 请写出直接插入排序的中间过程序列。

【13】, 6, 3, 31, 9, 27, 5, 11

【6, 13】, 3, 31, 9, 27, 5, 11

【3, 6, 13】, 31, 9, 27, 5, 11

【3, 6, 13，31】, 9, 27, 5, 11

【3, 6, 9, 13，31】, 27, 5, 11

【3, 6, 9, 13，27, 31】, 5, 11

【3, 5, 6, 9, 13，27, 31】, 11

【3, 5, 6, 9, 11，13，27, 31】

> 小注：每次小循环只排列数组0到i这些元素的顺序（与冒泡类似）

## 例二
![](/images/insert-sort/2.png)
![](/images/insert-sort/3.png)
![](/images/insert-sort/4.png)

## 例三
![](/images/insert-sort/5.jpg)

# 复杂度
在最坏情况下，数组完全逆序，插入第2个元素时要考察前1个元素，插入第3个元素时，要考虑前2个元素，……，插入第N个元素，要考虑前 N - 1 个元素。因此，最坏情况下的比较次数是 1 + 2 + 3 + ... + (N - 1)，等差数列求和，结果为 N^2 / 2，所以最坏情况下的复杂度为 O(N^2)。

最好情况下，数组已经是有序的，每插入一个元素，只需要考查前一个元素，因此最好情况下，插入排序的时间复杂度为O(N)。

插入排序的空间复杂度是O(1)，因为在插入排序的时候，只需要使用一个额外的空间，来存储这个“拿出来”的元素，所以插入排序只需要额外的一个空间来做排序。

空间复杂度(Space Complexity)是对一个算法在运行过程中临时占用存储空间大小的量度。

由于是数组内部自己排序，把后面的部分按前后顺序一点点的比较、移动，可以保持相对顺序不变，所以插入排序是稳定的排序算法。

