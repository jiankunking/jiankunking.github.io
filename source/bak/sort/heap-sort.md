---
title: 堆排序
abbrlink: 2894
date: 2014-01-08 09:42:30
categories:
  - Algorithm
tags:
  - Algorithm
  - Sort
---

> 堆排序含义及代码示例

<!-- more -->

# 代码示例

```
using System;
using System.Collections;

namespace Sort
{
    public class HeapSorter
    {
        public static int[] Sort(int[] sortArray)
        {
            BuildMaxHeap(sortArray);
            for (int i = (sortArray.Length - 1); i > 0; i--)
            {
            	// 将堆顶元素和无序区的最后一个元素交换
                Swap(ref sortArray[0], ref sortArray[i]); 
                // 将新的无序区调整为堆，无序区在变小 
                MaxHeapify(sortArray, 0, i);            
            }
            return sortArray;
        }

        /// <summary>
        /// 初始大根堆，自底向上地建堆
        /// 完全二叉树的基本性质，最底层节点是 n/2，所以从 sortArray.Length / 2 开始
        /// </summary>
        private static void BuildMaxHeap(int[] sortArray)
        {
            for (int i = (sortArray.Length / 2) - 1; i >= 0; i--)
            {
                MaxHeapify(sortArray,i, sortArray.Length);
            }
        }

        /// <summary>
        /// 将指定的节点调整为堆
        /// </summary>
        /// <param name="i">需要调整的节点</param>
        /// <param name="heapSize">堆的大小，也指数组中无序区的长度</param>
        private static void MaxHeapify(int[] sortArray, int i, int heapSize)
        {
            int left = 2 * i + 1; // 左子节点
            int right = 2 * i + 2; // 右子节点
            int larger = i; // 临时变量，存放大的节点值
            // 比较左子节点
            if (left < heapSize && sortArray[left] > sortArray[larger])
            {
                larger = left;
            }
            // 比较右子节点
            if (right < heapSize && sortArray[right] > sortArray[larger])
            {
                larger = right;
            }
            // 如有子节点大于自身就交换，使大的元素上移。
            if (i != larger)
            {
                Swap(ref sortArray[i], ref sortArray[larger]);
                MaxHeapify(sortArray, larger, heapSize);
            }
        }

        //数组内元素互换
        private static void Swap(ref int a, ref int b)
        {
            int t;
            t = a;
            a = b;
            b = t;
        }

    }
}
```

# 思想
堆排序的思想：利用大顶堆(小顶堆)堆顶记录的是最大关键字(最小关键字)这一特性，使得每次从无序中选择最大记录(最小记录)变得简单。

其基本思想为(大顶堆)：

1)将初始待排序关键字序列(R1,R2....Rn)构建成大顶堆，此堆为初始的无序区；

2)将堆顶元素R[1]与最后一个元素R[n]交换，此时得到新的无序区(R1,R2,......Rn-1)和新的有序区(Rn),且满足R[1,2...n-1]<=R[n];

3)由于交换后新的堆顶R[1]可能违反堆的性质，因此需要对当前无序区(R1,R2,......Rn-1)调整为新堆，然后再次将R[1]与无序区最后一个元素交换，得到新的无序区(R1,R2....Rn-2)和新的有序区(Rn-1,Rn)。不断重复此过程直到有序区的元素个数为n-1，则整个排序过程完成。

操作过程如下：

1)初始化堆：将R[1..n]构造为堆；

2)将当前无序区的堆顶元素R[1]同该区间的最后一个记录交换，然后将新的无序区调整为新的堆。

因此对于堆排序，最重要的两个操作就是构造初始堆和调整堆，其实构造初始堆事实上也是调整堆的过程，只不过构造初始堆是对所有的非叶节点都进行调整。
