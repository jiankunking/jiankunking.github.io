---
title: Java-JDK-动态代理（AOP）使用及实现原理分析
author: jiankunking
categories:
  - Spring
tags:
  - Spring
  - AOP
  - JDK
  - 原创
  - Java
abbrlink: 19622
date: 2016-08-07 19:27:58
---

# 一、什么是代理？
代理是一种常用的设计模式，其目的就是为其他对象提供一个代理以控制对某个对象的访问。代理类负责为委托类预处理消息，过滤消息并转发消息，以及进行消息被委托类执行后的后续处理。

代理模式UML图：

![](/images/spring-jdk-aop/UML.png)
简单结构示意图：

![](/images/spring-jdk-aop/简单示意图.png)
为了保持行为的一致性，代理类和委托类通常会实现相同的接口，所以在访问者看来两者没有丝毫的区别。通过代理类这中间一层，能有效控制对委托类对象的直接访问，也可以很好地隐藏和保护委托类对象，同时也为实施不同控制策略预留了空间，从而在设计上获得了更大的灵活性。Java 动态代理机制以巧妙的方式近乎完美地实践了代理模式的设计理念。
# 二、Java 动态代理类 

Java动态代理类位于java.lang.reflect包下，一般主要涉及到以下两个类：

(1)Interface InvocationHandler：该接口中仅定义了一个方法

```
public object invoke(Object obj,Method method, Object[] args)
```
在实际使用时，<font color=DeepPink>**第一个参数obj一般是指代理类，method是被代理的方法，如上例中的request()，args为该方法的参数数组。**</font>这个抽象方法在代理类中动态实现。

(2)Proxy：该类即为动态代理类，其中主要包含以下内容：

protected Proxy(InvocationHandler h)：构造函数，用于给内部的h赋值。



static Class getProxyClass(

ClassLoader loader,

Class[] interfaces)：获得一个代理类，其中loader是类装载器，interfaces是真实类所拥有的全部接口的数组。

static Object newProxyInstance(ClassLoaderloader, Class[] interfaces,InvocationHandler h)：返回代理类的一个实例，返回后的代理类可以当作被代理类使用(可使用被代理类的在Subject接口中声明过的方法)

所谓DynamicProxy是这样一种class：<font color=DeepPink>**它是在运行时生成的class，在生成它时你必须提供一组interface给它，然后该class就宣称它实现了这些interface。**</font>你当然可以把该class的实例当作这些interface中的任何一个来用。当然，这个DynamicProxy其实就是一个Proxy，它不会替你作实质性的工作，<font color=DeepPink>**在生成它的实例时你必须提供一个handler，由它接管实际的工作。**</font>

在使用动态代理类时，我们必须实现InvocationHandler接口



通过这种方式，被代理的对象(RealSubject)可以在运行时动态改变，需要控制的接口(Subject接口)可以在运行时改变，控制的方式(DynamicSubject类)也可以动态改变，从而实现了非常灵活的动态代理关系。



动态代理步骤：

1. 创建一个实现接口InvocationHandler的类，它必须实现invoke方法

2. 创建被代理的类以及接口

3. 通过Proxy的静态方法

newProxyInstance(ClassLoaderloader,Class[]interfaces,InvocationHandler h)创建一个代理

4. 通过代理调用方法

# 三、JDK的动态代理怎么使用？

