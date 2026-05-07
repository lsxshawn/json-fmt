export class LRUCache {
  constructor(maxSize = 5000) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.head = null;
    this.tail = null;
  }

  get(key) {
    const node = this.cache.get(key);
    if (!node) return null;
    
    this._moveToHead(node);
    return node.value;
  }

  set(key, value) {
    let node = this.cache.get(key);
    
    if (node) {
      node.value = value;
      this._moveToHead(node);
    } else {
      node = { key, value, prev: null, next: null };
      this.cache.set(key, node);
      
      if (!this.head) {
        this.head = node;
        this.tail = node;
      } else {
        node.next = this.head;
        this.head.prev = node;
        this.head = node;
      }
      
      if (this.cache.size > this.maxSize) {
        this._removeTail();
      }
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  delete(key) {
    const node = this.cache.get(key);
    if (!node) return;
    
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  get size() {
    return this.cache.size;
  }

  _moveToHead(node) {
    if (node === this.head) return;
    
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    
    node.prev = null;
    node.next = this.head;
    this.head.prev = node;
    this.head = node;
  }

  _removeTail() {
    if (!this.tail) return;
    
    const key = this.tail.key;
    this.cache.delete(key);
    
    if (this.tail.prev) {
      this.tail.prev.next = null;
      this.tail = this.tail.prev;
    } else {
      this.head = null;
      this.tail = null;
    }
  }
}