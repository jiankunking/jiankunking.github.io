---
title: Java HashMap
categories:
  - Java
tags:
  - Java
  - HashMap
  - 原创
abbrlink: 55751
date: 2016-09-26 22:53:19
---
>  代码基于 Jdk1.8

<!-- more -->

最近在工作用到Map等一系列的集合，于是，想仔细看一下其具体实现。

# 结构
```
public class HashMap<K,V> extends AbstractMap<K,V>
    implements Map<K,V>, Cloneable, Serializable
```
## 抽象类AbstractMap
```
public abstract class AbstractMap<K,V> implements Map<K,V>
```
该类实现了Map接口，具体结构如下：
![](/images/java-hashmap/AbstractMap结构.png)
该类代码很简单，不再赘述。

## 序列化接口：Serializable
该接口没有什么好说的，但通过该接口，就解释了为什么HashMap总一些字段是用transient来修饰。
> 一旦变量被transient修饰，变量将不再是对象持久化的一部分，该变量内容在序列化后无法获得访问。

# 阅读JDK中类注释
## HashMap是无序的
如果希望保持元素的输入顺序应该使用LinkedHashMap

## 除了非同步和允许使用null之外，HashMap与Hashtable基本一致。
此处的非同步指的是多线程访问，并至少一个线程修改HashMap结构。结构修改包括任何新增、删除映射，但仅仅修改HashMap中已存在项值得操作不属于结构修改。

## 初始容量与加载因子是影响HashMap的两个重要因素。
```
public HashMap(int initialCapacity, float loadFactor)
```
初始容量默认值：
```
/**
 * The default initial capacity - MUST be a power of two.
 */
static final int DEFAULT_INITIAL_CAPACITY = 1 << 4; // aka 16
```
加载因子默认值：
```
/**
 * The load factor used when none specified in constructor.
 */
static final float DEFAULT_LOAD_FACTOR = 0.75f;
```
容量是HashMap在创建时“桶”的数量，而初始容量是哈希表在创建时分配的空间大小。加载因子是哈希表在其容量自动增加时能达到多满的衡量尺度（比如默认为0.75，即桶中数据达到3/4就不能再放数据了）。

> 默认的负载因子大小为0.75，也就是说，当一个map填满了75%的bucket时候，和其它集合类(如ArrayList等)一样，将会创建原来HashMap大小的两倍的bucket数组，来重新调整map的大小，并将原来的对象放入新的bucket数组中。这个过程叫作rehashing，因为它调用hash方法找到新的bucket位置。
> 当重新调整HashMap大小的时候，会存在条件竞争，因为如果两个线程都发现HashMap需要重新调整大小了，它们会同时试着调整大小。在调整大小的过程中，存储在链表中的元素的次序会反过来，因为移动到新的bucket位置的时候，HashMap并不会将元素放在链表的尾部，而是放在头部，这是为了避免尾部遍历(tail traversing)。如果条件竞争发生了，那么就死循环了。
> 所以 HashMap应该避免在多线程环境下使用。

默认0.75这是时间和空间成本上一种折衷：增大负载因子可以减少 Hash 表（就是那个 Entry 数组）所占用的内存空间，但会增加查询数据的时间开销，而查询是最频繁的的操作（HashMap 的 get() 与 put() 方法都要用到查询）；减小负载因子会提高数据查询的性能，但会增加 Hash 表所占用的内存空间。