1、需要动态代理的接口：
```
package jiankunking;

/**
 * 需要动态代理的接口
 */
public interface Subject {
    /**
     * 你好
     *
     * @param name
     * @return
     */
    public String SayHello(String name);

    /**
     * 再见
     *
     * @return
     */
    public String SayGoodBye();
}
```
2、需要代理的实际对象
```

package jiankunking;

/**
 * 实际对象
 */
public class RealSubject implements Subject {

    /**
     * 你好
     *
     * @param name
     * @return
     */
    @Override
    public String SayHello(String name) {
        return "hello " + name;
    }

    /**
     * 再见
     *
     * @return
     */
    @Override
    public String SayGoodBye() {
        return " good bye ";
    }
}
```
3、调用处理器实现类（有木有感觉这里就是传说中的AOP啊）
```
package jiankunking;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;


/**
 * 调用处理器实现类
 * 每次生成动态代理类对象时都需要指定一个实现了该接口的调用处理器对象
 */
public class InvocationHandlerImpl implements InvocationHandler {

    /**
     * 这个就是我们要代理的真实对象
     */
    private Object subject;

    /**
     * 构造方法，给我们要代理的真实对象赋初值
     *
     * @param subject
     */
    public InvocationHandlerImpl(Object subject) {
        this.subject = subject;
    }

    /**
     * 该方法负责集中处理动态代理类上的所有方法调用。
     * 调用处理器根据这三个参数进行预处理或分派到委托类实例上反射执行
     *
     * @param proxy  代理类实例
     * @param method 被调用的方法对象
     * @param args   调用参数
     * @return
     * @throws Throwable
     */
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        //在代理真实对象前我们可以添加一些自己的操作
        System.out.println("在调用之前，我要干点啥呢？");
        System.out.println("Method:" + method);
        //当代理对象调用真实对象的方法时，其会自动的跳转到代理对象关联的handler对象的invoke方法来进行调用
        Object returnValue = method.invoke(subject, args);
        //在代理真实对象后我们也可以添加一些自己的操作
        System.out.println("在调用之后，我要干点啥呢？");
        return returnValue;
    }
}
```
4、测试
```
package jiankunking;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;

/**
 * 动态代理演示
 */
public class DynamicProxyDemonstration {
    public static void main(String[] args) {
        //代理的真实对象
        Subject realSubject = new RealSubject();
        /**
         * InvocationHandlerImpl 实现了 InvocationHandler 接口，并能实现方法调用从代理类到委托类的分派转发
         * 其内部通常包含指向委托类实例的引用，用于真正执行分派转发过来的方法调用.
         * 即：要代理哪个真实对象，就将该对象传进去，最后是通过该真实对象来调用其方法
         */
        InvocationHandler handler = new InvocationHandlerImpl(realSubject);

        ClassLoader loader = handler.getClass().getClassLoader();
        Class<?>[] interfaces = realSubject.getClass().getInterfaces();
        /**
         * 该方法用于为指定类装载器、一组接口及调用处理器生成动态代理类实例
         */
        Subject subject = (Subject) Proxy.newProxyInstance(loader, interfaces, handler);

        System.out.println("动态代理对象的类型：" + subject.getClass().getName());

        String hello = subject.SayHello("jiankunking");
        System.out.println(hello);
//        String goodbye = subject.SayGoodBye();
//        System.out.println(goodbye);
    }
}
```
5、输出结果如下：

![](/images/spring-jdk-aop/动态代理演示输出.png)

# 四、动态代理怎么实现的？
从使用代码中可以看出，关键点在：
```
Subject subject = (Subject) Proxy.newProxyInstance(loader, interfaces, handler);
```
通过跟踪提示代码可以看出：<font color=DeepPink>**当代理对象调用真实对象的方法时，其会自动的跳转到代理对象关联的handler对象的invoke方法来进行调用。**</font>

也就是说，当代码执行到：subject.SayHello("jiankunking")这句话时，会自动调用InvocationHandlerImpl的invoke方法。这是为啥呢？

> 下面是代码跟分析的过程，不想看的朋友可以直接看结论

以下代码来自:JDK1.8.0_92

