/**
 * 内存版数据访问层：接口与 src/db/firestore.js 一致，用于单元测试与本地调试
 */
const INCREMENT = Symbol('increment');

function createMemoryDb() {
  const tables = {};
  let autoId = 0;
  const table = (col) => (tables[col] = tables[col] || {});
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

  const matches = (doc, where = []) => where.every(([field, op, value]) => {
    if (op === '==') return doc[field] === value;
    if (op === 'in') return value.includes(doc[field]);
    throw new Error(`memory db: unsupported op ${op}`);
  });

  const applyUpdate = (doc, data) => {
    Object.keys(data).forEach(key => {
      const v = data[key];
      if (v && v[INCREMENT] !== undefined) doc[key] = (doc[key] || 0) + v[INCREMENT];
      else if (v !== undefined) doc[key] = clone(v);
    });
  };

  const rows = (col, where) => Object.entries(table(col))
    .filter(([, doc]) => matches(doc, where))
    .map(([id, doc]) => ({ ...clone(doc), id }));

  const db = {
    tables,
    increment: (n) => ({ [INCREMENT]: n }),

    async get(col, id) {
      const doc = table(col)[id];
      return doc ? { ...clone(doc), id } : null;
    },
    async getMany(col, ids) {
      return Promise.all(ids.map(id => db.get(col, id)));
    },
    async query(col, where) {
      return rows(col, where);
    },
    async count(col, where) {
      return rows(col, where).length;
    },
    async set(col, id, data) {
      table(col)[id] = {};
      applyUpdate(table(col)[id], data);
    },
    async update(col, id, data) {
      if (!table(col)[id]) throw new Error(`memory db: ${col}/${id} not found`);
      applyUpdate(table(col)[id], data);
    },
    async add(col, data) {
      const id = `auto_${++autoId}`;
      await db.set(col, id, data);
      return id;
    },
    async remove(col, id) {
      delete table(col)[id];
    },
    async removeWhere(col, where) {
      const found = rows(col, where);
      found.forEach(r => delete table(col)[r.id]);
      return found.length;
    },
    async updateWhere(col, where, data) {
      const found = rows(col, where);
      found.forEach(r => applyUpdate(table(col)[r.id], data));
      return found.length;
    },
    async commit(ops) {
      if (ops.some(op => op.type === 'create' && table(op.col)[op.id])) return false;
      if (ops.some(op => op.type === 'update' && !table(op.col)[op.id])) {
        throw new Error('memory db: update target not found');
      }
      ops.forEach(({ type, col, id, data }) => {
        if (type === 'create' || type === 'set') { table(col)[id] = {}; applyUpdate(table(col)[id], data); }
        else if (type === 'update') applyUpdate(table(col)[id], data);
        else if (type === 'delete') delete table(col)[id];
      });
      return true;
    }
  };
  return db;
}

module.exports = { createMemoryDb };
