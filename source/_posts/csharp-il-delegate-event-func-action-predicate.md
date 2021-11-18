---
title: '通过IL分析C#中的委托、事件、Func、Action、Predicate之间的区别与联系'
categories:
  - 'C#'
tags:
  - 'C#'
  - Delegate
  - Action
  - Predicate
  - 原创
abbrlink: 52651
date: 2015-05-04 20:47:04
---

一直以来都是对于事件与委托比较混淆，而且不太会用。找了个时间，总结了一下，感觉清晰了很多。

先说一下个人理解的结论吧：

> delegate是C#中的一种类型，它实际上是一个能够持有对某个方法的引用的类。

delegate声明的变量与delegate声明的事件，并没有本质的区别，事件是在delegate声明变量的基础上包装而成的，类似于变量与属性的关系（在IL代码中可以看到每一个delegate声明的事件都对应是私有的delegate声明的变量），提升了安全性。

Action 与Func：这两个其实说白了就是系统定义好的Delegate，他有很多重载的方法，便于各种应用情况下的调用。他在系统的System命名空间下，因此全局可见。

首先了解一下， ILDasm中图标含义：  
![](/images/csharp-delegate/ILDasm.png)
该图来自：http://www.cnblogs.com/zery/p/3366175.html

委托创建步骤：

1. <font color=DeepPink>**用delegate关键字创建一个委托，包括声明返回值和参数类型。**</font>
2. <font color=DeepPink>**使用的地方接收这个委托。**</font>
3. <font color=DeepPink>**创建这个委托的实例并指定一个返回值和参数类型匹配的方法传递过去。**</font>

# 一、事件与委托
新建一个事件委托测试项目：EventDelegateTest。

具体代码如下：
```
namespace EventDelegateTest
{
    public class TestClass
    {
        public delegate int delegateAction();
        public event delegateAction OnActionEvent;
        public delegateAction daNew;
    }
}

```
编译代码后，使用 Visual Studio 2010自带的ILDASM.EXE：
![](/images/csharp-delegate/IL反汇编程序.png)

打开该dll，可以看到如下信息：
![](/images/csharp-delegate/反编译DLL信息.png)

从上图可以看出如下几点信息：
## 1、delegate 
委托 public delegate int delegateAction();在IL中是以类（delegateAction）的形式存在的
.NET将委托定义为一个密封类，派生自基类System.MulticastDelegate，并继承了基类的三个方法:
![](/images/csharp-delegate/delegateAction.png)

## 2、event
public event delegateAction OnActionEvent;在IL中不仅仅对应event OnActionEvent而且还对应一个field OnActionEvent;而field OnActionEvent与 public delegateAction daNew生成的field daNew是一样的.
![](/images/csharp-delegate/OnActionEvent.png)
![](/images/csharp-delegate/daNew.png)
都是以字段（field ）的形式存在的。
双击event OnActionEvent可以看到如下信息：
![](/images/csharp-delegate/event-OnActionEvent.png)

在IL中事件被封装成了包含一个add_前缀和一个remove_前缀的的代码段。
其中，add_前缀的方法其实是通过调用Delegate.Combine()方法来实现的，组成了一个多播委托；remove_就是调用Delegate.Remove()方法，用于移除多播委托中的某个委托。

> 也就是说：事件其实就是一个特殊的多播委托。

那么对于事件进行这一次封装有什么好处呢？
1、因为delegate可以支持的操作非常多，比如我们可以写onXXXChanged += aaaFunc，把某个函数指针挂载到这个委托上面，但是我们也可以简单粗暴地直接写onXXXChanged = aaaFunc，让这个委托只包含这一个函数指针。不过这样一来会产生一个安全问题：如果我们用onXXXChanged = aaaFunc这样的写法，那么会把这个委托已拥有的其他函数指针给覆盖掉，这大概不是定义onXXXChanged的程序员想要看到的结果。

> 小注：虽然事件不能直接=某个函数，也不可以直接=null

![](/images/csharp-delegate/event_not_null.png)

2、还有一个问题就是onXXXChanged这个委托应该什么时候触发（即调用它所包含的函数指针）。从面向对象的角度来说，XXX改变了这个事实（即onXXXChaned的字面含义）应该由包含它的那个对象来决定。但实际上我们可以从这个对象的外部环境调用onXXXChanged，这既产生了安全问题也不符合面向对象的初衷。 
说到这里对于事件与委托的管理算是说明白了，那么平时常用的Action与Func，与委托又有什么关系呢？

