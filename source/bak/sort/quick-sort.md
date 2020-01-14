---
title: 快速排序
abbrlink: 14875
date: 2014-01-08 09:42:37
categories:
  - Algorithm
tags:
  - Algorithm
  - Sort
---

> 快速排序含义及代码示例

<!-- more -->

# 代码示例

```
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Sort
{
    class QuickSorter
    {
        private static int[] myArray;
        private static int arraySize;

        public static int[] Sort(int[] a)
        {
            arraySize = a.Length;
            QuickSort(a, 0,arraySize- 1);
	    	return a;
        }

        private static void QuickSort(int[] myArray, int left, int right)
        {
            int i, j, s;
            if (left < right)
            {
                i = left - 1;
                j = right + 1;
                s = myArray[(i + j) / 2];
                while (true)
                {
                    while (myArray[++i] < s) ;
                    while (myArray[--j] > s) ;
                    if (i >= j)
                        break;
                    Swap(ref myArray[i], ref myArray[j]);
                }
                QuickSort(myArray, left, i - 1);
                QuickSort(myArray, j + 1, right);
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
快速排序的思想：
设要排序的数组是A[0]……A[N-1]，首先任意选取一个数据（通常选用数组的第一个数）作为关键数据，然后将所有比它小的数都放到它前面，所有比它大的数都放到它后面，这个过程称为一趟快速排序。值得注意的是，快速排序不是一种稳定的排序算法，也就是说，多个相同的值的相对位置也许会在算法结束时产生变动。
一趟快速排序的算法是：
1）设置两个变量i、j，排序开始的时候：i=0，j=N-1；
2）以第一个数组元素作为关键数据，赋值给key，即key=A[0]；
3）从j开始向前搜索，即由后开始向前搜索(j--)，找到第一个小于key的值A[j]，将值为key的项与A[j]交换；
4）从i开始向后搜索，即由前开始向后搜索(i++)，找到第一个大于key的A[i]，将值为key的项与A[i]交换；
5）重复第3步
6）重复第3、4、5步，直到i=j； (3,4步中，没找到符合条件的值，即3中A[j]不小于key,4中A[j]不大于key的时候改变j、i的值，使得j=j-1，i=i+1，直至找到为止。找到符合条件的值，进行交换的时候i， j指针位置不变。另外，i==j这一过程一定正好是i+或j-完成的时候，此时令循环结束）。

# 例子
以一个数组作为示例，取区间第一个数为基准数。

|  0   | 1  | 2  | 3  | 4  | 5  | 6  | 7  | 8  | 9  |
|  ----  | ----  |----  |----  |----  |----  |----  |----  |----  |----  |
| 72  | 6 | 57 | 88  | 60 | 42 | 83 | 73 | 48 | 85 |

初始时，i = 0;  j = 9;   X = a[i] = 72

由于已经将a[0]中的数保存到X中，可以理解成在数组a[0]上挖了个坑，可以将其它数据填充到这来。

从j开始向前找一个比X小或等于X的数。当j=8，符合条件，将a[8]挖出再填到上一个坑a[0]中。a[0]=a[8]; i++;  这样一个坑a[0]就被搞定了，但又形成了一个新坑a[8]，这怎么办了？简单，再找数字来填a[8]这个坑。这次从i开始向后找一个大于X的数，当i=3，符合条件，将a[3]挖出再填到上一个坑中a[8]=a[3]; j--; 

数组变为：

|  0   | 1  | 2  | 3  | 4  | 5  | 6  | 7  | 8  | 9  |
|  ----  | ----  |----  |----  |----  |----  |----  |----  |----  |----  |
| 48  | 6 | 57 | 88  | 60 | 42 | 83 | 73 | 88 | 85 |

 i = 3;   j = 7;   X=72

再重复上面的步骤，先从后向前找，再从前向后找。

从j开始向前找，当j=5，符合条件，将a[5]挖出填到上一个坑中，a[3] = a[5]; i++;

从i开始向后找，当i=5时，由于i==j退出。

此时，i = j = 5，而a[5]刚好又是上次挖的坑，因此将X填入a[5]。

数组变为：

|  0   | 1  | 2  | 3  | 4  | 5  | 6  | 7  | 8  | 9  |
|  ----  | ----  |----  |----  |----  |----  |----  |----  |----  |----  |
| 48  | 6 | 57 | 42  | 60 | 72 | 83 | 73 | 88 | 85 |

可以看出a[5]前面的数字都小于它，a[5]后面的数字都大于它。因此再对a[0…4]和a[6…9]这二个子区间重复上述步骤就可以了。