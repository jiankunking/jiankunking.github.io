---
title: 选择排序
abbrlink: 21851
date: 2014-01-08 09:42:39
categories:
  - Algorithm
tags:
  - Algorithm
  - Sort
---

> 选择排序含义及代码示例

<!-- more -->

# 代码示例

```
using System;
 
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Sort
{
    class SelectSorter
    {
        public static int[] Sort(int[] a)
        {
            SelectSort(a);
            return a;
        }

        private static void SelectSort(int[] myArray)
        {
            int i, j, smallest;
            //数据起始位置，从0到倒数第二个数据
            for (i = 0; i < myArray.Length - 1; i++)
            {
                smallest = i;//记录最小数据的下标
                for (j = i + 1; j < myArray.Length; j++)
                {
                    //在剩下的数据中寻找最小数据
                    if (myArray[j] < myArray[smallest])
                    {
                        smallest = j;//如果有比它更小的，记录下标
                    }
                }
                //将最小数据和未排序的第一个数据交换
                Swap(ref myArray[i], ref myArray[smallest]);
            }
        }

        private static void Swap(ref int left, ref int right)
        {
            int temp;
            temp = left;
            left = right;
            right = temp;
        }

    }
}
```

# 思想
![](/images/select-sort/1.png)

# 例子
![](/images/select-sort/2.png)