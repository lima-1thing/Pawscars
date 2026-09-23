/**
 * Pawscars Validation Utilities
 */

/**
 * 校验活动ID (LDAP)
 * 规则：仅允许英文字母 (A-Z, a-z)，不能包含数字、空格或任何特殊字符
 * @param {string} id 
 * @returns {{ valid: boolean, message: string }}
 */
const ADMIN_WHITELIST = ['LIMA0001', 'PRIVACY-BY-DESIGN', 'ADMIN_LIMA', 'ADMIN_GONG', 'DEVELOPER'];

function validateLdap(id) {
  if (!id || typeof id !== 'string') {
    return { valid: false, message: '请输入你的活动ID (LDAP)' };
  }
  const trimmed = id.trim();
  if (trimmed.length < 2) {
    return { valid: false, message: '活动ID长度至少为2位字母' };
  }
  if (ADMIN_WHITELIST.includes(trimmed.toUpperCase())) {
    return { valid: true, message: '' };
  }
  if (!/^[A-Za-z]+$/.test(trimmed)) {
    return { valid: false, message: '活动ID仅支持英文字母，不能包含数字或特殊符号' };
  }
  return { valid: true, message: '' };
}

/**
 * 校验宠物名
 * 规则：文本，1-20字
 * @param {string} name 
 * @returns {{ valid: boolean, message: string }}
 */
function validatePetName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, message: '请输入毛孩子的名字' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 20) {
    return { valid: false, message: '宠物名字需在 1 到 20 个字之间' };
  }
  return { valid: true, message: '' };
}

/**
 * 校验贺词内容
 * 规则：文本，≤ 50字
 * @param {string} text 
 * @returns {{ valid: boolean, message: string }}
 */
function validateCongrats(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, message: '请输入祝贺内容' };
  }
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    return { valid: false, message: '贺词内容限 50 字以内' };
  }
  return { valid: true, message: '' };
}

module.exports = {
  validateLdap,
  validatePetName,
  validateCongrats
};
