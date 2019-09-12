---
layout: w
title: Go 1.9 Sync Map
date: 2017-12-16 13:28:44
categories:
  - Go
tags:
  - Go
  - Sync
  - Map
  - 原创
---

> 基于Go 1.9 解析Sync Map

<!-- more -->

# 概要

## Package
![](/images/go-sync-map/package.png)

本文主要阐述：Load、Store、Delete，更加详细的阐述可以参考源码描述（建议先大体浏览一下Map源码）。

## 实现思路
* 空间换时间。 通过冗余的两个数据结构(read、dirty),实现加锁对性能的影响。
* 使用只读数据(read)，避免读写冲突。
* 动态调整，miss次数多了之后，将dirty数据提升为read。
* double-checking。
*延迟删除。 删除一个键值只是打标记（会将key对应value的pointer置为nil，但read中仍然有这个key:key;value:nil的键值对），只有在提升dirty的时候才清理删除的数据。
* 优先从read读取、更新、删除，因为对read的读取不需要锁。
* 虽然read和dirty有冗余数据，但这些数据是通过指针指向同一个数据，所以尽管Map的value会很大，但是冗余的空间占用还是有限的。

# 数据结构
## Map
```
// Map is a concurrent map with amortized-constant-time loads, stores, and deletes.
// It is safe for multiple goroutines to call a Map's methods concurrently.
//
// It is optimized for use in concurrent loops with keys that are
// stable over time, and either few steady-state stores, or stores
// localized to one goroutine per key.
//
// For use cases that do not share these attributes, it will likely have
// comparable or worse performance and worse type safety than an ordinary
// map paired with a read-write mutex.
//
// The zero Map is valid and empty.
//
// A Map must not be copied after first use.

//该 Map 是线程安全的，读取，插入，删除也都保持着常数级的时间复杂度。
//多个 goroutines 协程同时调用 Map 方法也是线程安全的。该 Map 的零值是有效的，
//并且零值是一个空的 Map 。线程安全的 Map 在第一次使用之后，不允许被拷贝。
type Map struct {
	mu Mutex

	// read contains the portion of the map's contents that are safe for
	// concurrent access (with or without mu held).
	//
	// The read field itself is always safe to load, but must only be stored with
	// mu held.
	//
	// Entries stored in read may be updated concurrently without mu, but updating
	// a previously-expunged entry requires that the entry be copied to the dirty
	// map and unexpunged with mu held.
	
	 // 一个只读的数据结构，因为只读，所以不会有读写冲突。
    // 所以从这个数据中读取总是安全的。
    // 实际上，实际也会更新这个数据的entries,如果entry是未删除的(unexpunged), 并不需要加锁。如果entry已经被删除了，需要加锁，以便更新dirty数据。
	read atomic.Value // readOnly

	// dirty contains the portion of the map's contents that require mu to be
	// held. To ensure that the dirty map can be promoted to the read map quickly,
	// it also includes all of the non-expunged entries in the read map.
	//
	// Expunged entries are not stored in the dirty map. An expunged entry in the
	// clean map must be unexpunged and added to the dirty map before a new value
	// can be stored to it.
	//
	// If the dirty map is nil, the next write to the map will initialize it by
	// making a shallow copy of the clean map, omitting stale entries.

	// dirty数据包含当前的map包含的entries,它包含最新的entries(包括read中未删除的数据,虽有冗余，但是提升dirty字段为read的时候非常快，不用一个一个的复制，而是直接将这个数据结构作为read字段的一部分),有些数据还可能没有移动到read字段中。
    // 对于dirty的操作需要加锁，因为对它的操作可能会有读写竞争。
    // 当dirty为空的时候， 比如初始化或者刚提升完，下一次的写操作会复制read字段中未删除的数据到这个数据中。
	dirty map[interface{}]*entry

	// misses counts the number of loads since the read map was last updated that
	// needed to lock mu to determine whether the key was present.
	//
	// Once enough misses have occurred to cover the cost of copying the dirty
	// map, the dirty map will be promoted to the read map (in the unamended
	// state) and the next store to the map will make a new dirty copy.
	// 当从Map中读取entry的时候，如果read中不包含这个entry,会尝试从dirty中读取，这个时候会将misses加一，
    // 当misses累积到 dirty的长度的时候， 就会将dirty提升为read,避免从dirty中miss太多次。因为操作dirty需要加锁。
	misses int
}
```

