/**
 * 照片上传：multipart/form-data（wx.uploadFile），字段名 file
 * - folder=entries：已绑定用户上传宠物照片
 * - folder=host：管理员上传主持人头像
 * 仅接受 JPG/PNG，≤ 5MB；文件名随机生成，返回公开访问地址
 */
const crypto = require('crypto');
const Busboy = require('busboy');
const { isAdmin } = require('../activity');
const { requireBinding } = require('./user');
const { UserError } = require('../errors');

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' };

// 依据文件头判断真实格式，不信任客户端声明的类型
function sniffImageType(buf) {
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  return null;
}

function readSingleFile(req) {
  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_BYTES } });
    } catch (e) {
      reject(new UserError('上传格式错误'));
      return;
    }
    const fields = {};
    let file = null;
    busboy.on('field', (name, value) => { fields[name] = value; });
    busboy.on('file', (name, stream) => {
      const chunks = [];
      let truncated = false;
      stream.on('data', (d) => chunks.push(d));
      stream.on('limit', () => { truncated = true; });
      stream.on('end', () => { if (name === 'file') file = { buffer: Buffer.concat(chunks), truncated }; });
    });
    busboy.on('close', () => resolve({ fields, file }));
    busboy.on('error', () => reject(new UserError('上传失败，请重试')));
    busboy.end(req.rawBody);
  });
}

async function uploadPhoto(ctx) {
  const { fields, file } = await readSingleFile(ctx.req);
  const folder = fields.folder === 'host' ? 'host' : 'entries';
  if (folder === 'host') {
    if (!isAdmin(ctx.activity, ctx.openid)) throw new UserError('权限不足：仅限活动管理员操作', 403);
  } else {
    await requireBinding(ctx);
  }

  if (!file || file.buffer.length === 0) throw new UserError('请选择要上传的照片');
  if (file.truncated) throw new UserError('照片需小于 5MB，请换一张');
  const contentType = sniffImageType(file.buffer);
  if (!contentType) throw new UserError('仅支持 JPG / PNG 格式的照片');

  const path = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${TYPES[contentType]}`;
  const url = await ctx.storage.save(path, file.buffer, contentType);
  return { url };
}

module.exports = { uploadPhoto, sniffImageType };
