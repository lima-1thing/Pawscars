# Pawscars 后台 · Google Cloud 版

用 **Google Cloud Functions（第 2 代）+ Firestore + Cloud Storage** 替代微信云开发，适合境外主体、海外用户的小程序。
逻辑与 `cloudfunctions/`（微信云开发版）一致：同样的赛制规则、打码规则、唯一性约束与管理员校验。

> 当前小程序前台仍在调用微信云开发（`miniprogram/utils/api.js`）。切换到本后台需要再改前台的数据接口层，见文末"接入小程序"。

## 架构

```
微信小程序 ──HTTPS（自有域名）──▶ Cloud Function「api」(nodejs22, us-east4)
                                   ├─ Firestore：活动配置、报名、投票、对阵、贺词
                                   ├─ Cloud Storage：宠物照片、主持人头像（公开读）
                                   └─ 微信 jscode2session：wx.login code → openid
Cloud Scheduler ──每 10 分钟──▶ /cron/advance-phase：到截止时间自动推进阶段
```

| 目录 | 说明 |
|---|---|
| `index.js` | 函数入口（`api`），读取环境变量并组装依赖 |
| `src/app.js` | 路由、登录令牌校验、统一的返回格式与错误处理 |
| `src/handlers/` | 各接口：登录/绑定、报名、投票、贺词、只读查询、管理员、照片上传、定时任务 |
| `src/settlement.js` | 阶段推进与结算（幂等），回退时清理之后阶段的数据 |
| `src/bracket.js` | 赛制规则，**是 `miniprogram/utils/bracket.js` 的副本**（测试会校验一致） |
| `src/db/` | 数据访问层：`firestore.js`（线上）与 `memory.js`（测试） |
| `test/` | 接口测试：真实路由 + 内存库/Firestore 模拟器 |

## 接口

全部为 `POST`，返回 `{ success: true, data }` 或 `{ success: false, message }`。
除 `/login`、`/cron/advance-phase` 外，均需请求头 `Authorization: Bearer <token>`（由 `/login` 签发，默认 30 天有效）。

| 路径 | 请求体 | 说明 |
|---|---|---|
| `/login` | `{ code }` | `wx.login` 的 code 换 openid，返回 `token` 与启动数据 |
| `/bootstrap` | – | 活动配置、门类、本人绑定的活动ID、是否管理员 |
| `/bind` | `{ ldap }` | 绑定活动ID（仅字母、全局唯一、一个微信只能绑一个） |
| `/upload` | multipart：`file`，`folder=entries\|host` | 上传照片（JPG/PNG ≤5MB，按文件头校验），返回 `url`；`host` 仅管理员 |
| `/nominate` | `{ petName, photoUrl, categoryIds, pledged }` | 多选门类报名，冲突门类跳过 |
| `/nominate/photo` | `{ entryId, photoUrl }` | 报名期内替换自己的照片 |
| `/vote` | `{ voteType: 'initial', categoryId, selectedEntryIds }` 或 `{ voteType: 'match', matchId, chosenSide }` | 每人每门类/每场一票 |
| `/congrats` | `{ content }` | 颁奖阶段发贺词，每人一条 |
| `/data/initialState` | – | 初选候选（按主人ID排序、已打码）与本人已选 |
| `/data/matchState` | `{ stage: '8进4' \| '4强德比' }` | 可投对阵（**不含票数**）与本人已投 |
| `/data/myNominations` | – | 本人报名与私密进度（含自己的票数） |
| `/data/awards` | `{ categoryId }` | 颁奖结果（颁奖前仅管理员可见） |
| `/data/congrats` | – | 贺词墙 |
| `/admin/:action` | 见 `src/handlers/admin.js` | `setPhase`、`updateConfig`、`renameCategory`、`unbindUser`、`softDeleteEntry`、`softDeleteCongrats`、`getOverview` |
| `/cron/advance-phase` | 请求头 `X-Cron-Secret` | 当前阶段过了截止时间则推进到下一阶段 |

安全要点：
- 管理员只按 `Activity/main_config.adminOpenids` 中的 openid 判定；该名单不能通过接口修改，也不会下发给前端。
- openid 只来自服务端校验过的登录令牌，前端无法伪造。
- 公共接口返回的主人ID在服务端打码，不包含 openid 和实时票数。
- 投票记录与计数在同一批次原子写入，并以 `openid_门类` / `openid_对局` 作为文档 ID，重复提交整批失败。

## 本地开发与测试

需要 Node.js 22+。

```bash
cd gcloud-functions
npm install
npm test                 # 内存数据库
```

用 Firestore 模拟器跑同一套测试（验证真实的 Firestore 读写代码）：

```bash
gcloud emulators firestore start --host-port=127.0.0.1:8792   # 另开一个终端
npm run test:emulator
```