## readOnly
```
// readOnly is an immutable struct stored atomically in the Map.read field.
type readOnly struct {
	m       map[interface{}]*entry
	// true if the dirty map contains some key not in m.
	// 如果Map.dirty有些数据不在中的时候，这个值为true
	amended bool 
}
```

## entry
```
// An entry is a slot in the map corresponding to a particular key.
type entry struct {
	// p points to the interface{} value stored for the entry.
	//
	// If p == nil, the entry has been deleted and m.dirty == nil.
	//
	// If p == expunged, the entry has been deleted, m.dirty != nil, and the entry
	// is missing from m.dirty.
	//
	// Otherwise, the entry is valid and recorded in m.read.m[key] and, if m.dirty
	// != nil, in m.dirty[key].
	//
	// An entry can be deleted by atomic replacement with nil: when m.dirty is
	// next created, it will atomically replace nil with expunged and leave
	// m.dirty[key] unset.
	//
	// An entry's associated value can be updated by atomic replacement, provided
	// p != expunged. If p == expunged, an entry's associated value can be updated
	// only after first setting m.dirty[key] = e so that lookups using the dirty
	// map find the entry.

	//p有三种值：
	//nil: entry已被删除了，并且m.dirty为nil
	//expunged: entry已被删除了，并且m.dirty不为nil，而且这个entry不存在于m.dirty中
	//其它： entry是一个正常的值
	p unsafe.Pointer // *interface{}
}
```
## Value
```
// A Value provides an atomic load and store of a consistently typed value.
// Values can be created as part of other data structures.
// The zero value for a Value returns nil from Load.
// Once Store has been called, a Value must not be copied.
//
// A Value must not be copied after first use.
type Value struct {
	noCopy noCopy

	v interface{}
}
```
![](/images/go-sync-map/map结构关系示意图)

# Load
据指定的key,查找对应的值value,如果不存在，通过ok反映。
```
func (m *Map) Load(key interface{}) (value interface{}, ok bool) {
	read, _ := m.read.Load().(readOnly)
	e, ok := read.m[key]
	// 如果没找到，并且m.dirty中有新数据，需要从m.dirty查找，这个时候需要加锁
	if !ok && read.amended {
		m.mu.Lock()
		// Avoid reporting a spurious miss if m.dirty got promoted while we were
		// blocked on m.mu. (If further loads of the same key will not miss, it's
		// not worth copying the dirty map for this key.)
		//double check,避免加锁的时候m.dirty提升为m.read,这个时候m.read可能被替换了。
		read, _ = m.read.Load().(readOnly)
		e, ok = read.m[key]
		if !ok && read.amended {
			e, ok = m.dirty[key]
			// Regardless of whether the entry was present, record a miss: this key
			// will take the slow path until the dirty map is promoted to the read
			// map.
			m.missLocked()
		}
		m.mu.Unlock()
	}
	if !ok {
		return nil, false
	}
	return e.load()
}

func (m *Map) missLocked() {
	m.misses++
	if m.misses < len(m.dirty) {
		return
	}
	m.read.Store(readOnly{m: m.dirty})
	m.dirty = nil
	m.misses = 0
}
```
![](/images/go-sync-map/get流程图.png)

