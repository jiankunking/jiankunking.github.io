---
title: 鸡尾酒排序（双冒泡排序、搅拌排序或涟漪排序）
categories:
  - Algorithm
tags:
  - Algorithm
  - Sort
abbrlink: 417
date: 2014-01-08 09:42:28
---

> 鸡尾酒排序含义及代码示例

<!-- more -->

# 代码示例

```
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Sort
{
    class CockTailSorter
    {
        private static int[] myArray;
        private static int arraySize;

        public static int[] Sort(int[] myArray)
        {
            arraySize = myArray.Length;
            CockTailSort(myArray);
            return myArray;
        }

        public static void CockTailSort(int[] myArray)
        {
            int low, up, index, i;
            low = 0;//数组起始索引
            up = myArray.Length - 1;//数组索引最大值
            index = low;//临时变量
            //判断数组中是否有多个元素
            while (up > low)//每一次进入while循环都会找出相应范围内最大最小的元素并分别放到相应的位置
            {
                //进入该for循环会将索引限定范围内最大的元素放到最右边
                for (i = low; i < up; i++)//从上向下扫描
                {
                    if (myArray[i] > myArray[i + 1])
                    {
                        Swap(ref myArray[i], ref myArray[i + 1]);
                        index = i;//记录当前索引
                    }
                }
                up = index;//记录最后一个交换的位置
                //进入该for循环会将索引限定范围内最小的元素放到最左边
                for (i = up; i > low; i--)//从最后一个交换位置从下往上扫描
                {
                    if (myArray[i] < myArray[i - 1])
                    {
                        Swap(ref myArray[i], ref myArray[i - 1]);
                        index = i;
                    }
                }
                low = index;//记录最后一个交换的位置
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
鸡尾酒排序等于是冒泡排序的轻微变形。不同的地方在于从低到高然后从高到低，而冒泡排序则仅从低到高去比较序列里的每个元素。他可以得到比冒泡排序稍微好一点的效能，原因是冒泡排序只从一个方向进行比对(由低到高)，每次循环只移动一个项目。

使用鸡尾酒排序，数组中的数字本是无规律的排放，先找到最小的数字，把他放到第一位，然后找到最大的数字放到最后一位。然后再找到第二小的数字放到第二位，再找到第二大的数字放到倒数第二位。以此类推，直到完成排序。