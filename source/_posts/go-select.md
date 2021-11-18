---
title: '[转]Go Select 实现分析'
abbrlink: 2955
date: 2020-06-13 12:40:52
categories:
  - Go
tags:
  - Go
  - Select
  - 转载
---

> Go Select

<!-- more -->

很多 C 语言或者 Unix 开发者听到 <code>select</code> 想到的都是系统调用，而谈到 I/O 模型时最终大都会提到基于 <code>select</code>、<code>poll</code> 和 <code>epoll</code> 等函数构建的 IO 多路复用模型。Go 语言的 <code>select</code> 与 C 语言中的 <code>select</code> 有着比较相似的功能。本节会介绍 Go 语言 <code>select</code> 常见的现象、数据结构以及四种不同情况下的实现原理。

<font color=DeepPink>**C 语言中的 <code>select</code> 关键字可以同时监听多个文件描述符的可读或者可写的状态，Go 语言中的 <code>select</code> 关键字也能够让 Goroutine 同时等待多个 Channel 的可读或者可写，在多个文件或者 Channel 发生状态改变之前，<code>select</code> 会一直阻塞当前线程或者 Goroutine。**</font>

![](/images/go-select/Golang-Select-Channels.png)

<code>select</code> 是一种与 <code>switch</code> 相似的控制结构，与 <code>switch</code> 不同的是，<code>select</code> 中虽然也有多个 <code>case</code>，但是这些 <code>case</code> 中的表达式必须都是 Channel 的收发操作。下面的代码就展示了一个包含 Channel 收发操作的 <code>select</code> 结构：

```
func fibonacci(c, quit chan int) {
	x, y := 0, 1
	for {
		select {
		case c <- x:
			x, y = y, x+y
		case <-quit:
			fmt.Println("quit")
			return
		}
	}
}
```

上述控制结构会等待 <code>c \<- x</code> 或者 <code>\<-quit</code> 两个表达式中任意一个的返回。无论哪一个表达式返回都会立刻执行 <code>case</code> 中的代码，当 <code>select</code> 中的两个 <code>case</code> 同时被触发时，就会随机选择一个 <code>case</code> 执行。

# 现象

当我们在 Go 语言中使用 <code>select</code> 控制结构时，会遇到两个有趣的现象：

* <code>select</code> 能在 Channel 上进行非阻塞的收发操作；
* <code>select</code> 在遇到多个 Channel 同时响应时会随机挑选 <code>case</code> 执行；

这两个现象是学习 <code>select</code> 时经常会遇到的，我们来深入了解具体的场景并分析这两个现象背后的设计原理。

## 非阻塞的收发
在通常情况下，<code>select</code> 语句会阻塞当前 Goroutine 并等待多个 Channel 中的一个达到可以收发的状态。但是如果 <code>select</code> 控制结构中包含 default 语句，那么这个 <code>select</code> 语句在执行时会遇到以下两种情况：

* 当存在可以收发的 Channel 时，直接处理该 Channel 对应的 <code>case</code>
* 当不存在可以收发的 Channel 是，执行 <code>default</code> 中的语句；

当我们运行下面的代码时就不会阻塞当前的 Goroutine，它会直接执行 <code>default</code> 中的代码并返回。

```
func main() {
	ch := make(chan int)
	select {
	case i := <-ch:
		println(i)

	default:
		println("default")
	}
}

$ go run main.go
default
```

只要我们稍微想一下，就会发现 Go 语言设计的这个现象就非常合理。<code>select</code> 的作用就是同时监听多个 <code>case</code> 是否可以执行，如果多个 Channel 都不能执行，那么运行 <code>default</code> 中的代码也是理所当然的。

非阻塞的 Channel 发送和接收操作还是很有必要的，在很多场景下我们不希望向 Channel 发送消息或者从 Channel 中接收消息会阻塞当前 Goroutine，我们只是想看看 Channel 的可读或者可写状态。下面就是一个常见的例子：