既然生成代理对象是用的Proxy类的静态方newProxyInstance，那么我们就去它的源码里看一下它到底都做了些什么？
```
/**
 * Returns an instance of a proxy class for the specified interfaces
 * that dispatches method invocations to the specified invocation
 * handler.
 *
 * <p>{@code Proxy.newProxyInstance} throws
 * {@code IllegalArgumentException} for the same reasons that
 * {@code Proxy.getProxyClass} does.
 *
 * @param   loader the class loader to define the proxy class
 * @param   interfaces the list of interfaces for the proxy class
 *          to implement
 * @param   h the invocation handler to dispatch method invocations to
 * @return  a proxy instance with the specified invocation handler of a
 *          proxy class that is defined by the specified class loader
 *          and that implements the specified interfaces
 * @throws  IllegalArgumentException if any of the restrictions on the
 *          parameters that may be passed to {@code getProxyClass}
 *          are violated
 * @throws  SecurityException if a security manager, <em>s</em>, is present
 *          and any of the following conditions is met:
 *          <ul>
 *          <li> the given {@code loader} is {@code null} and
 *               the caller's class loader is not {@code null} and the
 *               invocation of {@link SecurityManager#checkPermission
 *               s.checkPermission} with
 *               {@code RuntimePermission("getClassLoader")} permission
 *               denies access;</li>
 *          <li> for each proxy interface, {@code intf},
 *               the caller's class loader is not the same as or an
 *               ancestor of the class loader for {@code intf} and
 *               invocation of {@link SecurityManager#checkPackageAccess
 *               s.checkPackageAccess()} denies access to {@code intf};</li>
 *          <li> any of the given proxy interfaces is non-public and the
 *               caller class is not in the same {@linkplain Package runtime package}
 *               as the non-public interface and the invocation of
 *               {@link SecurityManager#checkPermission s.checkPermission} with
 *               {@code ReflectPermission("newProxyInPackage.{package name}")}
 *               permission denies access.</li>
 *          </ul>
 * @throws  NullPointerException if the {@code interfaces} array
 *          argument or any of its elements are {@code null}, or
 *          if the invocation handler, {@code h}, is
 *          {@code null}
 */
@CallerSensitive 
public static Object newProxyInstance(ClassLoader loader,
                                          Class<?>[] interfaces,
                                          InvocationHandler h) throws IllegalArgumentException {
        //检查h 不为空，否则抛异常
        Objects.requireNonNull(h);
 
        final Class<?>[] intfs = interfaces.clone();
        final SecurityManager sm = System.getSecurityManager();
        if (sm != null) {
            checkProxyAccess(Reflection.getCallerClass(), loader, intfs);
        }
 
        /*
         * 获得与指定类装载器和一组接口相关的代理类类型对象
         */
        Class<?> cl = getProxyClass0(loader, intfs);
 
        /*
         * 通过反射获取构造函数对象并生成代理类实例
         */
        try {
            if (sm != null) {
                checkNewProxyPermission(Reflection.getCallerClass(), cl);
            }
            //获取代理对象的构造方法（也就是$Proxy0(InvocationHandler h)） 
            final Constructor<?> cons = cl.getConstructor(constructorParams);
            final InvocationHandler ih = h;
            if (!Modifier.isPublic(cl.getModifiers())) {
                AccessController.doPrivileged(new PrivilegedAction<Void>() {
                    public Void run() {
                        cons.setAccessible(true);
                        return null;
                    }
                });
            }
            //生成代理类的实例并把InvocationHandlerImpl的实例传给它的构造方法
            return cons.newInstance(new Object[]{h});
        } catch (IllegalAccessException|InstantiationException e) {
            throw new InternalError(e.toString(), e);
        } catch (InvocationTargetException e) {
            Throwable t = e.getCause();
            if (t instanceof RuntimeException) {
                throw (RuntimeException) t;
            } else {
                throw new InternalError(t.toString(), t);
            }
        } catch (NoSuchMethodException e) {
            throw new InternalError(e.toString(), e);
        }
    }
```
我们再进去getProxyClass0方法看一下：
```
    /**
     * Generate a proxy class.  Must call the checkProxyAccess method
     * to perform permission checks before calling this.
     */
    private static Class<?> getProxyClass0(ClassLoader loader,
                                           Class<?>... interfaces) {
        if (interfaces.length > 65535) {
            throw new IllegalArgumentException("interface limit exceeded");
        }
 
        // If the proxy class defined by the given loader implementing
        // the given interfaces exists, this will simply return the cached copy;
        // otherwise, it will create the proxy class via the ProxyClassFactory
        return proxyClassCache.get(loader, interfaces);
    }
```
真相还是没有来到，继续，看一下 proxyClassCache
```
     /**
     * a cache of proxy classes
     */
    private static final WeakCache<ClassLoader, Class<?>[], Class<?>> proxyClassCache = new WeakCache<>(new KeyFactory(), new ProxyClassFactory());
```
奥，原来用了一下缓存啊