## 存储形式
链表形式存储？树形结构？
```
* This map usually acts as a binned (bucketed) hash table, but
* when bins get too large, they are transformed into bins of
* TreeNodes, each structured similarly to those in
* java.util.TreeMap. Most methods try to use normal bins, but
* relay to TreeNode methods when applicable (simply by checking
* instanceof a node). 
```
# 源码阅读
## 添加元素
```
	/**
     * Associates the specified value with the specified key in this map.
     * If the map previously contained a mapping for the key, the old
     * value is replaced.
     *
     * @param key key with which the specified value is to be associated
     * @param value value to be associated with the specified key
     * @return the previous value associated with <tt>key</tt>, or
     *         <tt>null</tt> if there was no mapping for <tt>key</tt>.
     *         (A <tt>null</tt> return can also indicate that the map
     *         previously associated <tt>null</tt> with <tt>key</tt>.)
     */
    public V put(K key, V value) {
        return putVal(hash(key), key, value, false, true);
    }

    /**
     * Implements Map.put and related methods
     *
     * @param hash hash for key
     * @param key the key
     * @param value the value to put
     * @param onlyIfAbsent if true, don't change existing value
     * @param evict if false, the table is in creation mode.
     * @return previous value, or null if none
     */
    final V putVal(int hash, K key, V value, boolean onlyIfAbsent,
                   boolean evict) {
        Node<K,V>[] tab; Node<K,V> p; int n, i;
        //hashmap第一次添加元素，调用resize()方法初始化table
        if ((tab = table) == null || (n = tab.length) == 0)
            n = (tab = resize()).length;
        //通过与运算判断tab[hash]位置是否有值
        //从newNode这里可以看出，hashmap中key value是以Node<K,V>实例的形式存放的
        if ((p = tab[i = (n - 1) & hash]) == null)
            tab[i] = newNode(hash, key, value, null);
        //tab[i]有元素，则需要遍历结点后再添加
        else {
            Node<K,V> e; K k;
            // hash、key均等，说明待插入元素和第一个元素相等，直接更新
            if (p.hash == hash &&
                ((k = p.key) == key || (key != null && key.equals(k))))
                e = p;
            else if (p instanceof TreeNode)//如果p类型为TreeNode，调用树的添加元素方法(红黑树冲突插入)
                e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
            else {
                //不是TreeNode,即为链表,遍历链表，查找给定关键字 
                for (int binCount = 0; ; ++binCount) {
                    if ((e = p.next) == null) {
                    //到达链表的尾端也没有找到key值相同的节点，则生成一个新的Node
                        p.next = newNode(hash, key, value, null);
                        //创建新节点后若超出树形化阈值，则转换为树形存储  
                        if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st
                            treeifyBin(tab, hash);//当桶中链表的数量>=9的时候，底层则改为红黑树实现
                        break;
                    }
                    //如果找到关键字相同的结点  
                    if (e.hash == hash &&
                        ((k = e.key) == key || (key != null && key.equals(k))))
                        break;
                    //更新p指向下一个节点
                    p = e;
                }
            }
            // e不为空，即map中存在要添加的关键字  
            if (e != null) { // existing mapping for key
                V oldValue = e.value;
                if (!onlyIfAbsent || oldValue == null)
                    e.value = value;
                afterNodeAccess(e);
                return oldValue;
            }
        }
        ++modCount;
        if (++size > threshold)
            resize();//扩容
        afterNodeInsertion(evict);
        return null;
    }
```
小注：
1、回调
```
afterNodeAccess(e);
afterNodeInsertion(evict);
```
是为LinkedHashMap回调准备的。
2、计算hash值
```
 /**
 * Computes key.hashCode() and spreads (XORs) higher bits of hash
 * to lower.  Because the table uses power-of-two masking, sets of
 * hashes that vary only in bits above the current mask will
 * always collide. (Among known examples are sets of Float keys
 * holding consecutive whole numbers in small tables.)  So we
 * apply a transform that spreads the impact of higher bits
 * downward. There is a tradeoff between speed, utility, and
 * quality of bit-spreading. Because many common sets of hashes
 * are already reasonably distributed (so don't benefit from
 * spreading), and because we use trees to handle large sets of
 * collisions in bins, we just XOR some shifted bits in the
 * cheapest possible way to reduce systematic lossage, as well as
 * to incorporate impact of the highest bits that would otherwise
 * never be used in index calculations because of table bounds.
 */
static final int hash(Object key) {
	int h;
	return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```
‘>>>’：无符号右移，忽略符号位，空位都以0补齐
> value >>> num – num 指定要移位值value 移动的位数。

即按二进制形式把所有的数字向右移动对应位数，低位移出（舍弃），高位的空位补零。对于正数来说和带符号右移相同，对于负数来说不同。

^异或：两个操作数的位中，相同则结果为0，不同则结果为1。

这也正好解释了为什么HashMap底层数组的长度总是 2 的 n 次方。因为这样（数组长度-1）正好相当于一个“低位掩码”。“异或”操作的结果就是散列值的高位全部归零，只保留低位值，用来做数组下标访问。 
以初始长度16为例，16-1=15。 
2进制表示是00000000 00000000 00001111。 
和某hash值做“异或”操作如下，结果就是截取了最低的四位值。
```
10100101 11000100 00100101
00000000 00000000 00001111
----------------------------------
00000000 00000000 00000101    //高位全部归零，只保留末四位
```
更详细的步骤如下： 

![](/images/java-hashmap/异或运算.png)

3、存储结构 

![](/images/java-hashmap/hashmap结构.png)
![](/images/java-hashmap/table数组.png)

