/**
 * 业务错误：message 会原样返回给小程序展示；其他异常只记录日志，返回通用提示
 */
class UserError extends Error {
  constructor(message, status = 200) {
    super(message);
    this.name = 'UserError';
    this.status = status;
  }
}

module.exports = { UserError };
