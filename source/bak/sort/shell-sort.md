---
title: 希尔排序
abbrlink: 17105
date: 2014-01-08 09:42:41
categories:
  - Algorithm
tags:
  - Algorithm
  - Sort
---

> 希尔排序含义及代码示例

<!-- more -->

# 代码示例

```
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
namespace Sort
{
    class ShellSorter
    {
        public static int[] Sort(int[] a)
        {
            ShellSort(a);
            return  a;
        }

        public static void ShellSort(int[] myArray)
        {
            int i, j, increment;
            int temp;
            for (increment = myArray.Length / 2; increment > 0; increment /= 2)
            {
                for (i = increment; i < myArray.Length; i++)
                {
                    temp = myArray[i];
                    for (j = i; j >= increment; j -= increment)
                    {
                        if (temp < myArray[j - increment])
                            myArray[j] = myArray[j - increment];
                        else
                            break;
                    }
                    myArray[j] = temp;
                }
            }
        }

    }
}
```

# 思想
希尔排序是对直接插入排序算法的改进，其主要思想是：先将整个排序数列分割成为若干个子序列，在子序列分别进行直接插入排序，待整个数列基本有序时再对全部进行一次直接插入排序。以此来形成新的有序数列。一般分割方法是两个元素相距d=n/2,n/4,n/8……以此类推。

1.基本思想：
把整个待排序的数据元素分成若干个小组，对同一小组内的数据元素用直接插入法排序；小组的个数逐次缩小，当完成了所有数据元素都在一个组内的排序后排序过程结束。

2.技巧：
小组的构成不是简单地“逐段分割”，而是将相隔某个增量dk的记录组成一个小组,让增量dk逐趟缩短（例如依次取5,3,1），直到dk＝1为止。

3.优点：
让关键字值小的元素能很快前移，且序列若基本有序时，再用直接插入排序处理，时间效率会高很多。

# 例子

## 例一
![](/images/shell-sort/1.png)
![](/images/shell-sort/2.png)

## 例二

![](/images/shell-sort/3.png)


对于插入排序算法来说，如果原来的数据就是有序的，那么数据就不需要移动，而插入排序算法的效率主要消耗在数据的移动中。因此可知：如果数据的本身就是有序的或者本身基本有序，那么效率就会得到提高。

# 复杂度

# 稳定性

不稳定