## 获取元素
```
	/**
     * Returns the value to which the specified key is mapped,
     * or {@code null} if this map contains no mapping for the key.
     *
     * <p>More formally, if this map contains a mapping from a key
     * {@code k} to a value {@code v} such that {@code (key==null ? k==null :
     * key.equals(k))}, then this method returns {@code v}; otherwise
     * it returns {@code null}.  (There can be at most one such mapping.)
     *
     * <p>A return value of {@code null} does not <i>necessarily</i>
     * indicate that the map contains no mapping for the key; it's also
     * possible that the map explicitly maps the key to {@code null}.
     * The {@link #containsKey containsKey} operation may be used to
     * distinguish these two cases.
     *
     * @see #put(Object, Object)
     */
    public V get(Object key) {
        Node<K,V> e;
        return (e = getNode(hash(key), key)) == null ? null : e.value;
    }

    /**
     * Implements Map.get and related methods
     *
     * @param hash hash for key
     * @param key the key
     * @return the node, or null if none
     */
    final Node<K,V> getNode(int hash, Object key) {
        Node<K,V>[] tab; Node<K,V> first, e; int n; K k;
        if ((tab = table) != null && (n = tab.length) > 0 &&
            //hash & length-1 定位数组下标
            (first = tab[(n - 1) & hash]) != null) {
            if (first.hash == hash && // always check first node
                ((k = first.key) == key || (key != null && key.equals(k))))
                return first;
            if ((e = first.next) != null) {
                //第一个节点是TreeNode,则采用位桶+红黑树结构， 
                //调用TreeNode.getTreeNode(hash,key), 
                //遍历红黑树，得到节点的value  
                if (first instanceof TreeNode)
                    return ((TreeNode<K,V>)first).getTreeNode(hash, key);
                do {
                    if (e.hash == hash &&
                        ((k = e.key) == key || (key != null && key.equals(k))))
                        return e;
                } while ((e = e.next) != null);
            }
        }
        return null;
    }
```
树节点的查找：
```
        /**
         * Calls find for root node.
         */
        final TreeNode<K,V> getTreeNode(int h, Object k) {
            return ((parent != null) ? root() : this).find(h, k, null);
        }
        /**
         * Finds the node starting at root p with the given hash and key.
         * The kc argument caches comparableClassFor(key) upon first use
         * comparing keys.
         *通过hash值的比较，递归的去遍历红黑树，
         compareableClassFor(Class k)：判断实例k对应的类是否实现了Comparable接口，如果实现了该接口并
         在某些时候如果红黑树节点的元素are of the same "class C implements Comparable<C>" type  
         *利用他们的compareTo()方法来比较大小，这里需要通过反射机制来check他们到底是不是属于同一个类,是不是具有可比较性.
         */
        final TreeNode<K,V> find(int h, Object k, Class<?> kc) {
            TreeNode<K,V> p = this;
            do {
                int ph, dir; K pk;
                TreeNode<K,V> pl = p.left, pr = p.right, q;
                if ((ph = p.hash) > h)
                    p = pl;
                else if (ph < h)
                    p = pr;
                else if ((pk = p.key) == k || (k != null && k.equals(pk)))
                    return p;
                else if (pl == null)
                    p = pr;
                else if (pr == null)
                    p = pl;
                else if ((kc != null ||
                          (kc = comparableClassFor(k)) != null) &&
                         (dir = compareComparables(kc, k, pk)) != 0)
                    p = (dir < 0) ? pl : pr;
                else if ((q = pr.find(h, k, kc)) != null)
                    return q;
                else
                    p = pl;
            } while (p != null);
            return null;
        }
```

