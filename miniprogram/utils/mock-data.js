/**
 * Pawscars Mock Data & Initial State
 * 包含：活动配置、默认三大门类、真实参赛选手、贺词留言、管理员名单
 */

// 采用马卡龙配色的高质量毛孩头像 SVG (离线 100% 可用且精美)
const createPetSvg = (bg, animal, name) => {
  const isDog = animal === 'dog';
  const iconSvg = isDog
    ? `<circle cx="50" cy="50" r="32" fill="#E8A857"/>
       <ellipse cx="28" cy="45" rx="8" ry="16" fill="#D08838" transform="rotate(-15 28 45)"/>
       <ellipse cx="72" cy="45" rx="8" ry="16" fill="#D08838" transform="rotate(15 72 45)"/>
       <circle cx="40" cy="48" r="4" fill="#332211"/>
       <circle cx="60" cy="48" r="4" fill="#332211"/>
       <ellipse cx="50" cy="58" rx="6" ry="4" fill="#332211"/>
       <path d="M 46 62 Q 50 67 54 62" stroke="#332211" stroke-width="2" fill="none"/>`
    : `<circle cx="50" cy="50" r="32" fill="#F0ECE1"/>
       <polygon points="26,38 34,18 46,32" fill="#E2DACB"/>
       <polygon points="74,38 66,18 54,32" fill="#E2DACB"/>
       <polygon points="29,36 35,23 43,32" fill="#F4B8C5"/>
       <polygon points="71,36 65,23 57,32" fill="#F4B8C5"/>
       <ellipse cx="38" cy="48" rx="4" ry="5" fill="#3D405B"/>
       <ellipse cx="62" cy="48" rx="4" ry="5" fill="#3D405B"/>
       <polygon points="48,56 52,56 50,59" fill="#E07A5F"/>
       <path d="M 44 60 Q 50 64 56 60" stroke="#3D405B" stroke-width="1.5" fill="none"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="16" fill="${bg}"/>
    ${iconSvg}
    <text x="50" y="88" font-size="10" font-weight="bold" fill="#4A3E3D" text-anchor="middle" font-family="sans-serif">${name}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const DEFAULT_CONFIG = {
  title: 'Pawscars 毛孩奥斯卡',
  subTitle: '纽约🐶群活跃七周年特别企划',
  hostName: '宫师姐',
  hostAvatar: 'data:image/svg+xml;utf8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
      <circle cx="30" cy="30" r="30" fill="#F4C0D1"/>
      <circle cx="30" cy="24" r="12" fill="#FFE5D9"/>
      <path d="M 18 20 Q 30 10 42 20 Q 42 30 18 30 Z" fill="#784F3C"/>
      <circle cx="26" cy="24" r="2" fill="#332211"/>
      <circle cx="34" cy="24" r="2" fill="#332211"/>
      <path d="M 28 29 Q 30 32 32 29" stroke="#E56B6F" stroke-width="1.5" fill="none"/>
      <path d="M 16 52 C 16 42 22 38 30 38 C 38 38 44 42 44 52 Z" fill="#F77F00"/>
    </svg>
  `),
  hostIntro: '为庆祝纽约🐶群活跃七周年，宫师姐决定邀请毛孩子们集体亮相，首届 Pawscars 毛孩奥斯卡评选，现在开始！',
  rulesSummary: '赛制：报名 → 8强投票 → 8进4淘汰赛 → 4强巅峰德比',
  callToActionText: '准备好让全体🐶友欣赏你家毛孩了吗？',
  rulesDetail: `
一、活动概述与赛制：
Pawscars 模拟奥斯卡分类评选，按三大特色门类进行，每阶段 7 天，合计约 28 天。

二、四个阶段流程：
1. 报名期（7天）：提交毛孩照片，选择参赛门类（支持多选）。
2. 初选（7天）：三门类同页横向划屏，每类最多选 8 张。按被选总次数取前 8 强。打平按更早达到该票数的时间戳胜出。不足 8 强直接进入淘汰赛或循环赛。
3. 8进4淘汰赛（7天）：8 强按主人 LDAP 字母顺序 (A→Z) 两两配对（1v2、3v4、5v6、7v8），4 场 1V1 单败淘汰。
4. 4强德比（7天）：4 强进行 6 场循环赛 (C(4,2))，按胜场与总票数决出冠亚季军。
5. 颁奖盛典：公布冠亚季军领奖台，生成专属获奖证书，开启全员贺词墙。

三、打平裁定原则：
全阶段统一按“谁先达到该票数的时刻更早”判定胜负。
  `.trim(),
  // 当前阶段: 'nominate' (报名期), 'vote_initial' (初选), 'vote_match_8' (8进4), 'vote_match_4' (4强德比), 'awards' (颁奖)
  currentPhase: 'nominate',
  phaseDeadline: Date.now() + 7 * 24 * 3600 * 1000,
  adminOpenids: ['ADMIN_LIMA', 'ADMIN_GONG', 'DEVELOPER']
};