```
errCh := make(chan error, len(tasks))
wg := sync.WaitGroup{}
wg.Add(len(tasks))
for i := range tasks {
    go func() {
        defer wg.Done()
        if err := tasks[i].Run(); err != nil {
            errCh <- err
        }
    }()
}
wg.Wait()

select {
case err := <-errCh:
    return err
default:
    return nil
}
```

在上面这段代码中，我们不关心到底多少个任务执行失败了，只关心是否存在返回错误的任务，最后的 <code>select</code> 语句就能很好地完成这个任务。然而使用 <code>select</code> 的语法不是最原始的设计，它在最初版本使用 <code>x, ok := \<-c</code> 的语法实现非阻塞的收发，以下是与非阻塞收发的相关提交：

* [select default](https://github.com/golang/go/commit/79fbbe37a76502e6f5f9647d2d82bab953ab1546#diff-fb0a5ae9dd70f0a43038d55c0204fdff) 提交支持了 <code>select</code> 语句中的 <code>default</code> 情况[<sup>1</sup>](#fnref:1)；
* [gc: special case code for single-op blocking and non-blocking selects](https://github.com/golang/go/commit/5038792837355abde32f2e9549ef132fc5ffbd16) 提交引入了基于 <code>select</code> 的非阻塞收发的特性[<sup>2</sup>](#fnref:2)。
* [gc: remove non-blocking send, receive syntax](https://github.com/golang/go/commit/cb584707af2d8803adba88fd9692e665ecd2f059) 提交将 <code>x, ok := \<-c</code> 语法删除删除[<sup>3</sup>](#fnref:3)；
* [gc, runtime: replace closed(c) with x, ok := <-c](https://github.com/golang/go/commit/8bf34e335686816f7fe7e28614b2c7a3e04e9e7c) 提交使用 <code>x, ok := \<-c</code> 语法替代 <code>closed(c)</code> 语法判断 Channel 的关闭状态[<sup>4</sup>](#fnref:4)；

我们可以从上面的几个提交中看到非阻塞收发从最初到现在的演变。

## 随机执行
另一个使用 <code>select</code> 遇到的情况是同时有多个 <code>case</code> 就绪时，<code>select</code> 会选择那个 <code>case</code> 执行的问题，我们通过下面的代码可以简单了解一下：
```
func main() {
	ch := make(chan int)
	go func() {
		for range time.Tick(1 * time.Second) {
			ch <- 0
		}
	}()

	for {
		select {
		case <-ch:
			println("case1")
		case <-ch:
			println("case2")
		}
	}
}

$ go run main.go
case1
case2
case1
...
```
从上述代码输出的结果中我们可以看到，<code>select</code> 在遇到多个 <code>\<-ch</code> 同时满足可读或者可写条件时会随机选择一个 <code>case</code> 执行其中的代码。

这个设计是在十多年前被 [select](https://github.com/golang/go/commit/cb9b1038db77198c2b0961634cf161258af2374d) 提交[<sup>5</sup>](#fnref:5)引入并一直保留到现在的，虽然中间经历过一些修改[<sup>6</sup>](#fnref:6)，但是语义一直都没有改变。在上面的代码中，两个 <code>case</code> 都是同时满足执行条件的，如果我们按照顺序依次判断，那么后面的条件永远都会得不到执行，而随机的引入就是为了避免饥饿问题的发生。

# 数据结构
<code>select</code> 在 Go 语言的源代码中不存在对应的结构体，但是 <code>select</code> 控制结构中的 <code>case</code> 却使用 [runtime.scase](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L28-L34) 结构体来表示：

```
type scase struct {
	c           *hchan
	elem        unsafe.Pointer
	kind        uint16
	pc          uintptr
	releasetime int64
}
```

因为非默认的 <code>case</code> 中都与 Channel 的发送和接收有关，所以 [runtime.scase](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L28-L34) 结构体中也包含一个 [runtime.hchan](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L32-L51) 类型的字段存储 <code>case</code> 中使用的 Channel；除此之外，<code>elem</code> 是接收或者发送数据的变量地址、<code>kind</code> 表示 [runtime.scase](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L28-L34) 的种类，总共包含以下四种：

```
const (
	caseNil = iota
	caseRecv
	caseSend
	caseDefault
)
```

这四种常量分别表示不同类型的 <code>case</code>，相信它们的命名已经能够充分帮助我们理解它们的作用了，所以这里也不一一介绍了。

# 实现原理
<code>select</code> 语句在编译期间会被转换成 <code>OSELECT</code> 节点。每一个 <code>OSELECT</code> 节点都会持有一组 <code>OCASE</code> 节点，如果 <code>OCASE</code> 的执行条件是空，那就意味着这是一个 <code>default</code> 节点:

![](/images/go-select/golang-oselect-and-ocases.png)

上图展示的就是 <code>select</code> 语句在编译期间的结构，每一个 OCASE 既包含执行条件也包含满足条件后执行的代码。

编译器在中间代码生成期间会根据 <code>select</code> 中 <code>case</code> 的不同对控制语句进行优化，这一过程都发生在 [cmd/compile/internal/gc.walkselectcases](https://github.com/golang/go/blob/c729116332ffb66a21dd587e3ee003cb8d0b16fe/src/cmd/compile/internal/gc/select.go#L108-L370) 函数中，我们在这里会分四种情况介绍处理的过程和结果：

* <code>select</code> 不存在任何的 <code>case</code>；
* <code>select</code> 只存在一个 <code>case</code>；
* <code>select</code> 存在两个 <code>case</code>，其中一个 <code>case</code> 是 <code>default</code>；
* <code>select</code> 存在多个 <code>case</code>；

上述的四种情况不仅会涉及编译器的重写和优化，还会涉及 Go 语言的运行时机制，我们会从编译期间和运行时两方面分析上述情况。

## 直接阻塞
首先介绍的是最简单的情况，也就是当 <code>select</code> 结构中不包含任何 <code>case</code> 时编译器是如何进行处理的，我们截取 [cmd/compile/internal/gc.walkselectcases](https://github.com/golang/go/blob/c729116332ffb66a21dd587e3ee003cb8d0b16fe/src/cmd/compile/internal/gc/select.go#L108-L370) 函数的前几行代码：

```
func walkselectcases(cases *Nodes) []*Node {
	n := cases.Len()

	if n == 0 {
		return []*Node{mkcall("block", nil, nil)}
	}
	...
}
```

这段代码非常简单并且容易理解，它直接将类似 <code>select {}</code> 的空语句转换成调用 [runtime.block](https://github.com/golang/go/blob/c112289ee4141ebc31db50328c355b01278b987b/src/runtime/select.go#L104-L106) 函数：
```
func block() {
	gopark(nil, nil, waitReasonSelectNoCases, traceEvGoStop, 1)
}
```

[runtime.block](https://github.com/golang/go/blob/c112289ee4141ebc31db50328c355b01278b987b/src/runtime/select.go#L104-L106) 函数的实现非常简单，它会调用 [runtime.gopark](https://github.com/golang/go/blob/c112289ee4141ebc31db50328c355b01278b987b/src/runtime/proc.go#L287-L305) 让出当前 Goroutine 对处理器的使用权，传入的等待原因是 <code>waitReasonSelectNoCases</code>。

简单总结一下，空的 <code>select</code> 语句会直接阻塞当前的 Goroutine，导致 Goroutine 进入无法被唤醒的永久休眠状态。

## 单一管道
如果当前的 <code>select</code> 条件只包含一个 <code>case</code>，那么就会将 <code>select</code> 改写成 <code>if</code> 条件语句。下面展示了原始的 <code>select</code> 语句和被改写、优化后的代码：

```
// 改写前
select {
case v, ok <-ch: // case ch <- v
    ...    
}

// 改写后
if ch == nil {
    block()
}
v, ok := <-ch // case ch <- v
...
```

[cmd/compile/internal/gc.walkselectcases](https://github.com/golang/go/blob/c729116332ffb66a21dd587e3ee003cb8d0b16fe/src/cmd/compile/internal/gc/select.go#L108-L370) 在处理单操作 <code>select</code> 语句时，会根据 Channel 的收发情况生成不同的语句。当 <code>case</code> 中的 Channel 是空指针时，就会直接挂起当前 Goroutine 并永久休眠。

## 非阻塞操作
当 <code>select</code> 中仅包含两个 <code>case</code>，并且其中一个是 <code>default</code> 时，Go 语言的编译器就会认为这是一次非阻塞的收发操作。[cmd/compile/internal/gc.walkselectcases](https://github.com/golang/go/blob/c729116332ffb66a21dd587e3ee003cb8d0b16fe/src/cmd/compile/internal/gc/select.go#L108-L370) 函数会对这种情况单独处理，不过在正式优化之前，该函数会将 <code>case</code> 中的所有 Channel 都转换成指向 Channel 的地址。我们会分别介绍非阻塞发送和非阻塞接收时，编译器进行的不同优化。

### 发送
首先是 Channel 的发送过程，当 <code>case</code> 中表达式的类型是 <code>OSEND</code> 时，编译器会使用 <code>if/else</code> 语句和 [runtime.selectnbsend](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L662-L664) 函数改写代码：

```
select {
case ch <- i:
    ...
default:
    ...
}

if selectnbsend(ch, i) {
    ...
} else {
    ...
}
```

这段代码中最重要的就是 [runtime.selectnbsend](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L662-L664) 函数，它为我们提供了向 Channel 非阻塞地发送数据的能力。我们在 Channel 一节介绍了向 Channel 发送数据的 [runtime.chansend](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L157-L278) 函数包含一个 <code>block</code> 参数，该参数会决定这一次的发送是不是阻塞的：

```
func selectnbsend(c *hchan, elem unsafe.Pointer) (selected bool) {
	return chansend(c, elem, false, getcallerpc())
}
```

### 接收
由于从 Channel 中接收数据可能会返回一个或者两个值，所以接受数据的情况会比发送稍显复杂，不过改写的套路是差不多的：

```
// 改写前
select {
case v <- ch: // case v, ok <- ch:
    ......
default:
    ......
}

// 改写后
if selectnbrecv(&v, ch) { // if selectnbrecv2(&v, &ok, ch) {
    ...
} else {
    ...
}
```

返回值数量不同会导致使用函数的不同，两个用于非阻塞接收消息的函数 [runtime.selectnbrecv](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L683-L686) 和 [runtime.selectnbrecv2](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L705-L709) 只是对 [runtime.chanrecv](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L448-L579) 返回值的处理稍有不同：

```
func selectnbrecv(elem unsafe.Pointer, c *hchan) (selected bool) {
	selected, _ = chanrecv(c, elem, false)
	return
}

func selectnbrecv2(elem unsafe.Pointer, received *bool, c *hchan) (selected bool) {
	selected, *received = chanrecv(c, elem, false)
	return
}
```

因为接收方不需要，所以 [runtime.selectnbrecv](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L683-L686) 会直接忽略返回的布尔值，而 [runtime.selectnbrecv2](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L705-L709) 会将布尔值回传给调用方。与 [runtime.chansend](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L157-L278) 一样，[runtime.chanrecv](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L448-L579) 也提供了一个 block 参数用于控制这一次接收是否阻塞。

### 常见流程
在默认的情况下，编译器会使用如下的流程处理 <code>select</code> 语句：

* 将所有的 <code>case</code> 转换成包含 Channel 以及类型等信息的 [runtime.scase](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L28-L34) 结构体；
* 调用运行时函数 [runtime.selectgo](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L118-L497) 从多个准备就绪的 Channel 中选择一个可执行的 [runtime.scase](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L28-L34) 结构体；
* 通过 <code>for</code> 循环生成一组 <code>if</code> 语句，在语句中判断自己是不是被选中的 <code>case</code>

一个包含三个 <code>case</code> 的正常 <code>select</code> 语句其实会被展开成如下所示的逻辑，我们可以看到其中处理的三个部分：

```
selv := [3]scase{}
order := [6]uint16
for i, cas := range cases {
    c := scase{}
    c.kind = ...
    c.elem = ...
    c.c = ...
}
chosen, revcOK := selectgo(selv, order, 3)
if chosen == 0 {
    ...
    break
}
if chosen == 1 {
    ...
    break
}
if chosen == 2 {
    ...
    break
}
```
展开后的代码片段中最重要的就是用于选择待执行 <code>case</code> 的运行时函数 [runtime.selectgo](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L118-L497)，这也是我们要关注的重点。因为这个函数的实现比较复杂， 所以这里分两部分分析它的执行过程：

* 执行一些必要的初始化操作并确定 <code>case</code> 的处理顺序；
* 在循环中根据 <code>case</code> 的类型做出不同的处理；

#### 初始化
[runtime.selectgo](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L118-L497) 函数首先会进行执行必要的初始化操作并决定处理 <code>case</code> 的两个顺序 — 轮询顺序 <code>pollOrder</code> 和加锁顺序 <code>lockOrder</code>：

```
func selectgo(cas0 *scase, order0 *uint16, ncases int) (int, bool) {
	cas1 := (*[1 << 16]scase)(unsafe.Pointer(cas0))
	order1 := (*[1 << 17]uint16)(unsafe.Pointer(order0))
	
	scases := cas1[:ncases:ncases]
	pollorder := order1[:ncases:ncases]
	lockorder := order1[ncases:][:ncases:ncases]
	for i := range scases {
		cas := &scases[i]
	}

	for i := 1; i < ncases; i++ {
		j := fastrandn(uint32(i + 1))
		pollorder[i] = pollorder[j]
		pollorder[j] = uint16(i)
	}

	// 根据 Channel 的地址排序确定加锁顺序
	...
	sellock(scases, lockorder)
	...
}
```

轮询顺序 <code>pollOrder</code> 和加锁顺序 <code>lockOrder</code> 分别是通过以下的方式确认的：

* 轮询顺序：通过 [runtime.fastrandn](https://github.com/golang/go/blob/383b447e0da5bd1fcdc2439230b5a1d3e3402117/src/runtime/stubs.go#L114-L118) 函数引入随机性；
* 加锁顺序：按照 Channel 的地址排序后确定加锁顺序；

随机的轮询顺序可以避免 Channel 的饥饿问题，保证公平性；而根据 Channel 的地址顺序确定加锁顺序能够避免死锁的发生。这段代码最后调用的 [runtime.sellock](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L45-L54) 函数会按照之前生成的加锁顺序锁定 <code>select</code> 语句中包含所有的 Channel。

#### 循环
当我们为 <code>select</code> 语句锁定了所有 Channel 之后就会进入 [runtime.selectgo](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L118-L497) 函数的主循环，它会分三个阶段查找或者等待某个 Channel 准备就绪：

查找是否已经存在准备就绪的 Channel，即可以执行收发操作；
将当前 Goroutine 加入 Channel 对应的收发队列上并等待其他 Goroutine 的唤醒；
当前 Goroutine 被唤醒之后找到满足条件的 Channel 并进行处理；
[runtime.selectgo](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L118-L497)  函数会根据不同情况通过 <code>goto</code> 跳转到函数内部的不同标签执行相应的逻辑，其中包括：

* <code>bufrecv</code>：可以从缓冲区读取数据；
* <code>bufsend</code>：可以向缓冲区写入数据；
* <code>recv</code>：可以从休眠的发送方获取数据；
* <code>send</code>：可以向休眠的接收方发送数据；
* <code>rclose</code>：可以从关闭的 Channel 读取 EOF；
* <code>sclose</code>：向关闭的 Channel 发送数据；
* <code>retc</code>：结束调用并返回；

我们先来分析循环执行的第一个阶段，查找已经准备就绪的 Channel。循环会遍历所有的 <code>case</code> 并找到需要被唤起的 runtime.sudog 结构，在这个阶段，我们会根据 <code>case</code> 的四种类型分别处理：

1. <code>caseNil</code>：当前 <code>case</code> 不包含 Channel；
	* 这种 <code>case</code> 会被跳过；
2. <code>caseRecv</code>：当前 <code>case</code> 会从 Channel 中接收数据；
	* 如果当前 Channel 的 <code>sendq</code> 上有等待的 Goroutine，就会跳到 <code>recv</code> 标签从 Goroutine 中读取数据；
	* 如果当前 Channel 的缓冲区不为空，就会跳到 <code>bufrecv</code> 标签处从缓冲区获取数据；
	* 如果当前 Channel 已经被关闭，就会跳到 <code>rclose</code> 做一些清除的收尾工作；
3. <code>caseSend</code>：当前 <code>case</code> 会向 Channel 发送数据；
	* 如果当前 Channel 已经被关，闭就会直接跳到 <code>sclose</code> 标签，触发 <code>panic</code> 尝试中止程序；
	* 如果当前 Channel 的 <code>recvq</code> 上有等待的 Goroutine，就会跳到 <code>send</code> 标签向 Channel 发送数据；
	* 如果当前 Channel 的缓冲区存在空闲位置，就会将待发送的数据存入缓冲区；
4. <code>caseDefault</code>：当前 <code>case</code> 为 <code>default</code> 语句；
	* 表示前面的所有 <code>case</code> 都没有被执行，这里会解锁所有 Channel 并返回，意味着当前 <code>select</code> 结构中的收发都是非阻塞的；

![](/images/go-select/golang-runtime-selectgo.png)

第一阶段的主要职责是查找所有 <code>case</code> 中 Channel 是否有可以立刻被处理的情况。无论是在包含等待的 Goroutine 还是缓冲区中存在数据，只要满足条件就会立刻处理，如果不能立刻找到活跃的 Channel 就会进入循环的下一阶段，按照需要将当前的 Goroutine 加入到 Channel 的 <code>sendq</code> 或者 <code>recvq</code> 队列中：

```
func selectgo(cas0 *scase, order0 *uint16, ncases int) (int, bool) {
	...
	gp = getg()
	nextp = &gp.waiting
	for _, casei := range lockorder {
		casi = int(casei)
		cas = &scases[casi]
		c = cas.c
		sg := acquireSudog()
		sg.g = gp
		sg.c = c

		switch cas.kind {
		case caseRecv:
			c.recvq.enqueue(sg)
		case caseSend:
			c.sendq.enqueue(sg)
		}
	}

	gopark(selparkcommit, nil, waitReasonSelect, traceEvGoBlockSelect, 1)
	...
}
```

除了将当前 Goroutine 对应的 [runtime.sudog](https://github.com/golang/go/blob/cfe3cd903f018dec3cb5997d53b1744df4e53909/src/runtime/runtime2.go#L342-L368) 结构体加入队列之外，这些 [runtime.sudog](https://github.com/golang/go/blob/cfe3cd903f018dec3cb5997d53b1744df4e53909/src/runtime/runtime2.go#L342-L368) 结构体都会被串成链表附着在 Goroutine 上。在入队之后会调用 [runtime.gopark](https://github.com/golang/go/blob/c112289ee4141ebc31db50328c355b01278b987b/src/runtime/proc.go#L287-L305) 函数挂起当前 Goroutine 等待调度器的唤醒。

![](/images/go-select/Golang-Select-Waiting.png)

等到 <code>select</code> 中的一些 Channel 准备就绪之后，当前 Goroutine 就会被调度器唤醒。这时会继续执行 [runtime.selectgo](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L118-L497) 函数的第三阶段，从 [runtime.sudog](https://github.com/golang/go/blob/cfe3cd903f018dec3cb5997d53b1744df4e53909/src/runtime/runtime2.go#L342-L368) 结构体中获取数据：

```
func selectgo(cas0 *scase, order0 *uint16, ncases int) (int, bool) {
	...
	sg = (*sudog)(gp.param)
	gp.param = nil

	casi = -1
	cas = nil
	sglist = gp.waiting
	for _, casei := range lockorder {
		k = &scases[casei]
		if sg == sglist {
			casi = int(casei)
			cas = k
		} else {
			if k.kind == caseSend {
				c.sendq.dequeueSudoG(sglist)
			} else {
				c.recvq.dequeueSudoG(sglist)
			}
		}
		sgnext = sglist.waitlink
		sglist.waitlink = nil
		releaseSudog(sglist)
		sglist = sgnext
	}

	c = cas.c
	goto retc
	...
}
```

第三次遍历全部 <code>case</code> 时，我们会先获取当前 Goroutine 接收到的参数 <code>sudog</code> 结构，我们会依次对比所有 <code>case</code> 对应的 <code>sudog</code> 结构找到被唤醒的 <code>case</code>，获取该 <code>case</code> 对应的索引并返回。

由于当前的 <code>select</code> 结构找到了一个 <code>case</code> 执行，那么剩下 <code>case</code> 中没有被用到的 <code>sudog</code> 就会被忽略并且释放掉。为了不影响 Channel 的正常使用，我们还是需要将这些废弃的 <code>sudog</code> 从 Channel 中出队。

当我们在循环中发现缓冲区中有元素或者缓冲区未满时就会通过 <code>goto</code> 关键字跳转到 <code>bufrecv</code> 和 <code>bufsend</code> 两个代码段，这两段代码的执行过程都很简单，它们只是向 Channel 中发送数据或者从缓冲区中获取新数据：

```
bufrecv:
	recvOK = true
	qp = chanbuf(c, c.recvx)
	if cas.elem != nil {
		typedmemmove(c.elemtype, cas.elem, qp)
	}
	typedmemclr(c.elemtype, qp)
	c.recvx++
	if c.recvx == c.dataqsiz {
		c.recvx = 0
	}
	c.qcount--
	selunlock(scases, lockorder)
	goto retc

bufsend:
	typedmemmove(c.elemtype, chanbuf(c, c.sendx), cas.elem)
	c.sendx++
	if c.sendx == c.dataqsiz {
		c.sendx = 0
	}
	c.qcount++
	selunlock(scases, lockorder)
	goto retc
```

这里在缓冲区进行的操作和直接调用 [runtime.chansend](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L157-L278) 和 [runtime.chanrecv](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L448-L579) 函数差不多，上述两个过程在执行结束之后都会直接跳到 <code>retc</code> 字段。

两个直接对 Channel 收发的情况会调用 Channel 运行时函数 [runtime.send](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L286-L317) 和 [runtime.recv](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L594-L635)，这两个函数会直接与处于休眠状态的 Goroutine 打交道：

```
recv:
	recv(c, sg, cas.elem, func() { selunlock(scases, lockorder) }, 2)
	recvOK = true
	goto retc

send:
	send(c, sg, cas.elem, func() { selunlock(scases, lockorder) }, 2)
	goto retc
```

不过如果向关闭的 Channel 发送数据或者从关闭的 Channel 中接收数据，情况就稍微有一点复杂了：

* 从一个关闭 Channel 中接收数据会直接清除 Channel 中的相关内容；
* 向一个关闭的 Channel 发送数据就会直接 <code>panic</code> 造成程序崩溃：

```
rclose:
	selunlock(scases, lockorder)
	recvOK = false
	if cas.elem != nil {
		typedmemclr(c.elemtype, cas.elem)
	}
	goto retc

sclose:
	selunlock(scases, lockorder)
	panic(plainError("send on closed channel"))
```

总体来看，<code>select</code> 语句中的 Channel 收发操作和直接操作 Channel 没有太多出入，只是由于 <code>select</code> 多出了 <code>default</code> 关键字所以会支持非阻塞的收发。

# 小结
我们简单总结一下 <code>select</code> 结构的执行过程与实现原理，首先在编译期间，Go 语言会对 <code>select</code> 语句进行优化，它会根据 <code>select</code> 中 <code>case</code> 的不同选择不同的优化路径：

1. 空的 <code>select</code> 语句会被转换成 [runtime.block](https://github.com/golang/go/blob/c112289ee4141ebc31db50328c355b01278b987b/src/runtime/select.go#L104-L106) 函数的调用，直接挂起当前 Goroutine；
2. 如果 <code>select</code> 语句中只包含一个 <code>case</code>，就会被转换成 <code>if ch == nil { block }; n;</code> 表达式；
	* 首先判断操作的 Channel 是不是空的；
	* 然后执行 <code>case</code> 结构中的内容；
3. 如果 <code>select</code> 语句中只包含两个 <code>case</code> 并且其中一个是 <code>default</code>，那么会使用 [runtime.selectnbrecv](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L683-L686) 和 [runtime.selectnbsend](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/chan.go#L662-L664) 非阻塞地执行收发操作；
4. 在默认情况下会通过 [runtime.selectgo](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L118-L497) 函数获取执行 <code>case</code> 的索引，并通过多个 <code>if</code> 语句执行对应 <code>case</code> 中的代码；

在编译器已经对 <code>select</code> 语句进行优化之后，Go 语言会在运行时执行编译期间展开的 [runtime.selectgo](https://github.com/golang/go/blob/d1969015b4ac29be4f518b94817d3f525380639d/src/runtime/select.go#L118-L497) 函数，该函数会按照以下的流程执行：

1. 随机生成一个遍历的轮询顺序 <code>pollOrder</code> 并根据 Channel 地址生成锁定顺序 <code>lockOrder</code>；
2. 根据 <code>pollOrder</code> 遍历所有的 <code>case</code> 查看是否有可以立刻处理的 Channel；
	1. 如果存在就直接获取 <code>case</code> 对应的索引并返回；
	2. 如果不存在就会创建 [runtime.sudog](https://github.com/golang/go/blob/cfe3cd903f018dec3cb5997d53b1744df4e53909/src/runtime/runtime2.go#L342-L368) 结构体，将当前 Goroutine 加入到所有相关 Channel 的收发队列，并调用 [runtime.gopark](https://github.com/golang/go/blob/c112289ee4141ebc31db50328c355b01278b987b/src/runtime/proc.go#L287-L305) 挂起当前 Goroutine 等待调度器的唤醒；
3. 当调度器唤醒当前 Goroutine 时就会再次按照 <code>lockOrder</code> 遍历所有的 <code>case</code>，从中查找需要被处理的 [runtime.sudog](https://github.com/golang/go/blob/cfe3cd903f018dec3cb5997d53b1744df4e53909/src/runtime/runtime2.go#L342-L368) 结构对应的索引；

<code>select</code> 关键字是 Go 语言特有的控制结构，它的实现原理比较复杂，需要编译器和运行时函数的通力合作。

# 拓展阅读

[SELECT(2) · Linux](https://man7.org/linux/man-pages/man2/select.2.html)

<div id="fnref:1">1.</div> Ken Thompson. Nov 6, 2008. select default. 

https://github.com/golang/go/commit/79fbbe37a76502e6f5f9647d2d82bab953ab1546#diff-fb0a5ae9dd70f0a43038d55c0204fdff ↩︎

<div id="fnref:2">2.</div> Russ Cox. Jan 31, 2011. gc: special case code for single-op blocking and non-blocking selects.

https://github.com/golang/go/commit/5038792837355abde32f2e9549ef132fc5ffbd16 ↩︎

<div id="fnref:3">3.</div> Russ Cox. Feb 1, 2011. gc: remove non-blocking send, receive syntax. 

https://github.com/golang/go/commit/cb584707af2d8803adba88fd9692e665ecd2f059 ↩︎

<div id="fnref:4">4.</div> Russ Cox. Mar 12, 2011. gc, runtime: replace closed(c) with x, ok := <-c.

https://github.com/golang/go/commit/8bf34e335686816f7fe7e28614b2c7a3e04e9e7c ↩︎

<div id="fnref:5">5.</div> Ken Thompson. Jul 25, 2008. select. 

https://github.com/golang/go/commit/cb9b1038db77198c2b0961634cf161258af2374d ↩︎

<div id="fnref:6">6.</div> Gustavo Niemeyer. Aug 15, 2011. runtime: fix pseudo-randomness on some selects. 

https://github.com/golang/go/commit/175849295ce632c2ddeca7024f7c783327b5e571 ↩︎
 
# 原文

[https://draveness.me/golang/docs/part2-foundation/ch05-keyword/golang-select/](https://draveness.me/golang/docs/part2-foundation/ch05-keyword/golang-select/)