那么它对应的get方法啥样呢？
```
    /**
     * Look-up the value through the cache. This always evaluates the
     * {@code subKeyFactory} function and optionally evaluates
     * {@code valueFactory} function if there is no entry in the cache for given
     * pair of (key, subKey) or the entry has already been cleared.
     *
     * @param key       possibly null key
     * @param parameter parameter used together with key to create sub-key and
     *                  value (should not be null)
     * @return the cached value (never null)
     * @throws NullPointerException if {@code parameter} passed in or
     *                              {@code sub-key} calculated by
     *                              {@code subKeyFactory} or {@code value}
     *                              calculated by {@code valueFactory} is null.
     */
    public V get(K key, P parameter) {
        Objects.requireNonNull(parameter);
        expungeStaleEntries();
        Object cacheKey = CacheKey.valueOf(key, refQueue);
        // lazily install the 2nd level valuesMap for the particular cacheKey
        ConcurrentMap<Object, Supplier<V>> valuesMap = map.get(cacheKey);
        if (valuesMap == null) {
           //putIfAbsent这个方法在key不存在的时候加入一个值,如果key存在就不放入
            ConcurrentMap<Object, Supplier<V>> oldValuesMap = map.putIfAbsent(cacheKey,valuesMap = new ConcurrentHashMap<>());
            if (oldValuesMap != null) {
                valuesMap = oldValuesMap;
            }
        }
 
        // create subKey and retrieve the possible Supplier<V> stored by that
        // subKey from valuesMap
        Object subKey = Objects.requireNonNull(subKeyFactory.apply(key, parameter));
        Supplier<V> supplier = valuesMap.get(subKey);
        Factory factory = null;
 
        while (true) {
            if (supplier != null) {
                // supplier might be a Factory or a CacheValue<V> instance
                V value = supplier.get();
                if (value != null) {
                    return value;
                }
            }
            // else no supplier in cache
            // or a supplier that returned null (could be a cleared CacheValue
            // or a Factory that wasn't successful in installing the CacheValue)
 
            // lazily construct a Factory
            if (factory == null) {
                factory = new Factory(key, parameter, subKey, valuesMap);
            }
 
            if (supplier == null) {        
                supplier = valuesMap.putIfAbsent(subKey, factory);
                if (supplier == null) {
                    // successfully installed Factory
                    supplier = factory;
                }
                // else retry with winning supplier
            } else {
                if (valuesMap.replace(subKey, supplier, factory)) {
                    // successfully replaced
                    // cleared CacheEntry / unsuccessful Factory
                    // with our Factory
                    supplier = factory;
                } else {
                    // retry with current supplier
                    supplier = valuesMap.get(subKey);
                }
            }
        }
    }
```
我们可以看到它调用了 supplier.get(); 获取动态代理类，其中supplier是Factory,这个类定义在WeakCach的内部。

