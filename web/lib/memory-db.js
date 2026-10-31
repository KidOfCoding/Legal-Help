/**
 * Concurrency-safe in-memory MongoDB mock database.
 * Used for local testing and development when a live MongoDB Atlas cluster is not connected.
 * Faithfully implements atomic conditional operations ($inc, $set, $setOnInsert, $lt, $in).
 */

class MemoryCollection {
  constructor(name) {
    this.name = name;
    this.documents = [];
    this.indexes = [];
  }

  async createIndex(keys, options = {}) {
    this.indexes.push({ keys, options });
    return Object.keys(keys).join('_');
  }

  _matchesFilter(doc, filter) {
    for (const key of Object.keys(filter)) {
      const condition = filter[key];

      // Handle nested dot notation, e.g. 'circuitBreaker.state'
      let value = doc;
      const parts = key.split('.');
      for (const part of parts) {
        value = value !== undefined && value !== null ? value[part] : undefined;
      }

      if (condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
        if ('$lt' in condition && !(value < condition.$lt)) return false;
        if ('$lte' in condition && !(value <= condition.$lte)) return false;
        if ('$gt' in condition && !(value > condition.$gt)) return false;
        if ('$gte' in condition && !(value >= condition.$gte)) return false;
        if ('$ne' in condition && value === condition.$ne) return false;
        if ('$in' in condition && !condition.$in.includes(value)) return false;
        if ('$exists' in condition && (value !== undefined) !== condition.$exists) return false;
      } else {
        if (value !== condition) return false;
      }
    }
    return true;
  }

  _applyUpdate(doc, update, isInsert = false) {
    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) {
        const parts = k.split('.');
        let target = doc;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {};
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = v;
      }
    }

    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        const parts = k.split('.');
        let target = doc;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {};
          target = target[parts[i]];
        }
        const lastPart = parts[parts.length - 1];
        target[lastPart] = (target[lastPart] || 0) + v;
      }
    }

    if (isInsert && update.$setOnInsert) {
      for (const [k, v] of Object.entries(update.$setOnInsert)) {
        const parts = k.split('.');
        let target = doc;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {};
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = v;
      }
    }
  }

  async findOne(filter = {}) {
    return this.documents.find(d => this._matchesFilter(d, filter)) || null;
  }

  find(filter = {}) {
    let results = this.documents.filter(d => this._matchesFilter(d, filter));
    const cursor = {
      sort: (sortObj) => {
        const [field, direction] = Object.entries(sortObj)[0] || ['_id', 1];
        results.sort((a, b) => {
          if (a[field] < b[field]) return direction === 1 ? -1 : 1;
          if (a[field] > b[field]) return direction === 1 ? 1 : -1;
          return 0;
        });
        return cursor;
      },
      limit: (n) => {
        results = results.slice(0, n);
        return cursor;
      },
      toArray: async () => JSON.parse(JSON.stringify(results))
    };
    return cursor;
  }

  async insertOne(doc) {
    const copy = JSON.parse(JSON.stringify(doc));
    if (!copy._id) copy._id = 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    this.documents.push(copy);
    return { insertedId: copy._id };
  }

  async insertMany(docs) {
    const copies = docs.map(d => {
      const copy = JSON.parse(JSON.stringify(d));
      if (!copy._id) copy._id = 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      return copy;
    });
    this.documents.push(...copies);
    return { insertedCount: copies.length };
  }

  async updateOne(filter, update, options = {}) {
    const index = this.documents.findIndex(d => this._matchesFilter(d, filter));
    if (index >= 0) {
      this._applyUpdate(this.documents[index], update, false);
      return { matchedCount: 1, modifiedCount: 1 };
    }
    if (options.upsert) {
      const newDoc = { _id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) };
      for (const [k, v] of Object.entries(filter)) {
        if (!k.startsWith('$') && typeof v !== 'object') newDoc[k] = v;
      }
      this._applyUpdate(newDoc, update, true);
      this.documents.push(newDoc);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const index = this.documents.findIndex(d => this._matchesFilter(d, filter));
    if (index >= 0) {
      const doc = this.documents[index];
      const before = JSON.parse(JSON.stringify(doc));
      this._applyUpdate(doc, update, false);
      const after = JSON.parse(JSON.stringify(doc));
      return options.returnDocument === 'after' ? after : before;
    }
    if (options.upsert) {
      const newDoc = { _id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) };
      for (const [k, v] of Object.entries(filter)) {
        if (!k.startsWith('$') && typeof v !== 'object') newDoc[k] = v;
      }
      this._applyUpdate(newDoc, update, true);
      this.documents.push(newDoc);
      return JSON.parse(JSON.stringify(newDoc));
    }
    return null;
  }
}

class MemoryDb {
  constructor(name = 'legalhelp') {
    this.name = name;
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MemoryCollection(name));
    }
    return this.collections.get(name);
  }
}

const memoryDbInstance = new MemoryDb('legalhelp');

module.exports = {
  MemoryDb,
  memoryDbInstance
};

