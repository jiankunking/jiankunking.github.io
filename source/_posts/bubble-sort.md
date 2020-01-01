---
layout: w
title: 冒泡排序
date: 2014-01-08 09:42:26
categories:
  - Algorithm
tags:
  - Algorithm
  - Sort
---

> 冒泡排序含义及代码示例

<!-- more -->


# 代码实例

```
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Sort
{
    class BubbleSorter
    {
        public static int[] Sort(int[] a)
        {
            BubbleSort(a);
            return a;
        }

        private static void BubbleSort(int[] myArray)
        {
            for (int i = 0; i < myArray.Length; i++)//循环的趟数
            {
                for (int j = 0; j < myArray.Length - 1- i; j++)//每次循环的次数
                {
                    //比较相邻元素，将值大的后移==》每一趟循环结束==》最后一个数是最大的。
                    //所以每次循环都比上一次循环的个数少1，即j < myArray.Length - 1- i
                    if (myArray[j] > myArray[j + 1])
                    {
                        Swap(ref myArray[j], ref myArray[j + 1]);
                    }
                }
            }
        }

        //引用参数与值参数
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

# 冒泡

冒泡排序算法：

1. 比较相邻的元素。如果第一个比第二个大，就交换他们两个。
2. 对每一对相邻元素作同样的工作，从开始第一对到结尾的最后一对。在这一点，最后的元素应该会是最大的数。==》最后一个数就不需要比较了，因为它就是最大的。
3. 针对所有的元素重复以上的步骤，除了最后一个。
4. 持续每次对越来越少的元素重复上面的步骤，直到没有任何一对数字需要比较。