本地启动服务（连接模拟器，照片上传需要真实存储桶）：

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8792 \
WX_APPID=wxf02b8c1f2c026a7c WX_APPSECRET=<小程序 AppSecret> \
TOKEN_SECRET=dev-token-secret CRON_SECRET=dev-cron-secret PHOTO_BUCKET=<存储桶> \
npm start                 # http://localhost:8080
```

在微信开发者工具中勾选"不校验合法域名"即可让小程序访问本地服务。

## 部署

以下命令中的 `<...>` 需替换成你自己的值。区域以 `us-east4`（北弗吉尼亚，靠近纽约）为例。

### 1. 项目与服务

```bash
gcloud config set project <PROJECT_ID>
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com firestore.googleapis.com storage.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com
```

### 2. Firestore 与存储桶

```bash
gcloud firestore databases create --location=us-east4

gcloud storage buckets create gs://<BUCKET> --location=us-east4 --uniform-bucket-level-access
# 照片通过公开地址展示（文件名随机，无法枚举）
gcloud storage buckets add-iam-policy-binding gs://<BUCKET> \
  --member=allUsers --role=roles/storage.objectViewer
```

Firestore 使用默认的"生产模式"安全规则（拒绝所有客户端直连），所有读写都经由本函数完成。
所有查询都是等值条件，不需要额外建复合索引。

### 3. 服务账号与密钥

```bash
gcloud iam service-accounts create pawscars-api
SA=pawscars-api@<PROJECT_ID>.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding <PROJECT_ID> --member=serviceAccount:$SA --role=roles/datastore.user
gcloud storage buckets add-iam-policy-binding gs://<BUCKET> --member=serviceAccount:$SA --role=roles/storage.objectCreator

# AppSecret 在微信公众平台 → 开发管理 → 开发设置 中生成；不要写进代码或提交到仓库
printf '%s' '<AppSecret>' | gcloud secrets create wx-appsecret --data-file=-
openssl rand -base64 32 | tr -d '\n' | gcloud secrets create token-secret --data-file=-
openssl rand -hex 24 | tr -d '\n' | gcloud secrets create cron-secret --data-file=-
for s in wx-appsecret token-secret cron-secret; do
  gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
done
```

### 4. 部署函数

```bash
cd gcloud-functions
gcloud functions deploy pawscars-api \
  --gen2 --runtime=nodejs22 --region=us-east4 \
  --source=. --entry-point=api --trigger-http --allow-unauthenticated \
  --service-account=$SA --memory=512Mi \
  --set-env-vars=WX_APPID=wxf02b8c1f2c026a7c,PHOTO_BUCKET=<BUCKET> \
  --set-secrets=WX_APPSECRET=wx-appsecret:latest,TOKEN_SECRET=token-secret:latest,CRON_SECRET=cron-secret:latest
```

活动期间如需避免冷启动，可加 `--min-instances=1`（每月约几美元）。

### 5. 自有域名

小程序只能访问在后台登记过的 HTTPS 域名，建议为函数绑定自己的域名（如 `api.<你的域名>`），不要直接使用 `*.run.app`：

```bash
gcloud beta run domain-mappings create --service=pawscars-api --domain=api.<你的域名> --region=us-east4
```

按命令输出在 DNS 中添加记录，等待证书签发（通常几十分钟）。也可以改用全局外部负载均衡器 + 无服务器 NEG。

### 6. 定时推进阶段

```bash
gcloud scheduler jobs create http pawscars-advance-phase \
  --location=us-east4 --schedule="*/10 * * * *" \
  --uri=https://api.<你的域名>/cron/advance-phase --http-method=POST \
  --headers=X-Cron-Secret=$(gcloud secrets versions access latest --secret=cron-secret)
```

每 10 分钟检查一次：当前阶段设置了截止时间且已过期，就自动结算并进入下一阶段（颁奖阶段不再推进）。

### 7. 活动配置与管理员

在 Firestore 控制台创建集合 `Activity`，文档 ID 为 `main_config`：

```json
{
  "currentPhase": "nominate",
  "phaseDeadlines": {},
  "adminOpenids": []
}
```

获取管理员 openid：管理员先在小程序里绑定活动ID，然后在 Firestore 的 `UserBinding` 集合中找到以其活动ID为文档 ID 的记录，复制 `openid` 字段填入 `adminOpenids`。

### 8. 微信公众平台配置

开发管理 → 开发设置 → 服务器域名：

| 类型 | 域名 |
|---|---|
| request 合法域名 | `https://api.<你的域名>` |
| uploadFile 合法域名 | `https://api.<你的域名>` |
| downloadFile 合法域名 | `https://api.<你的域名>`、`https://storage.googleapis.com`（证书绘制需要下载照片） |

## 接入小程序

前台所有数据读写都集中在 `miniprogram/utils/api.js`，接入时只需：
1. 启动时调用 `wx.login` → `POST /login`，保存返回的 `token`；
2. 把 `wx.cloud.callFunction` 换成带 `Authorization` 头的 `wx.request`，路径按上表对应；
3. 照片改用 `wx.uploadFile` 调 `/upload`，再把返回的 `url` 传给 `/nominate`；
4. 收到 401 时重新登录。

`cloudfunctions/`（微信云开发版）在切换完成后可以删除。
