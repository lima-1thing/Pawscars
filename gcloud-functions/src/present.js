/**
 * 对外展示的数据形态：打码主人ID、去掉 openid 与实时票数
 */

function maskLdap(ldap) {
  if (!ldap || typeof ldap !== 'string') return '***';
  const clean = ldap.trim().toUpperCase();
  return clean.length <= 2 ? `${clean.slice(0, 1)}*` : clean.slice(0, 2) + '*'.repeat(clean.length - 2);
}

// 写入对阵/晋级名单的条目快照，不含 openid
const entrySnapshot = (e) => e && ({
  id: e.id,
  categoryId: e.categoryId,
  petName: e.petName,
  photoUrl: e.photoUrl,
  ownerLdap: e.ownerLdap
});

const publicEntry = (e) => e && ({
  id: e.id,
  categoryId: e.categoryId,
  petName: e.petName,
  photoUrl: e.photoUrl,
  ownerLdap: maskLdap(e.ownerLdap)
});

const publicMatch = (m) => ({
  id: m.id,
  categoryId: m.categoryId,
  stage: m.stage,
  stageIndex: m.stageIndex,
  totalMatches: m.totalMatches,
  entryA: publicEntry(m.entryA),
  entryB: publicEntry(m.entryB)
});

const byOwnerLdap = (a, b) => (a.ownerLdap || '').toUpperCase().localeCompare((b.ownerLdap || '').toUpperCase());

module.exports = { maskLdap, entrySnapshot, publicEntry, publicMatch, byOwnerLdap };