来瞅瞅，get里面又做了什么？
```
public synchronized V get() { // serialize access
            // re-check
            Supplier<V> supplier = valuesMap.get(subKey);
            if (supplier != this) {
                // something changed while we were waiting:
                // might be that we were replaced by a CacheValue
                // or were removed because of failure ->
                // return null to signal WeakCache.get() to retry
                // the loop
                return null;
            }
            // else still us (supplier == this)
 
            // create new value
            V value = null;
            try {
                value = Objects.requireNonNull(valueFactory.apply(key, parameter));
            } finally {
                if (value == null) { // remove us on failure
                    valuesMap.remove(subKey, this);
                }
            }
            // the only path to reach here is with non-null value
            assert value != null;
 
            // wrap value with CacheValue (WeakReference)
            CacheValue<V> cacheValue = new CacheValue<>(value);
 
            // try replacing us with CacheValue (this should always succeed)
            if (valuesMap.replace(subKey, this, cacheValue)) {
                // put also in reverseMap
                reverseMap.put(cacheValue, Boolean.TRUE);
            } else {
                throw new AssertionError("Should not reach here");
            }
 
            // successfully replaced us with new CacheValue -> return the value
            // wrapped by it
            return value;
        }
    }
```
发现重点还是木有出现，但我们可以看到它调用了valueFactory.apply(key, parameter)方法：
```
     /**
     * A factory function that generates, defines and returns the proxy class given
     * the ClassLoader and array of interfaces.
     */
    private static final class ProxyClassFactory implements BiFunction<ClassLoader, Class<?>[], Class<?>> {
        // prefix for all proxy class names
        private static final String proxyClassNamePrefix = "$Proxy";
 
        // next number to use for generation of unique proxy class names
        private static final AtomicLong nextUniqueNumber = new AtomicLong();
 
        @Override
        public Class<?> apply(ClassLoader loader, Class<?>[] interfaces) {
            Map<Class<?>, Boolean> interfaceSet = new IdentityHashMap<>(interfaces.length);
            for (Class<?> intf : interfaces) {
                /*
                 * Verify that the class loader resolves the name of this
                 * interface to the same Class object.
                 */
                Class<?> interfaceClass = null;
                try {
                    interfaceClass = Class.forName(intf.getName(), false, loader);
                } catch (ClassNotFoundException e) {
                }
                if (interfaceClass != intf) {
                    throw new IllegalArgumentException(
                        intf + " is not visible from class loader");
                }
                /*
                 * Verify that the Class object actually represents an
                 * interface.
                 */
                if (!interfaceClass.isInterface()) {
                    throw new IllegalArgumentException(
                        interfaceClass.getName() + " is not an interface");
                }
                /*
                 * Verify that this interface is not a duplicate.
                 */
                if (interfaceSet.put(interfaceClass, Boolean.TRUE) != null) {
                    throw new IllegalArgumentException(
                        "repeated interface: " + interfaceClass.getName());
                }
            }
 
            String proxyPkg = null;     // package to define proxy class in
            int accessFlags = Modifier.PUBLIC | Modifier.FINAL;
 
            /*
             * Record the package of a non-public proxy interface so that the
             * proxy class will be defined in the same package.  Verify that
             * all non-public proxy interfaces are in the same package.
             */
            for (Class<?> intf : interfaces) {
                int flags = intf.getModifiers();
                if (!Modifier.isPublic(flags)) {
                    accessFlags = Modifier.FINAL;
                    String name = intf.getName();
                    int n = name.lastIndexOf('.');
                    String pkg = ((n == -1) ? "" : name.substring(0, n + 1));
                    if (proxyPkg == null) {
                        proxyPkg = pkg;
                    } else if (!pkg.equals(proxyPkg)) {
                        throw new IllegalArgumentException(
                            "non-public interfaces from different packages");
                    }
                }
            }
 
            if (proxyPkg == null) {
                // if no non-public proxy interfaces, use com.sun.proxy package
                proxyPkg = ReflectUtil.PROXY_PACKAGE + ".";
            }
 
            /*
             * Choose a name for the proxy class to generate.
             */
            long num = nextUniqueNumber.getAndIncrement();
            String proxyName = proxyPkg + proxyClassNamePrefix + num;
 
            /*
             * Generate the specified proxy class.
             */
            byte[] proxyClassFile = ProxyGenerator.generateProxyClass(
                proxyName, interfaces, accessFlags);
            try {
                return defineClass0(loader, proxyName, proxyClassFile, 0, proxyClassFile.length);
            } catch (ClassFormatError e) {
                /*
                 * A ClassFormatError here means that (barring bugs in the
                 * proxy class generation code) there was some other
                 * invalid aspect of the arguments supplied to the proxy
                 * class creation (such as virtual machine limitations
                 * exceeded).
                 */
                throw new IllegalArgumentException(e.toString());
            }
        }
    }
```
通过看代码终于找到了重点：
```
//生成字节码
byte[] proxyClassFile = ProxyGenerator.generateProxyClass(proxyName, interfaces, accessFlags);
```
那么接下来我们也使用测试一下，使用这个方法生成的字节码是个什么样子：
```
package jiankunking;
 
import sun.misc.ProxyGenerator;
 
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
 
/**
 * 动态代理演示
 */
public class DynamicProxyDemonstration {
    public static void main(String[] args) {
        //代理的真实对象
        Subject realSubject = new RealSubject();
 
        /**
         * InvocationHandlerImpl 实现了 InvocationHandler 接口，并能实现方法调用从代理类到委托类的分派转发
         * 其内部通常包含指向委托类实例的引用，用于真正执行分派转发过来的方法调用.
         * 即：要代理哪个真实对象，就将该对象传进去，最后是通过该真实对象来调用其方法
         */
        InvocationHandler handler = new InvocationHandlerImpl(realSubject);
 
        ClassLoader loader = handler.getClass().getClassLoader();
        Class[] interfaces = realSubject.getClass().getInterfaces();
        /**
         * 该方法用于为指定类装载器、一组接口及调用处理器生成动态代理类实例
         */
        Subject subject = (Subject) Proxy.newProxyInstance(loader, interfaces, handler);
        System.out.println("动态代理对象的类型："+subject.getClass().getName());

        String hello = subject.SayHello("jiankunking");
        System.out.println(hello);
        // 将生成的字节码保存到本地，
        createProxyClassFile();
    }
    private static void createProxyClassFile(){
        String name = "ProxySubject";
        byte[] data = ProxyGenerator.generateProxyClass(name,new Class[]{Subject.class});
        FileOutputStream out =null;
        try {
            out = new FileOutputStream(name+".class");
            System.out.println((new File("hello")).getAbsolutePath());
            out.write(data);
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }finally {
            if(null!=out) try {
                out.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }
}
```
可以看一下这里代理对象的类型：

