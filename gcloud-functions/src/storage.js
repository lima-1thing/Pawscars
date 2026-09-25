/**
 * Cloud Storage 照片存储
 * 存储桶需开启统一访问权限并授予 allUsers「Storage Object Viewer」，照片通过公开地址展示；
 * 文件名随机生成，无法被枚举。
 */
const { Storage } = require('@google-cloud/storage');

function createGcsStorage(bucketName, options = {}) {
  const bucket = new Storage(options).bucket(bucketName);
  const base = `https://storage.googleapis.com/${bucketName}/`;
  return {
    publicUrl: (path = '') => base + path,
    async save(path, buffer, contentType) {
      await bucket.file(path).save(buffer, {
        resumable: false,
        contentType,
        metadata: { cacheControl: 'public, max-age=31536000, immutable' }
      });
      return base + path;
    }
  };
}

module.exports = { createGcsStorage };