## 元素包含containsKey
```
    /**
     * Returns <tt>true</tt> if this map contains a mapping for the
     * specified key.
     *
     * @param   key   The key whose presence in this map is to be tested
     * @return <tt>true</tt> if this map contains a mapping for the specified
     * key.
     */
    public boolean containsKey(Object key) {
        return getNode(hash(key), key) != null;
    }
    /**
     * Implements Map.get and related methods
     *
     * @param hash hash for key
     * @param key the key
     * @return the node, or null if none
     */
    final Node<K,V> getNode(int hash, Object key) {
        Node<K,V>[] tab; Node<K,V> first, e; int n; K k;
        if ((tab = table) != null && (n = tab.length) > 0 &&
            //判断tab[hash]位置是否有值
            (first = tab[(n - 1) & hash]) != null) {
            if (first.hash == hash && // always check first node
                ((k = first.key) == key || (key != null && key.equals(k))))
                return first;
            if ((e = first.next) != null) {
                if (first instanceof TreeNode)
                    return ((TreeNode<K,V>)first).getTreeNode(hash, key);
                //遍历寻找 
                do {
                    if (e.hash == hash &&
                        ((k = e.key) == key || (key != null && key.equals(k))))
                        return e;
                } while ((e = e.next) != null);
            }
        }
        return null;
    }
     /**
      * Calls find for root node.
      */
      final TreeNode<K,V> getTreeNode(int h, Object k) {
          return ((parent != null) ? root() : this).find(h, k, null);
       }
     	/**
         * Returns root of tree containing this node.
         * 获取红黑树的根
         */
        final TreeNode<K,V> root() {
            for (TreeNode<K,V> r = this, p;;) {
                if ((p = r.parent) == null)
                    return r;
                r = p;
            }
        }
    	/**
         * Finds the node starting at root p with the given hash and key.
         * The kc argument caches comparableClassFor(key) upon first use
         * comparing keys.
         */
        final TreeNode<K,V> find(int h, Object k, Class<?> kc) {// k即key，kc为null
            TreeNode<K,V> p = this;
            do {
                int ph, dir; K pk;
                TreeNode<K,V> pl = p.left, pr = p.right, q;
                if ((ph = p.hash) > h)// ph存当前节点hash
                    p = pl;
                else if (ph < h) // 所查hash比当前节点hash大
                    p = pr;// 查右子树
                else if ((pk = p.key) == k || (k != null && k.equals(pk)))
                    return p;// hash、key均相同，【找到了！】返回当前节点
                else if (pl == null)// hash等，key不等，且当前节点的左节点null
                    p = pr;//查右子树
                else if (pr == null)
                    p = pl;
               //get->getTreeNode传递的kc为null。||逻辑或,短路运算,有真即可
               // false || (false && ？？)
                else if ((kc != null ||
                          (kc = comparableClassFor(k)) != null) &&
                         (dir = compareComparables(kc, k, pk)) != 0)
                    p = (dir < 0) ? pl : pr;
                else if ((q = pr.find(h, k, kc)) != null)
                    return q;
                else
                    p = pl;
            } while (p != null);
            return null;
        }
```
## 移除remove
```
 	/**
     * Removes the mapping for the specified key from this map if present.
     *
     * @param  key key whose mapping is to be removed from the map
     * @return the previous value associated with <tt>key</tt>, or
     *         <tt>null</tt> if there was no mapping for <tt>key</tt>.
     *         (A <tt>null</tt> return can also indicate that the map
     *         previously associated <tt>null</tt> with <tt>key</tt>.)
     */
    public V remove(Object key) {
        Node<K,V> e;
        return (e = removeNode(hash(key), key, null, false, true)) == null ?
            null : e.value;
    }
     /**
     * Implements Map.remove and related methods
     *
     * @param hash hash for key
     * @param key the key
     * @param value the value to match if matchValue, else ignored
     * @param matchValue if true only remove if value is equal
     * @param movable if false do not move other nodes while removing
     * @return the node, or null if none
     */
    final Node<K,V> removeNode(int hash, Object key, Object value,
                               boolean matchValue, boolean movable) {
        Node<K,V>[] tab; Node<K,V> p; int n, index;
        if ((tab = table) != null && (n = tab.length) > 0 &&
            (p = tab[index = (n - 1) & hash]) != null) {
            Node<K,V> node = null, e; K k; V v;
            if (p.hash == hash &&
            //先比较内存地址，如果地址不一致，再调用equals进行比较
                ((k = p.key) == key || (key != null && key.equals(k))))
                node = p;
            else if ((e = p.next) != null) {
                //如果是以红黑树处理冲突，则通过getTreeNode查找
                if (p instanceof TreeNode)
                    node = ((TreeNode<K,V>)p).getTreeNode(hash, key);
                else {
                     //如果是以链式的方式处理冲突，则通过遍历链表来寻找节点
                    do {
                        if (e.hash == hash &&
                            ((k = e.key) == key ||
                             (key != null && key.equals(k)))) {
                            node = e;
                            break;
                        }
                        p = e;
                    } while ((e = e.next) != null);
                }
            }
             //比对找到的key的value跟要删除的是否匹配
            if (node != null && (!matchValue || (v = node.value) == value ||
                                 (value != null && value.equals(v)))) {
                if (node instanceof TreeNode)
                    ((TreeNode<K,V>)node).removeTreeNode(this, tab, movable);
                else if (node == p)
                    tab[index] = node.next;
                else
                    p.next = node.next;
                //已从结构上修改 此列表的次数
                ++modCount;
                --size;
                //回调
                afterNodeRemoval(node);
                return node;
            }
        }
        return null;
    }
        /**
         * Removes the given node, that must be present before this call.
         * This is messier than typical red-black deletion code because we
         * cannot swap the contents of an interior node with a leaf
         * successor that is pinned by "next" pointers that are accessible
         * independently during traversal. So instead we swap the tree
         * linkages. If the current tree appears to have too few nodes,
         * the bin is converted back to a plain bin. (The test triggers
         * somewhere between 2 and 6 nodes, depending on tree structure).
         */
        final void removeTreeNode(HashMap<K,V> map, Node<K,V>[] tab,
                                  boolean movable) {
            int n;
            if (tab == null || (n = tab.length) == 0)
                return;
            int index = (n - 1) & hash;
            TreeNode<K,V> first = (TreeNode<K,V>)tab[index], root = first, rl;
            TreeNode<K,V> succ = (TreeNode<K,V>)next, pred = prev;
            if (pred == null)
                tab[index] = first = succ;
            else
                pred.next = succ;
            if (succ != null)
                succ.prev = pred;
            if (first == null)
                return;
            if (root.parent != null)
                root = root.root();
            if (root == null || root.right == null ||
                (rl = root.left) == null || rl.left == null) {
                tab[index] = first.untreeify(map);  // too small
                return;
            }
            TreeNode<K,V> p = this, pl = left, pr = right, replacement;
            if (pl != null && pr != null) {
                TreeNode<K,V> s = pr, sl;
                while ((sl = s.left) != null) // find successor
                    s = sl;
                boolean c = s.red; s.red = p.red; p.red = c; // swap colors
                TreeNode<K,V> sr = s.right;
                TreeNode<K,V> pp = p.parent;
                if (s == pr) { // p was s's direct parent
                    p.parent = s;
                    s.right = p;
                }
                else {
                    TreeNode<K,V> sp = s.parent;
                    if ((p.parent = sp) != null) {
                        if (s == sp.left)
                            sp.left = p;
                        else
                            sp.right = p;
                    }
                    if ((s.right = pr) != null)
                        pr.parent = s;
                }
                p.left = null;
                if ((p.right = sr) != null)
                    sr.parent = p;
                if ((s.left = pl) != null)
                    pl.parent = s;
                if ((s.parent = pp) == null)
                    root = s;
                else if (p == pp.left)
                    pp.left = s;
                else
                    pp.right = s;
                if (sr != null)
                    replacement = sr;
                else
                    replacement = p;
            }
            else if (pl != null)
                replacement = pl;
            else if (pr != null)
                replacement = pr;
            else
                replacement = p;
            if (replacement != p) {
                TreeNode<K,V> pp = replacement.parent = p.parent;
                if (pp == null)
                    root = replacement;
                else if (p == pp.left)
                    pp.left = replacement;
                else
                    pp.right = replacement;
                p.left = p.right = p.parent = null;
            }

            TreeNode<K,V> r = p.red ? root : balanceDeletion(root, replacement);

            if (replacement == p) {  // detach
                TreeNode<K,V> pp = p.parent;
                p.parent = null;
                if (pp != null) {
                    if (p == pp.left)
                        pp.left = null;
                    else if (p == pp.right)
                        pp.right = null;
                }
            }
            if (movable)
                moveRootToFront(tab, r);
        }
```

# 小结
在创建 HashMap 时根据实际需要适当地调整 load factor 的值；如果程序比较关心空间开销、内存比较紧张，可以适当地增加负载因子；如果程序比较关心时间开销，内存比较宽裕则可以适当的减少负载因子。通常情况下，程序员无需改变负载因子的值。

如果开始就知道 HashMap 会保存多个 key-value 对，可以在创建时就使用较大的初始化容量，如果 HashMap 中 Entry 的数量一直不会超过极限容量（capacity * load factor），HashMap 就无需调用 resize() 方法重新分配 table 数组，从而保证较好的性能。当然，开始就将初始容量设置太高可能会浪费空间（系统需要创建一个长度为 capacity 的 Entry 数组），因此创建 HashMap 时初始化容量设置也需要小心对待。

HashMap高性能需要以下几点： 
* 高效的hash算法 
* 保证hash值到内存地址（数组索引）的映射速度 
* 根据内存地址（数组索引）可以直接得到相应的值