const DEFAULT_CATEGORIES = [
  {
    id: 'food',
    name: '干饭王者',
    tag: '干饭',
    suffix: '王者',
    theme: 'yellow',
    bg: '#FAC775',
    textColor: '#412402',
    accentColor: '#633806',
    icon: '🍖',
    desc: '吃相最凶猛/最沙雕的选手'
  },
  {
    id: 'abstract',
    name: '抽象王者',
    tag: '抽象',
    suffix: '王者',
    theme: 'green',
    bg: '#9FE1CB',
    textColor: '#04342C',
    accentColor: '#085041',
    icon: '🎭',
    desc: '行为无法用语言形容的选手'
  },
  {
    id: 'beauty',
    name: '颜值王者',
    tag: '颜值',
    suffix: '王者',
    theme: 'purple',
    bg: '#CECBF6',
    textColor: '#26215C',
    accentColor: '#3C3489',
    icon: '✨',
    desc: '单纯靠脸吃饭的选手'
  }
];

// 预置高品质报名条目（涵盖三大门类，猫狗均有，活动ID符合纯字母规范）
const DEFAULT_ENTRIES = [
  // 干饭王者 (food)
  {
    id: 'entry_f1',
    categoryId: 'food',
    petName: '团子',
    ownerLdap: 'JENNIFER',
    ownerOpenid: 'user_jennifer',
    photoUrl: createPetSvg('#FFF3CD', 'cat', '团子'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 50
  },
  {
    id: 'entry_f2',
    categoryId: 'food',
    petName: '旺财',
    ownerLdap: 'ZHANG',
    ownerOpenid: 'user_zhang',
    photoUrl: createPetSvg('#FFE8D6', 'dog', '旺财'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 48
  },
  {
    id: 'entry_f3',
    categoryId: 'food',
    petName: '肉包',
    ownerLdap: 'ALICE',
    ownerOpenid: 'user_alice',
    photoUrl: createPetSvg('#FFF3CD', 'dog', '肉包'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 46
  },
  {
    id: 'entry_f4',
    categoryId: 'food',
    petName: '麻薯',
    ownerLdap: 'BOBBY',
    ownerOpenid: 'user_bobby',
    photoUrl: createPetSvg('#E8F4F8', 'cat', '麻薯'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 44
  },
  {
    id: 'entry_f5',
    categoryId: 'food',
    petName: '布丁',
    ownerLdap: 'CHARLIE',
    ownerOpenid: 'user_charlie',
    photoUrl: createPetSvg('#FFF3CD', 'dog', '布丁'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 42
  },
  {
    id: 'entry_f6',
    categoryId: 'food',
    petName: '奥利奥',
    ownerLdap: 'DAVID',
    ownerOpenid: 'user_david',
    photoUrl: createPetSvg('#F0E6EF', 'cat', '奥利奥'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 40
  },
  {
    id: 'entry_f7',
    categoryId: 'food',
    petName: '汉堡',
    ownerLdap: 'EMILY',
    ownerOpenid: 'user_emily',
    photoUrl: createPetSvg('#FFE8D6', 'dog', '汉堡'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 38
  },
  {
    id: 'entry_f8',
    categoryId: 'food',
    petName: '奶黄',
    ownerLdap: 'FRANK',
    ownerOpenid: 'user_frank',
    photoUrl: createPetSvg('#FFF3CD', 'cat', '奶黄'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 36
  },
  {
    id: 'entry_f9',
    categoryId: 'food',
    petName: '薯条',
    ownerLdap: 'GEORGE',
    ownerOpenid: 'user_george',
    photoUrl: createPetSvg('#FFE8D6', 'dog', '薯条'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 34
  },

  // 抽象王者 (abstract)
  {
    id: 'entry_a1',
    categoryId: 'abstract',
    petName: '二哈',
    ownerLdap: 'ZHANG',
    ownerOpenid: 'user_zhang',
    photoUrl: createPetSvg('#D8F3DC', 'dog', '二哈'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 49
  },
  {
    id: 'entry_a2',
    categoryId: 'abstract',
    petName: '汤圆',
    ownerLdap: 'ALICE',
    ownerOpenid: 'user_alice',
    photoUrl: createPetSvg('#E8F4F8', 'cat', '汤圆'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 47
  },
  {
    id: 'entry_a3',
    categoryId: 'abstract',
    petName: '皮皮',
    ownerLdap: 'BOBBY',
    ownerOpenid: 'user_bobby',
    photoUrl: createPetSvg('#D8F3DC', 'dog', '皮皮'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 45
  },
  {
    id: 'entry_a4',
    categoryId: 'abstract',
    petName: '小怪兽',
    ownerLdap: 'CHARLIE',
    ownerOpenid: 'user_charlie',
    photoUrl: createPetSvg('#D8F3DC', 'cat', '小怪兽'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 43
  },
  {
    id: 'entry_a5',
    categoryId: 'abstract',
    petName: '旋风',
    ownerLdap: 'DAVID',
    ownerOpenid: 'user_david',
    photoUrl: createPetSvg('#FFE8D6', 'dog', '旋风'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 41
  },
  {
    id: 'entry_a6',
    categoryId: 'abstract',
    petName: '懵圈',
    ownerLdap: 'EMILY',
    ownerOpenid: 'user_emily',
    photoUrl: createPetSvg('#D8F3DC', 'cat', '懵圈'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 39
  },
  {
    id: 'entry_a7',
    categoryId: 'abstract',
    petName: '铁锤',
    ownerLdap: 'FRANK',
    ownerOpenid: 'user_frank',
    photoUrl: createPetSvg('#D8F3DC', 'dog', '铁锤'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 37
  },
  {
    id: 'entry_a8',
    categoryId: 'abstract',
    petName: '迷糊',
    ownerLdap: 'JENNIFER',
    ownerOpenid: 'user_jennifer',
    photoUrl: createPetSvg('#D8F3DC', 'cat', '迷糊'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 35
  },

  // 颜值王者 (beauty)
  {
    id: 'entry_b1',
    categoryId: 'beauty',
    petName: '小白',
    ownerLdap: 'ZHANG',
    ownerOpenid: 'user_zhang',
    photoUrl: createPetSvg('#E8D7F1', 'cat', '小白'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 48
  },
  {
    id: 'entry_b2',
    categoryId: 'beauty',
    petName: '雪球',
    ownerLdap: 'ALICE',
    ownerOpenid: 'user_alice',
    photoUrl: createPetSvg('#E8D7F1', 'dog', '雪球'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 46
  },
  {
    id: 'entry_b3',
    categoryId: 'beauty',
    petName: '可可',
    ownerLdap: 'BOBBY',
    ownerOpenid: 'user_bobby',
    photoUrl: createPetSvg('#E8D7F1', 'cat', '可可'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 44
  },
  {
    id: 'entry_b4',
    categoryId: 'beauty',
    petName: '美美',
    ownerLdap: 'CHARLIE',
    ownerOpenid: 'user_charlie',
    photoUrl: createPetSvg('#E8D7F1', 'dog', '美美'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 42
  },
  {
    id: 'entry_b5',
    categoryId: 'beauty',
    petName: '王子',
    ownerLdap: 'DAVID',
    ownerOpenid: 'user_david',
    photoUrl: createPetSvg('#E8D7F1', 'cat', '王子'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 40
  },
  {
    id: 'entry_b6',
    categoryId: 'beauty',
    petName: '小仙女',
    ownerLdap: 'EMILY',
    ownerOpenid: 'user_emily',
    photoUrl: createPetSvg('#E8D7F1', 'dog', '小仙女'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 38
  },
  {
    id: 'entry_b7',
    categoryId: 'beauty',
    petName: '珍珠',
    ownerLdap: 'FRANK',
    ownerOpenid: 'user_frank',
    photoUrl: createPetSvg('#E8D7F1', 'cat', '珍珠'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 36
  },
  {
    id: 'entry_b8',
    categoryId: 'beauty',
    petName: '小福',
    ownerLdap: 'JENNIFER',
    ownerOpenid: 'user_jennifer',
    photoUrl: createPetSvg('#E8D7F1', 'dog', '小福'),
    status: 'active',
    createdAt: Date.now() - 3600000 * 34
  }
];

const DEFAULT_CONGRATS = [
  {
    id: 'msg_1',
    ownerLdap: 'JENNIFER',
    content: '恭喜团子拿下干饭王者！实至名归 🥇',
    createdAt: Date.now() - 3600000 * 5,
    status: 'active'
  },
  {
    id: 'msg_2',
    ownerLdap: 'ZHANG',
    content: '这次比赛太好玩了，明年还要办！',
    createdAt: Date.now() - 3600000 * 3,
    status: 'active'
  },
  {
    id: 'msg_3',
    ownerLdap: 'ALICE',
    content: '每个毛孩都是我们心中的冠军，爱你萌 ❤️',
    createdAt: Date.now() - 3600000 * 1,
    status: 'active'
  }
];

module.exports = {
  createPetSvg,
  DEFAULT_CONFIG,
  DEFAULT_CATEGORIES,
  DEFAULT_ENTRIES,
  DEFAULT_CONGRATS
};