# Store
更新或者新增一个entry
```
// Store sets the value for a key.
func (m *Map) Store(key, value interface{}) {
	read, _ := m.read.Load().(readOnly)
	// 从 read map 中读取 key 成功并且取出的 entry 尝试存储 value 成功，直接返回
	if e, ok := read.m[key]; ok && e.tryStore(&value) {
		return
	}

	m.mu.Lock()
	read, _ = m.read.Load().(readOnly)
	if e, ok := read.m[key]; ok {
		if e.unexpungeLocked() {//确保未被标记成删除，即e 指向的是非 nil 的
			// The entry was previously expunged, which implies that there is a
			// non-nil dirty map and this entry is not in it.
			//m.dirty中不存在这个键，所以加入m.dirty
			m.dirty[key] = e
		}
		e.storeLocked(&value)
	} else if e, ok := m.dirty[key]; ok {
		e.storeLocked(&value)
	} else {
		if !read.amended {
			// We're adding the first new key to the dirty map.
			// Make sure it is allocated and mark the read-only map as incomplete.
			m.dirtyLocked()
			m.read.Store(readOnly{m: read.m, amended: true})
		}
		m.dirty[key] = newEntry(value)
	}
	m.mu.Unlock()
}

// tryStore stores a value if the entry has not been expunged.
//
// If the entry is expunged, tryStore returns false and leaves the entry
// unchanged.
func (e *entry) tryStore(i *interface{}) bool {
	p := atomic.LoadPointer(&e.p)
	if p == expunged {
		return false
	}
	for {
		if atomic.CompareAndSwapPointer(&e.p, p, unsafe.Pointer(i)) {
			return true
		}
		p = atomic.LoadPointer(&e.p)
		if p == expunged {
			return false
		}
	}
}


func (m *Map) dirtyLocked() {
	if m.dirty != nil {
		return
	}

	read, _ := m.read.Load().(readOnly)
	m.dirty = make(map[interface{}]*entry, len(read.m))
	for k, e := range read.m {
		if !e.tryExpungeLocked() {
			m.dirty[k] = e
		}
	}
}

func (e *entry) tryExpungeLocked() (isExpunged bool) {
	p := atomic.LoadPointer(&e.p)
	for p == nil {
		 // 将已经删除标记为nil的数据标记为expunged
		if atomic.CompareAndSwapPointer(&e.p, nil, expunged) {
			return true
		}
		p = atomic.LoadPointer(&e.p)
	}
	return p == expunged
}

// unexpungeLocked ensures that the entry is not marked as expunged.
// If the entry was previously expunged, it must be added to the dirty map
// before m.mu is unlocked.

// unexpungeLocked 函数确保了 entry 没有被标记成已被清除。
// 如果 entry 先前被清除过了，那么在 mutex 解锁之前，它一定要被加入到 dirty map 中

//如果 entry 的 unexpungeLocked 返回为 true，那么就说明 entry 
//之前被标记成了 expunged，并经过 CAS 操作成功把它置为 nil。
func (e *entry) unexpungeLocked() (wasExpunged bool) {
	return atomic.CompareAndSwapPointer(&e.p, expunged, nil)
}
```
![](/images/go-sync-map/store流程图.bmp)

# Delete
删除一个键值
```
// Delete deletes the value for a key.
func (m *Map) Delete(key interface{}) {
	read, _ := m.read.Load().(readOnly)
	e, ok := read.m[key]
	if !ok && read.amended {
		m.mu.Lock()
		read, _ = m.read.Load().(readOnly)
		e, ok = read.m[key]
		if !ok && read.amended {
			delete(m.dirty, key)
		}
		m.mu.Unlock()
	}
	if ok {
		e.delete()
	}
}

func (e *entry) delete() (hadValue bool) {
	for {
		p := atomic.LoadPointer(&e.p)
		// 已标记为删除
		if p == nil || p == expunged {
			return false
		}
		// 原子操作，e.p标记为nil
		if atomic.CompareAndSwapPointer(&e.p, p, nil) {
			return true
		}
	}
}
```
![](/images/go-sync-map/delete流程图.png)

# 疑问

## 已经删除的key,再次Load的时候，会怎么样？
```
func (e *entry) load() (value interface{}, ok bool) {
	p := atomic.LoadPointer(&e.p)
	if p == nil || p == expunged {
		return nil, false
	}
	return *(*interface{})(p), true
}
```
在Map Load方法中调用e.load()时，load方法会识别该值是否已被删除

# Reference

https://studygolang.com/articles/10511
http://www.jianshu.com/p/43e66dab535b