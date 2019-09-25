---
title: 关于Spring AOP与IOC的个人思考
categories:
  - Spring
tags:
  - Spring
  - AOP
  - JDK
  - 原创
abbrlink: 7729
date: 2016-12-24 19:27:58
---

在阅读本文前，强烈建议阅读：
[Java JDK 动态代理（AOP）使用及实现原理分析](http://www.jiankunking.com/java-jdk-aop.html)

<!-- more -->

AOP是Spring提供的关键特性之一。AOP即面向切面编程，是OOP编程的有效补充。使用AOP技术，可以将一些系统性相关的编程工作，独立提取出来，独立实现，然后通过切面切入进系统。从而避免了在业务逻辑的代码中混入很多的系统相关的逻辑——比如权限管理，事物管理，日志记录等等。这些系统性的编程工作都可以独立编码实现，然后通过AOP技术切入进系统即可。从而达到了将不同的关注点分离出来的效果。
![](/images/spring-jdk-aop-think/AOP示意.png)
本文深入剖析Spring的AOP的原理。
# 一、AOP 的实现原理

AOP分为静态AOP和动态AOP。

静态AOP是指AspectJ实现的AOP，他是将切面代码直接编译到Java类文件中。

动态AOP是指将切面代码进行动态织入实现的AOP。

Spring的AOP为动态AOP，实现的技术为：JDK提供的动态代理技术 和 CGLIB(动态字节码增强技术)。尽管实现技术不一样，但都是基于代理模式，都是生成一个代理对象。

## 1、JDK动态代理
JDK部分解析参考：
[Java JDK 动态代理（AOP）使用及实现原理分析](https://www.jiankunking.com/java-jdk-aop.html)

## 2、CGLIB（code generate libary）
字节码生成技术实现AOP，其实就是继承被代理对象，然后Override需要被代理的方法，在覆盖该方法时，自然是可以插入我们自己的代码的。

<font color=DeepPink>**因为需要Override被代理对象的方法，所以自然CGLIB技术实现AOP时，就必须要求需要被代理的方法不能是final方法，因为final方法不能被子类覆盖。**</font>

```
package net.aazj.aop;

import java.lang.reflect.Method;
import net.sf.cglib.proxy.Enhancer;
import net.sf.cglib.proxy.MethodInterceptor;
import net.sf.cglib.proxy.MethodProxy;

public class CGProxy implements MethodInterceptor{
    private Object target;    // 被代理对象
    public CGProxy(Object target){
        this.target = target;
    }
    public Object intercept(Object obj, java.lang.reflect.Method method, Object[] args, MethodProxy proxy) throws Throwable {
        System.out.println("do sth before....");
        Object result = proxy.invokeSuper(obj, args);
        System.out.println("do sth after....");
        return result;
    }
    public Object getProxyObject() {
        Enhancer enhancer = new Enhancer();
        // 设置父类
        enhancer.setSuperclass(this.target.getClass());    
        // 设置回调
        enhancer.setCallback(this);    // 在调用父类方法时，回调 this.intercept()
        // 创建代理对象
        return enhancer.create();
    }
}
```
测试：
```
public interface UserService {
    public void addUser(User user);
    public User getUser(int id);
}

public class UserServiceImpl implements UserService {
    public void addUser(User user) {
        System.out.println("add user into database.");
    }
    public User getUser(int id) {
        User user = new User();
        user.setId(id);
        System.out.println("getUser from database.");
        return user;
    }
}

public class CGProxyTest {
    public static void main(String[] args){
         // 被代理的对象
        Object proxyedObject = new UserServiceImpl();   
        CGProxy cgProxy = new CGProxy(proxyedObject);
        UserService proxyObject = (UserService) cgProxy.getProxyObject();
        proxyObject.getUser(1);
        proxyObject.addUser(new User());
    }
}
```
输出结果：
```
do sth before....
getUser from database.
do sth after....
do sth before....
add user into database.
do sth after....
```
它的原理是：生成一个父类
enhancer.setSuperclass(this.target.getClass())
的子类enhancer.create(),然后对父类的方法进行拦截enhancer.setCallback(this). 

# 二、思考

从以上两种代理方式可以看出，<font color=DeepPink>**实现AOP的关键是：动态代理，即将需要用的接口、类再包装一层，通过动态修改字节码文件实现各种拦截与通知。**</font>

<font color=DeepPink>**注意，两者(JDK动态代理、CGLIB)都需要：要代理真实对象的实例。**</font>

比如：在Spring MVC的Controller层一般@Autowired是Service接口，但带有@Service标识的却是实现Service接口的实体类，这样对于JDK动态代理来说已经足以生成代理类了(其实，不过是cglib还是jdk的动态代理，你直接@Autowired Service接口实现类，也是可以注入成功的，但不如注入Service接口灵活)，大家在跟踪代码的时候可以看一下Spring注入的bean真正的类型，你就可以发现它是代理生成的实例。 

比如这种： 

![](/images/spring-jdk-aop-think/动态代理对象类型.png)

带有注解标识的接口或者在Spring.XML中配置的bean会在Spring初始化的时候，被Spring通过反射加载实例化到Spring容器中。



> 做过Client/Server架构开发的朋友应该知道，在Application运行过程中一般都会有一个应用上下文Context，一般将一些系统信息放在里面，比如一些登录信息、WCF连接实例等。这些信息在系统的任何地方都可以取到（其实就是一些顶级变量集合，生命周期最长的一些家伙）。

>换个角度想一下，如果我们在Application初始化的时候，用反射（获取要代理对象的实例）和动态代理获取有注解标识或者在xml中配置bean的实例，并放到应用上下文Context中，在需要的地方都能取到，这不就是一个简单版的Spring 容器吗？
