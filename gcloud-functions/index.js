/**
 * Pawscars 后台：Google Cloud Functions (2nd gen) HTTP 函数入口
 * 部署：gcloud functions deploy pawscars-api --gen2 --runtime=nodejs22 --entry-point=api --trigger-http ...
 * 详见 README.md
 */
const functions = require('@google-cloud/functions-framework');
const { createApp } = require('./src/app');
const { loadConfig } = require('./src/config');
const { createFirestoreDb } = require('./src/db/firestore');
const { createGcsStorage } = require('./src/storage');
const { createWxClient } = require('./src/wechat');

const config = loadConfig();

functions.http('api', createApp({
  config,
  db: createFirestoreDb(),
  storage: createGcsStorage(config.photoBucket),
  wx: createWxClient(config)
}));