# 二、Action 与Func

**Action 委托：封装一个方法，该方法具有参数（0到16个参数）并且不返回值。**
具体形式如下：https://msdn.microsoft.com/zh-cn/library/system.action(v=vs.110).aspx
![](/images/csharp-delegate/Action.png)

**Func<T, TResult> 委托：封装一个具有参数（0到16个参数）并返回 TResult 参数指定的类型值的方法。**
具体形式如下：https://msdn.microsoft.com/zh-cn/library/bb534960(v=vs.110).aspx
![](/images/csharp-delegate/Func_T_TResult.png)

那么这Action与Func是怎么实现的呢？
1、Action（以Action<T1, T2> 委托：封装一个方法，该方法具有两个参数并且不返回值为例）
从微软公布的源码中，可以看到，如下实现：
![](/images/csharp-delegate/Action_T.png)
```
public Action<bool,bool>  ac;
```
上面这个声明就是：该方法具有两个参数并且不返回值的委托。
其余使用方式与委托变量一样。
2、Func（以Func<T1, T2, TResult> 委托：封装一个具有两个参数并返回 TResult 参数指定的类型值的方法为例）
从微软公布的源码中，可以看到，如下实现：
![](/images/csharp-delegate/Func_T_TResult_源码.png)

此处，可以看出Func与Action是类似的，唯一的区别就是，Func必须指定返回值的类型，使用方式与委托咱们自己使用委托变量是一样的，直接使用相应参数的Func或者Action声明变量，=或者+=挂载函数（方法即可）
这两个其实说白了就是系统定义好的Delegate，他有很多重载的方法，便于各种应用情况下的调用。他在系统的System命名空间下，因此全局可见。

# 三、Predicate

**是返回bool型的泛型委托，Predicate有且只有一个参数，返回值固定为bool。表示定义一组条件并确定指定对象是否符合这些条件的方法。**

此方法常在集合（Array 和 List<T>）的查找中被用到，如：数组，正则拼配的结果集中被用到。

官方文档：
https://docs.microsoft.com/zh-cn/dotnet/api/system.predicate-1?redirectedfrom=MSDN&view=netframework-4.8

具体用法demo如下：
```
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Windows.Forms;
 
namespace IconTest
{
    public partial class Form2 : Form
    {
        Predicate<int> myPredicate;
        int[] myNum = new int[8] { 12, 33, 89, 21, 15, 29, 40, 52 };
        public int[] myResult;
        public Form2()
        {
            InitializeComponent();
            myPredicate = delegate(int curNum) 　　　　　　　　　　　　
            {
                if (curNum % 2 == 0)
                {
                    return true;
                }
                else
                {
                    return false;
                }
            };
        }
        private void Form2_Load(object sender, EventArgs e)
        {
            myResult = Array.FindAll(myNum, myPredicate);
        }          
    }
}
```
上例中说明了Predicate的使用，FindAll方法中，参数2即是一个Predicate，在具体的执行中，每一个数组的元素都会执行指定的方法，如果满足要求返回true，并会被存放在结果集中，不符合的则被剔除，最终返回的集合，即是结果判断后想要的集合。
Array.FindAll 泛型方法：
https://docs.microsoft.com/zh-cn/dotnet/api/system.array.findall?redirectedfrom=MSDN&view=netframework-4.8#System_Array_FindAll__1___0___System_Predicate___0__
以上代码执行结果为：
![](/images/csharp-delegate/Form2_Load.png)
那么Predicate<T>与委托又有什么关系呢？
![](/images/csharp-delegate/Predicate_T.png)

从微软源码中可以看出Predicate<T>是返回bool型的泛型委托，从本质上来说与Func、Action、事件、委托变量并无本质区别。

# 四、资料
参考文章：
http://www.zhihu.com/question/28932542

关于事件部分应用注意可以参考：
http://www.cnblogs.com/buptzym/archive/2013/03/15/2962300.html

.NET Framework 源码：
https://referencesource.microsoft.com
Delegate 类:
https://docs.microsoft.com/zh-cn/dotnet/api/system.delegate?redirectedfrom=MSDN&view=netframework-4.8

![](/images/csharp-delegate/委托图解.png)


