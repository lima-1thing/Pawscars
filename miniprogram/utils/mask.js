/**
 * Pawscars Masking Utilities
 * 规范：主人活动ID前2个字母 + 剩余字母用星号(*)遮盖
 * 例如：JENNIFER -> JE******，ZHANG -> ZH***
 */

/**
 * 活动ID打码处理
 * @param {string} ldap 
 * @param {boolean} withPrefix - 是否带有"主人 "前缀，默认 false
 * @returns {string}
 */
function maskLdap(ldap, withPrefix = false) {
  if (!ldap || typeof ldap !== 'string') return '***';
  const clean = ldap.trim().toUpperCase();
  let masked = '';
  if (clean.length <= 2) {
    masked = clean.slice(0, 1) + '*';
  } else {
    masked = clean.slice(0, 2) + '*'.repeat(clean.length - 2);
  }
  return withPrefix ? `主人 ${masked}` : masked;
}

module.exports = {
  maskLdap
};
