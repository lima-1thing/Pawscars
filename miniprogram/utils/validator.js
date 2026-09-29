/**
 * Pawscars Validation Utilities
 */

/**
 * 校验活动ID (LDAP)
 * 规则：英文字母开头，只能包含英文字母和数字（如 LIMA0001），2-20 位；不能有空格或特殊符号
 * @param {string} id 
 * @returns {{ valid: boolean, message: string }}
 */
function validateLdap(id) {
  if (!id || typeof id !== 'string') {
    return { valid: false, message: '请输入你的活动ID (LDAP)' };
  }
  const trimmed = id.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return { valid: false, message: '活动ID需为 2-20 位' };
  }
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(trimmed)) {
    return { valid: false, message: '活动ID需以英文字母开头，只能包含字母和数字' };
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