![](/images/spring-jdk-aop/动态代理对象类型.png)
我们用jd-jui 工具将生成的字节码反编译：
```
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.lang.reflect.UndeclaredThrowableException;
import jiankunking.Subject;
 
public final class ProxySubject extends Proxy implements Subject {
  private static Method m1;
  private static Method m3;
  private static Method m4;
  private static Method m2;
  private static Method m0;
  
  public ProxySubject(InvocationHandler paramInvocationHandler) {
    super(paramInvocationHandler);
  }
  
  public final boolean equals(Object paramObject){
    try {
        return ((Boolean)this.h.invoke(this, m1, new Object[] { paramObject })).booleanValue();
    } catch (Error|RuntimeException localError){
        throw localError;
    } catch (Throwable localThrowable) {
      throw new UndeclaredThrowableException(localThrowable);
    }
  }
  
  public final String SayGoodBye() {
    try{
      return (String)this.h.invoke(this, m3, null);
    } catch (Error|RuntimeException localError) {
      throw localError;
    } catch (Throwable localThrowable) {
      throw new UndeclaredThrowableException(localThrowable);
    }
  }
  
  public final String SayHello(String paramString) {
    try {
      return (String)this.h.invoke(this, m4, new Object[] { paramString });
    } catch (Error|RuntimeException localError){
      throw localError;
    } catch (Throwable localThrowable){
      throw new UndeclaredThrowableException(localThrowable);
    }
  }
  
  public final String toString() {
    try {
      return (String)this.h.invoke(this, m2, null);
    } catch (Error|RuntimeException localError) {
      throw localError;
    } catch (Throwable localThrowable) {
      throw new UndeclaredThrowableException(localThrowable);
    }
  }
  
  public final int hashCode() {
    try {
      return ((Integer)this.h.invoke(this, m0, null)).intValue();
    } catch (Error|RuntimeException localError) {
      throw localError;
    } catch (Throwable localThrowable) {
      throw new UndeclaredThrowableException(localThrowable);
    }
  }
  
  static
  {
    try {
      m1 = Class.forName("java.lang.Object").getMethod("equals", new Class[] { Class.forName("java.lang.Object") });
      m3 = Class.forName("jiankunking.Subject").getMethod("SayGoodBye", new Class[0]);
      m4 = Class.forName("jiankunking.Subject").getMethod("SayHello", new Class[] { Class.forName("java.lang.String") });
      m2 = Class.forName("java.lang.Object").getMethod("toString", new Class[0]);
      m0 = Class.forName("java.lang.Object").getMethod("hashCode", new Class[0]);
      return;
    } catch (NoSuchMethodException localNoSuchMethodException) {
      throw new NoSuchMethodError(localNoSuchMethodException.getMessage());
    } catch (ClassNotFoundException localClassNotFoundException) {
      throw new NoClassDefFoundError(localClassNotFoundException.getMessage());
    }
  }
}
```
这就是最终真正的代理类，它继承自Proxy并实现了我们定义的Subject接口，也就是说：
```
Subject subject = (Subject) Proxy.newProxyInstance(loader, interfaces, handler);
```
这里的subject实际是这个类的一个实例，那么我们调用它的：
```
public final String SayHello(String paramString)
```
就是调用我们定义的InvocationHandlerImpl的 invoke方法：

![](/images/spring-jdk-aop/sayhello.png)
> 上面是代码跟分析的过程，不想看的朋友可以直接看结论

# 五、结论

到了这里，终于解答了：

subject.SayHello("jiankunking")这句话时，为什么会自动调用InvocationHandlerImpl的invoke方法？

因为JDK生成的最终真正的代理类，它继承自Proxy并实现了我们定义的Subject接口，在实现Subject接口方法的内部，通过反射调用了InvocationHandlerImpl的invoke方法。


通过分析代码可以看出Java 动态代理，具体有如下四步骤：

1. 通过实现 InvocationHandler 接口创建自己的调用处理器；

2. 通过为 Proxy 类指定 ClassLoader 对象和一组 interface 来创建动态代理类；

3. 通过反射机制获得动态代理类的构造函数，其唯一参数类型是调用处理器接口类型；

4. 通过构造函数创建动态代理类实例，构造时调用处理器对象作为参数被传入。

演示代码下载：
[https://github.com/jiankunking/DynamicProxyDemo](https://github.com/jiankunking/DynamicProxyDemo)