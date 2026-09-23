/**
 * Firestore 数据访问层
 * 与 src/db/memory.js 实现相同的接口，业务代码只依赖这组方法：
 *   get / getMany / query / count / set / update / add / remove / removeWhere / commit / increment
 * where 条件格式：[[field, '==' | 'in', value], ...]
 */
const { Firestore, FieldValue } = require('@google-cloud/firestore');

const ALREADY_EXISTS = 6; // gRPC 状态码
const BATCH_LIMIT = 400;

function createFirestoreDb(options = {}) {
  const firestore = new Firestore({ ignoreUndefinedProperties: true, ...options });

  const toObj = (snap) => (snap.exists ? { ...snap.data(), id: snap.id } : null);
  const buildQuery = (col, where = []) =>
    where.reduce((q, [field, op, value]) => q.where(field, op, value), firestore.collection(col));

  async function commitInChunks(ops) {
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = firestore.batch();
      ops.slice(i, i + BATCH_LIMIT).forEach(op => op(batch));
      await batch.commit();
    }
  }

  return {
    increment: (n) => FieldValue.increment(n),

    async get(col, id) {
      return toObj(await firestore.collection(col).doc(id).get());
    },

    async getMany(col, ids) {
      if (ids.length === 0) return [];
      const snaps = await firestore.getAll(...ids.map(id => firestore.collection(col).doc(id)));
      return snaps.map(toObj);
    },

    async query(col, where) {
      const snap = await buildQuery(col, where).get();
      return snap.docs.map(toObj);
    },

    async count(col, where) {
      const snap = await buildQuery(col, where).count().get();
      return snap.data().count;
    },

    async set(col, id, data) {
      await firestore.collection(col).doc(id).set(data);
    },

    async update(col, id, data) {
      await firestore.collection(col).doc(id).update(data);
    },

    async add(col, data) {
      const ref = await firestore.collection(col).add(data);
      return ref.id;
    },

    async remove(col, id) {
      await firestore.collection(col).doc(id).delete();
    },

    async removeWhere(col, where) {
      const snap = await buildQuery(col, where).get();
      await commitInChunks(snap.docs.map(doc => (batch) => batch.delete(doc.ref)));
      return snap.size;
    },

    async updateWhere(col, where, data) {
      const snap = await buildQuery(col, where).get();
      await commitInChunks(snap.docs.map(doc => (batch) => batch.update(doc.ref, data)));
      return snap.size;
    },

    /**
     * 原子批量写入。ops: [{ type: 'create'|'set'|'update'|'delete', col, id, data }]
     * 任一 create 的文档已存在时整批不生效，返回 false（用于"每人一票"等唯一性约束）
     */
    async commit(ops) {
      const batch = firestore.batch();
      ops.forEach(({ type, col, id, data }) => {
        const ref = firestore.collection(col).doc(id);
        if (type === 'create') batch.create(ref, data);
        else if (type === 'set') batch.set(ref, data);
        else if (type === 'update') batch.update(ref, data);
        else if (type === 'delete') batch.delete(ref);
      });
      try {
        await batch.commit();
        return true;
      } catch (e) {
        if (e.code === ALREADY_EXISTS) return false;
        throw e;
      }
    }
  };
}

module.exports = { createFirestoreDb };
