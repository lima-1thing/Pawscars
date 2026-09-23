/**
 * Pawscars Standalone Interactive Simulator
 * 实现了完整业务逻辑与高保真交互体验
 */

// 1. 纯前端 SVG 毛孩头像生成
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

// 2. 打码算法 (JE******)
function maskLdap(ldap) {
  if (!ldap) return '***';
  const clean = ldap.trim().toUpperCase();
  if (clean.length <= 2) return clean.slice(0, 1) + '*';
  return clean.slice(0, 2) + '*'.repeat(clean.length - 2);
}

// 3. 初始数据状态
const INITIAL_STATE = {
  config: {
    title: 'Pawscars 毛孩奥斯卡',
    hostName: '宫师姐',
    hostIntro: '为庆祝纽约🐶群活跃七周年，宫师姐决定邀请毛孩子们集体亮相，首届 Pawscars 毛孩奥斯卡评选，现在开始！',
    rulesSummary: '赛制：报名 → 8强投票 → 8进4淘汰赛 → 4强巅峰德比',
    callToActionText: '准备好让全体🐶友欣赏你家毛孩了吗？',
    currentPhase: 'nominate',
    adminOpenids: ['ADMIN_LIMA', 'ADMIN_GONG', 'DEVELOPER', 'LIMA0001', 'privacy-by-design']
  },
  currentUserLdap: 'JENNIFER',
  categories: [
    { id: 'food', name: '干饭王者', tag: '干饭', suffix: '王者', theme: 'yellow', bg: '#FAC775', textColor: '#412402', accentColor: '#633806', icon: '🍖' },
    { id: 'abstract', name: '抽象王者', tag: '抽象', suffix: '王者', theme: 'green', bg: '#9FE1CB', textColor: '#04342C', accentColor: '#085041', icon: '🎭' },
    { id: 'beauty', name: '颜值王者', tag: '颜值', suffix: '王者', theme: 'purple', bg: '#CECBF6', textColor: '#26215C', accentColor: '#3C3489', icon: '✨' }
  ],
  entries: [
    { id: 'f1', categoryId: 'food', petName: '团子', ownerLdap: 'JENNIFER', photoUrl: createPetSvg('#FFF3CD', 'cat', '团子'), initialVotes: 15, status: 'active', createdAt: Date.now() - 500000 },
    { id: 'f2', categoryId: 'food', petName: '旺财', ownerLdap: 'ZHANG', photoUrl: createPetSvg('#FFE8D6', 'dog', '旺财'), initialVotes: 14, status: 'active', createdAt: Date.now() - 400000 },
    { id: 'f3', categoryId: 'food', petName: '肉包', ownerLdap: 'ALICE', photoUrl: createPetSvg('#FFF3CD', 'dog', '肉包'), initialVotes: 12, status: 'active', createdAt: Date.now() - 300000 },
    { id: 'f4', categoryId: 'food', petName: '麻薯', ownerLdap: 'BOBBY', photoUrl: createPetSvg('#E8F4F8', 'cat', '麻薯'), initialVotes: 10, status: 'active', createdAt: Date.now() - 200000 },
    { id: 'f5', categoryId: 'food', petName: '布丁', ownerLdap: 'CHARLIE', photoUrl: createPetSvg('#FFF3CD', 'dog', '布丁'), initialVotes: 9, status: 'active', createdAt: Date.now() - 100000 },
    { id: 'f6', categoryId: 'food', petName: '奥利奥', ownerLdap: 'DAVID', photoUrl: createPetSvg('#F0E6EF', 'cat', '奥利奥'), initialVotes: 8, status: 'active', createdAt: Date.now() - 80000 },
    { id: 'f7', categoryId: 'food', petName: '汉堡', ownerLdap: 'EMILY', photoUrl: createPetSvg('#FFE8D6', 'dog', '汉堡'), initialVotes: 7, status: 'active', createdAt: Date.now() - 60000 },
    { id: 'f8', categoryId: 'food', petName: '奶黄', ownerLdap: 'FRANK', photoUrl: createPetSvg('#FFF3CD', 'cat', '奶黄'), initialVotes: 6, status: 'active', createdAt: Date.now() - 40000 },
    { id: 'f9', categoryId: 'food', petName: '薯条', ownerLdap: 'GEORGE', photoUrl: createPetSvg('#FFE8D6', 'dog', '薯条'), initialVotes: 4, status: 'active', createdAt: Date.now() - 20000 },

    { id: 'a1', categoryId: 'abstract', petName: '二哈', ownerLdap: 'ZHANG', photoUrl: createPetSvg('#D8F3DC', 'dog', '二哈'), initialVotes: 16, status: 'active', createdAt: Date.now() - 450000 },
    { id: 'a2', categoryId: 'abstract', petName: '汤圆', ownerLdap: 'ALICE', photoUrl: createPetSvg('#E8F4F8', 'cat', '汤圆'), initialVotes: 13, status: 'active', createdAt: Date.now() - 350000 },
    { id: 'a3', categoryId: 'abstract', petName: '皮皮', ownerLdap: 'BOBBY', photoUrl: createPetSvg('#D8F3DC', 'dog', '皮皮'), initialVotes: 11, status: 'active', createdAt: Date.now() - 250000 },
    { id: 'a4', categoryId: 'abstract', petName: '迷糊', ownerLdap: 'JENNIFER', photoUrl: createPetSvg('#D8F3DC', 'cat', '迷糊'), initialVotes: 10, status: 'active', createdAt: Date.now() - 150000 },

    { id: 'b1', categoryId: 'beauty', petName: '小白', ownerLdap: 'ZHANG', photoUrl: createPetSvg('#E8D7F1', 'cat', '小白'), initialVotes: 18, status: 'active', createdAt: Date.now() - 480000 },
    { id: 'b2', categoryId: 'beauty', petName: '雪球', ownerLdap: 'ALICE', photoUrl: createPetSvg('#E8D7F1', 'dog', '雪球'), initialVotes: 15, status: 'active', createdAt: Date.now() - 380000 },
    { id: 'b3', categoryId: 'beauty', petName: '可可', ownerLdap: 'BOBBY', photoUrl: createPetSvg('#E8D7F1', 'cat', '可可'), initialVotes: 12, status: 'active', createdAt: Date.now() - 280000 },
    { id: 'b4', categoryId: 'beauty', petName: '小福', ownerLdap: 'JENNIFER', photoUrl: createPetSvg('#E8D7F1', 'dog', '小福'), initialVotes: 11, status: 'active', createdAt: Date.now() - 180000 }
  ],
  congrats: [
    { id: 'm1', ownerLdap: 'JENNIFER', content: '恭喜团子拿下干饭王者！实至名归 🥇', createdAt: Date.now() - 3600000 * 4 },
    { id: 'm2', ownerLdap: 'ZHANG', content: '这次比赛太好玩了，明年还要办！', createdAt: Date.now() - 3600000 * 2 },
    { id: 'm3', ownerLdap: 'ALICE', content: '每个毛孩都是我们心中的冠军，爱你萌 ❤️', createdAt: Date.now() - 3600000 * 1 }
  ],
  initialVotes: {},
  matchVotes: {},
  matches: {}
};

// 状态单例
class AppState {
  constructor() {
    this.state = JSON.parse(localStorage.getItem('pawscars_sim_state') || 'null') || INITIAL_STATE;
    this.ensureMatches();
  }

  save() {
    localStorage.setItem('pawscars_sim_state', JSON.stringify(this.state));
  }

  reset() {
    this.state = JSON.parse(JSON.stringify(INITIAL_STATE));
    this.ensureMatches();
    this.save();
  }

  ensureMatches() {
    const { categories, entries, matches } = this.state;
    categories.forEach(cat => {
      const catEntries = entries.filter(e => e.categoryId === cat.id && e.status !== 'deleted');
      // 8进4对阵
      const qfKey = `${cat.id}_8进4`;
      if (!matches[qfKey] || matches[qfKey].length === 0) {
        // 按LDAP字母排序取前8配对
        const sorted = [...catEntries].sort((a, b) => a.ownerLdap.localeCompare(b.ownerLdap)).slice(0, 8);
        const qf = [];
        for (let i = 0; i < sorted.length; i += 2) {
          qf.push({
            id: `${cat.id}_qf_${Math.floor(i / 2) + 1}`,
            categoryId: cat.id,
            stage: '8进4',
            index: Math.floor(i / 2) + 1,
            entryA: sorted[i],
            entryB: sorted[i + 1] || sorted[0],
            votesA: 8,
            votesB: 6
          });
        }
        matches[qfKey] = qf;
      }

      // 4强德比对阵 (6场循环赛)
      const derbyKey = `${cat.id}_4强德比`;
      if (!matches[derbyKey] || matches[derbyKey].length === 0) {
        const top4 = [...catEntries].slice(0, 4);
        if (top4.length >= 2) {
          const pairs = [[0,1], [2,3], [0,2], [1,3], [0,3], [1,2]];
          matches[derbyKey] = pairs.map((p, idx) => ({
            id: `${cat.id}_derby_${idx + 1}`,
            categoryId: cat.id,
            stage: '4强德比',
            index: idx + 1,
            entryA: top4[p[0]],
            entryB: top4[p[1]] || top4[0],
            votesA: idx % 2 === 0 ? 12 : 9,
            votesB: idx % 2 === 0 ? 8 : 14
          }));
        }
      }
    });
  }
}

const Store = new AppState();

// 4. 页面路由器与控制器
const Router = {
  currentPage: 'index',
  params: {},

  init() {
    this.bindControls();
    const urlParams = new URLSearchParams(window.location.search);
    const targetPage = urlParams.get('page') || 'index';
    const targetPhase = urlParams.get('phase');
    const targetUser = urlParams.get('user');

    if (targetPhase) {
      Store.state.config.currentPhase = targetPhase;
      const phaseSel = document.getElementById('simPhaseSelect');
      if (phaseSel) phaseSel.value = targetPhase;
    }
    if (targetUser) {
      Store.state.currentUserLdap = targetUser === 'UNBOUND' ? '' : targetUser;
      const userSel = document.getElementById('simUserSelect');
      if (userSel) userSel.value = targetUser;
    }
    Store.save();
    this.navigate(targetPage);
  },

  navigate(page, params = {}) {
    this.currentPage = page;
    this.params = params;
    const container = document.getElementById('pageContainer');
    container.innerHTML = '';

    // 如果用户未绑定且进入需要绑定的页面
    if (!Store.state.currentUserLdap && ['nominate', 'vote_initial', 'vote_match', 'my_nominations'].includes(page)) {
      this.renderAuth(container);
      return;
    }

    switch (page) {
      case 'index': this.renderIndex(container); break;
      case 'auth': this.renderAuth(container); break;
      case 'nominate': this.renderNominate(container); break;
      case 'vote_initial': this.renderVoteInitial(container); break;
      case 'vote_match': this.renderVoteMatch(container); break;
      case 'awards': this.renderAwards(container); break;
      case 'my_nominations': this.renderMyNominations(container); break;
      case 'admin': this.renderAdmin(container); break;
      default: this.renderIndex(container);
    }

    // 滚动至顶部
    document.getElementById('appViewport').scrollTop = 0;
  },

  bindControls() {
    const phaseSelect = document.getElementById('simPhaseSelect');
    const userSelect = document.getElementById('simUserSelect');
    const resetBtn = document.getElementById('simResetBtn');
    const adminBtn = document.getElementById('simAdminBtn');

    phaseSelect.value = Store.state.config.currentPhase;
    userSelect.value = Store.state.currentUserLdap || 'UNBOUND';

    phaseSelect.addEventListener('change', (e) => {
      Store.state.config.currentPhase = e.target.value;
      Store.save();
      this.navigate('index');
    });

    userSelect.addEventListener('change', (e) => {
      Store.state.currentUserLdap = e.target.value === 'UNBOUND' ? '' : e.target.value;
      Store.save();
      this.navigate(this.currentPage);
    });

    resetBtn.addEventListener('click', () => {
      if (confirm('是否重置所有模拟数据为初始状态？')) {
        Store.reset();
        phaseSelect.value = Store.state.config.currentPhase;
        userSelect.value = Store.state.currentUserLdap;
        this.navigate('index');
      }
    });

    adminBtn.addEventListener('click', () => {
      this.navigate('admin');
    });

    // 弹窗关闭事件
    document.getElementById('closeRulesBtn').onclick = () => document.getElementById('globalRulesModal').classList.add('hidden');
    document.getElementById('confirmRulesBtn').onclick = () => document.getElementById('globalRulesModal').classList.add('hidden');
    document.getElementById('closeCertBtn').onclick = () => document.getElementById('globalCertModal').classList.add('hidden');
    document.getElementById('downloadCertBtn').onclick = () => {
      alert('🏅 证书图片已成功生成并保存！');
      document.getElementById('globalCertModal').classList.add('hidden');
    };
    document.getElementById('closeCongratsModalBtn').onclick = () => document.getElementById('globalCongratsModal').classList.add('hidden');
  },

  openRules() {
    document.getElementById('globalRulesModal').classList.remove('hidden');
  },

  openCert(entry, categoryName, rankText) {
    document.getElementById('certPetPhoto').src = entry.photoUrl;
    document.getElementById('certPetName').innerText = entry.petName;
    document.getElementById('certMaskedTag').innerText = maskLdap(entry.ownerLdap);
    document.getElementById('certRibbonText').innerText = `${categoryName} · ${rankText}`;
    document.getElementById('globalCertModal').classList.remove('hidden');
  },

  // ================= 页面渲染器 ================= //

  // 1. 首页
  renderIndex(container) {
    const { config, categories } = Store.state;
    const phase = config.currentPhase;

    let dynamicBody = '';

    if (phase === 'nominate') {
      // 报名期一屏紧凑排版
      dynamicBody = `
        <div class="story-desc">${config.hostIntro}</div>
        <div class="rule-capsule-wrap" style="display:flex;justify-content:center;margin-bottom:12px;">
          <div class="rule-capsule" style="cursor:pointer;" id="indexRulesBtn">${config.rulesSummary}</div>
        </div>
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#332827;">评选类别：</div>
        <div style="display:flex;gap:10px;margin-bottom:14px;">
          ${categories.map(c => `
            <div style="flex:1;border-radius:16px;background:${c.bg};padding:12px 6px;text-align:center;box-shadow:0 3px 10px rgba(0,0,0,0.04);">
              <div style="font-size:20px;margin-bottom:2px;">${c.icon}</div>
              <div style="font-size:14px;font-weight:700;color:${c.textColor}">${c.tag}</div>
              <div style="font-size:11px;font-weight:500;color:${c.textColor}">${c.suffix}</div>
            </div>
          `).join('')}
        </div>
        <div style="text-align:center;font-size:13px;font-weight:500;color:#38242A;margin-bottom:12px;">
          ${config.callToActionText}
        </div>
        <button class="paw-btn paw-btn-primary" style="width:100%;height:44px;font-size:15px;" id="indexNominateBtn">我要提名</button>
      `;
    } else if (phase === 'awards') {
      // 颁奖期
      dynamicBody = `
        <div style="background:#FFF8E7;border:1.5px solid #FAC775;border-radius:18px;padding:20px 16px;text-align:center;margin-bottom:16px;">
          <div style="font-size:36px;margin-bottom:8px;">🏆</div>
          <div style="font-size:15px;font-weight:700;color:#5C4A02;margin-bottom:4px;">热烈祝贺 2026 Pawscars 毛孩奥斯卡的王者们！</div>
          <div style="font-size:12px;color:#786414;">三大门类冠军已荣耀揭晓</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="paw-btn paw-btn-primary" style="width:100%;height:44px;" id="indexAwardsBtn">查看颁奖结果</button>
          <button class="paw-btn paw-btn-outline" style="width:100%;height:44px;" id="indexMyNomBtn">📋 我的提名</button>
        </div>
      `;
    } else {
      // 投票期 (初选/8进4/4强德比)
      const stageName = phase === 'vote_initial' ? '初选打投' : (phase === 'vote_match_8' ? '8强淘汰赛' : '4强巅峰德比');
      dynamicBody = `
        <div style="background:#E6F6F1;border-radius:18px;padding:16px;text-align:center;margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;color:#085041;margin-bottom:4px;">投票进行中 · 阶段${phase === 'vote_initial' ? '一' : (phase === 'vote_match_8' ? '二' : '三')}</div>
          <div style="font-size:15px;font-weight:700;color:#04342C;margin-bottom:6px;">Pawscars【${stageName}】进行时</div>
          <div style="font-size:12px;color:#0F6B58;">距离本阶段投票截止还有 3 天 12 小时</div>
        </div>
        <div style="display:flex;justify-content:center;gap:8px;margin-bottom:16px;">
          <div class="rule-capsule ${phase === 'vote_initial' ? 'pill-active' : ''}" style="${phase === 'vote_initial' ? 'background:#9FE1CB;color:#04342C;font-weight:700;' : ''}">初选</div>
          <div class="rule-capsule ${phase === 'vote_match_8' ? 'pill-active' : ''}" style="${phase === 'vote_match_8' ? 'background:#9FE1CB;color:#04342C;font-weight:700;' : ''}">8进4</div>
          <div class="rule-capsule ${phase === 'vote_match_4' ? 'pill-active' : ''}" style="${phase === 'vote_match_4' ? 'background:#9FE1CB;color:#04342C;font-weight:700;' : ''}">4强德比</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="paw-btn paw-btn-primary" style="width:100%;height:44px;" id="indexVoteBtn">我要投票</button>
          <button class="paw-btn paw-btn-outline" style="width:100%;height:44px;" id="indexMyNomBtn">📋 我的提名</button>
        </div>
      `;
    }

    container.innerHTML = `
      <div style="width:100%;min-height:100%;background:#FDFBF7;display:flex;flex-direction:column;">
        <!-- 顶部浅粉 Banner 区 -->
        <div style="background:#FBEAF0;padding:16px 20px 14px;display:flex;flex-direction:column;align-items:center;">
          <div style="width:100%;display:flex;align-items:center;justify-content:space-between;">
            <div style="width:52px;height:52px;background:#C7E4F5;border:3px solid #FFF;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 3px 8px rgba(0,0,0,0.06);">🐱</div>
            <div style="text-align:center;cursor:pointer;" id="indexBrandTitle">
              <div style="font-size:20px;font-weight:800;color:#38242A;line-height:1.1;">Pawscars</div>
              <div style="font-size:16px;font-weight:600;color:#38242A;line-height:1.2;">毛孩奥斯卡</div>
            </div>
            <div style="width:52px;height:52px;background:#C7E4F5;border:3px solid #FFF;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 3px 8px rgba(0,0,0,0.06);">🐶</div>
          </div>
          <div style="display:flex;gap:12px;margin-top:10px;">
            <div style="width:30px;height:30px;border-radius:50%;background:#FAC775;display:flex;align-items:center;justify-content:center;font-size:14px;">🐾</div>
            <div style="width:30px;height:30px;border-radius:50%;background:#9FE1CB;display:flex;align-items:center;justify-content:center;font-size:14px;">🏆</div>
            <div style="width:30px;height:30px;border-radius:50%;background:#CECBF6;display:flex;align-items:center;justify-content:center;font-size:14px;">❤️</div>
          </div>
        </div>

        <!-- 正文主体 -->
        <div style="flex:1;padding:16px 20px 12px;display:flex;flex-direction:column;">
          <!-- 宫师姐发言人样式 -->
          <div style="display:flex;align-items:center;margin-bottom:8px;">
            <div style="width:30px;height:30px;border-radius:50%;background:#F4C0D1;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;color:#612D3A;margin-right:8px;">宫</div>
            <span style="font-size:13px;font-weight:700;color:#38242A;">${config.hostName || '宫师姐'}</span>
          </div>
          ${dynamicBody}
        </div>

        <!-- 底部微型管理入口 -->
        <div style="padding:10px 20px 20px;text-align:center;">
          <span style="font-size:11px;color:#9A9290;cursor:pointer;background:#F4F0E8;padding:4px 10px;border-radius:10px;" id="indexAdminEntry">⚙️ 管理后台 / 赛程模拟</span>
        </div>
      </div>
    `;

    // 绑定事件
    if (document.getElementById('indexRulesBtn')) document.getElementById('indexRulesBtn').onclick = () => this.openRules();
    if (document.getElementById('indexNominateBtn')) document.getElementById('indexNominateBtn').onclick = () => this.navigate('nominate');
    if (document.getElementById('indexVoteBtn')) {
      document.getElementById('indexVoteBtn').onclick = () => {
        if (phase === 'vote_initial') this.navigate('vote_initial');
        else this.navigate('vote_match');
      };
    }
    if (document.getElementById('indexAwardsBtn')) document.getElementById('indexAwardsBtn').onclick = () => this.navigate('awards');
    if (document.getElementById('indexMyNomBtn')) document.getElementById('indexMyNomBtn').onclick = () => this.navigate('my_nominations');
    if (document.getElementById('indexAdminEntry')) document.getElementById('indexAdminEntry').onclick = () => this.navigate('admin');
  },

  // 2. 身份绑定页 (Auth)
  renderAuth(container) {
    container.innerHTML = `
      <div style="min-height:100%;background:#FDFBF7;padding:30px 20px;display:flex;flex-direction:column;align-items:center;">
        <div style="width:100%;background:#FFF;border-radius:24px;padding:24px 20px;box-shadow:0 6px 20px rgba(0,0,0,0.05);">
          <div style="text-align:center;margin-bottom:20px;">
            <div style="width:60px;height:60px;border-radius:50%;background:#FBEAF0;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:10px;">🐾</div>
            <div style="font-size:18px;font-weight:700;color:#38242A;">欢迎参加 Pawscars</div>
            <div style="font-size:12px;color:#7A7270;margin-top:4px;">请先绑定你的社群活动ID (LDAP)</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <label style="font-size:12px;font-weight:600;color:#332827;">活动ID (LDAP)</label>
            <input id="authLdapInput" style="height:44px;background:#F7F5F0;border:1.5px solid #EBE6DC;border-radius:14px;padding:0 12px;font-size:14px;" placeholder="例如：JENNIFER（仅限英文字母）" maxlength="20" />
            <div id="authErrorMsg" style="color:#E56B6F;font-size:11px;display:none;"></div>
            <div style="font-size:11px;color:#8C8482;margin-top:4px;line-height:1.4;">
              ℹ️ 说明：ID 用于评选身份标识与拉票辨识（前端展示时会自动隐去部分字母如 JE****** 保障隐私）。
            </div>
            <button class="paw-btn paw-btn-primary" style="width:100%;height:44px;margin-top:16px;" id="authSubmitBtn">确认绑定</button>
          </div>
          <div style="margin-top:24px;padding-top:16px;border-top:1px dashed #ECE7DE;text-align:center;">
            <div style="font-size:12px;font-weight:600;color:#665E5C;">ID 被他人占用了？</div>
            <div style="font-size:11px;color:#9A9290;margin:4px 0 8px;">若发现常用 ID 被误占用，请联系管理员申诉：</div>
            <a style="font-size:12px;color:#0C447C;font-weight:600;text-decoration:underline;cursor:pointer;" id="authAppealBtn">📩 联系管理员申诉</a>
          </div>
        </div>
      </div>
    `;

    document.getElementById('authSubmitBtn').onclick = () => {
      const input = document.getElementById('authLdapInput').value.trim();
      const err = document.getElementById('authErrorMsg');
      const ADMINS = ['LIMA0001', 'PRIVACY-BY-DESIGN', 'ADMIN_LIMA', 'ADMIN_GONG', 'DEVELOPER'];
      const isAdmin = ADMINS.includes(input.toUpperCase());
      if (!input || (!/^[A-Za-z]+$/.test(input) && !isAdmin) || input.length < 2) {
        err.innerText = '活动ID仅支持纯英文字母，且长度至少2位';
        err.style.display = 'block';
        return;
      }
      Store.state.currentUserLdap = input.toUpperCase();
      Store.save();
      document.getElementById('simUserSelect').value = Store.state.currentUserLdap;
      alert(`🎉 成功绑定活动ID: ${Store.state.currentUserLdap}`);
      this.navigate('index');
    };

    document.getElementById('authAppealBtn').onclick = () => {
      alert('请在群内联系活动组织者（宫师姐），告知你被占用的常用ID，后台核实后即可解绑！');
    };
  },

  // 3. 报名/提名页 (Nominate)
  renderNominate(container) {
    const { categories, entries, currentUserLdap } = Store.state;
    const myEntries = entries.filter(e => e.ownerLdap.toUpperCase() === currentUserLdap.toUpperCase() && e.status !== 'deleted');

    let uploadedPhoto = '';
    let selectedCats = { [categories[0].id]: true };

    container.innerHTML = `
      <div style="min-height:100%;background:#FDFBF7;display:flex;flex-direction:column;">
        <div class="sim-nav-bar">
          <div class="sim-nav-left"><div class="sim-pill-btn" id="navBackBtn">‹ 返回</div></div>
          <div class="sim-nav-center"><div class="sim-main-title">我要提名</div><div class="sim-sub-title">提交参赛毛孩</div></div>
          <div class="sim-nav-right"><div class="sim-pill-btn" id="navMyNomBtn">📋 提名</div></div>
        </div>

        <div style="flex:1;padding:16px 20px 30px;">
          <div style="background:#FFF;border-radius:22px;padding:18px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
            <!-- 照片上传 -->
            <div style="margin-bottom:16px;">
              <div style="font-size:13px;font-weight:700;color:#332827;margin-bottom:6px;">毛孩照片 <span style="font-size:11px;color:#8C8482;font-weight:normal;">(单张，自动正方形)</span></div>
              <div id="photoBox" style="width:100%;height:180px;background:#FAF8F2;border:2px dashed #E0DACD;border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;position:relative;">
                <div style="font-size:32px;margin-bottom:4px;">📷</div>
                <div style="font-size:13px;font-weight:600;color:#554845;">点击生成/上传爱宠靓照</div>
                <div style="font-size:11px;color:#9C9391;">猫猫/狗狗/虚拟AI生成均可</div>
              </div>
            </div>

            <!-- 名字 -->
            <div style="margin-bottom:16px;">
              <div style="font-size:13px;font-weight:700;color:#332827;margin-bottom:6px;">毛孩名字 <span style="color:#E56B6F;">*</span></div>
              <input id="petNameInput" style="width:100%;height:44px;background:#F7F5F0;border:1.5px solid #EBE6DC;border-radius:14px;padding:0 12px;font-size:13px;" placeholder="给毛孩起个闪亮的名字 (1-20字)" maxlength="20" value="团子" />
            </div>

            <!-- 门类多选 chips -->
            <div style="margin-bottom:16px;">
              <div style="font-size:13px;font-weight:700;color:#332827;margin-bottom:6px;">参赛门类 <span style="font-size:11px;color:#8C8482;font-weight:normal;">(可同时多选)</span></div>
              <div style="display:flex;flex-direction:column;gap:8px;" id="chipsGroup">
                ${categories.map(c => `
                  <div class="cat-chip-item" data-id="${c.id}" style="padding:10px 14px;border-radius:16px;background:${selectedCats[c.id] ? c.bg : '#F7F5F0'};border:1.5px solid ${selectedCats[c.id] ? c.accentColor : '#EBE6DC'};display:flex;align-items:center;cursor:pointer;">
                    <span style="font-size:18px;margin-right:8px;">${c.icon}</span>
                    <span style="font-size:13px;font-weight:700;color:${selectedCats[c.id] ? c.textColor : '#4A3E3D'};flex:1;">${c.name}</span>
                    <span style="font-weight:bold;color:${c.textColor};">${selectedCats[c.id] ? '✓' : ''}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- 承诺勾选 -->
            <div style="display:flex;align-items:center;margin-bottom:20px;cursor:pointer;" id="pledgeCheckbox">
              <div id="checkCircle" style="width:20px;height:20px;border-radius:50%;border:2px solid #5C4A02;background:#FAC775;display:flex;align-items:center;justify-content:center;margin-right:8px;font-size:12px;font-weight:bold;color:#5C4A02;">✓</div>
              <div style="font-size:12px;color:#554A49;">我确认这是本人拍摄/生成的毛孩子照片</div>
            </div>

            <button class="paw-btn paw-btn-primary" style="width:100%;height:44px;font-size:15px;" id="submitNomBtn">确认提名</button>
          </div>

          <!-- 已提名毛孩 -->
          ${myEntries.length > 0 ? `
            <div style="margin-top:20px;">
              <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#38242A;">已提名的毛孩 (${myEntries.length})</div>
              <div style="display:flex;gap:12px;overflow-x:auto;">
                ${myEntries.map(e => `
                  <div style="background:#FFF;border-radius:16px;padding:8px;display:flex;flex-direction:column;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,0.04);flex-shrink:0;">
                    <div style="width:80px;height:80px;border-radius:14px;overflow:hidden;position:relative;">
                      <img src="${e.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />
                      <div style="position:absolute;bottom:4px;right:4px;background:rgba(255,255,255,0.85);font-size:8px;font-weight:bold;padding:1px 4px;border-radius:4px;">${maskLdap(e.ownerLdap)}</div>
                    </div>
                    <span style="font-size:11px;font-weight:700;margin-top:4px;">${e.petName}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    uploadedPhoto = createPetSvg('#FFF3CD', 'cat', '团子');
    document.getElementById('photoBox').innerHTML = `<img src="${uploadedPhoto}" style="width:100%;height:100%;object-fit:cover;" /><div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.5);color:#FFF;font-size:10px;padding:3px 8px;border-radius:8px;">点击更换</div>`;

    document.getElementById('photoBox').onclick = () => {
      const animals = ['dog', 'cat'];
      const bgs = ['#FFF3CD', '#D8F3DC', '#E8D7F1', '#FFE8D6'];
      uploadedPhoto = createPetSvg(bgs[Math.floor(Math.random() * bgs.length)], animals[Math.floor(Math.random() * 2)], document.getElementById('petNameInput').value || '毛孩');
      document.getElementById('photoBox').innerHTML = `<img src="${uploadedPhoto}" style="width:100%;height:100%;object-fit:cover;" /><div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.5);color:#FFF;font-size:10px;padding:3px 8px;border-radius:8px;">点击更换</div>`;
    };

    let pledged = true;
    document.getElementById('pledgeCheckbox').onclick = () => {
      pledged = !pledged;
      document.getElementById('checkCircle').style.background = pledged ? '#FAC775' : '#FFF';
      document.getElementById('checkCircle').innerText = pledged ? '✓' : '';
    };

    // Chips 多选切换
    document.querySelectorAll('.cat-chip-item').forEach(chip => {
      chip.onclick = () => {
        const id = chip.dataset.id;
        if (selectedCats[id]) delete selectedCats[id];
        else selectedCats[id] = true;

        const catObj = categories.find(c => c.id === id);
        chip.style.background = selectedCats[id] ? catObj.bg : '#F7F5F0';
        chip.style.borderColor = selectedCats[id] ? catObj.accentColor : '#EBE6DC';
        chip.querySelector('span:last-child').innerText = selectedCats[id] ? '✓' : '';
      };
    });

    document.getElementById('submitNomBtn').onclick = () => {
      const petName = document.getElementById('petNameInput').value.trim();
      if (!petName) { alert('请输入毛孩名字'); return; }
      if (!pledged) { alert('请勾选本人拍摄承诺'); return; }
      const chosenCatIds = Object.keys(selectedCats);
      if (chosenCatIds.length === 0) { alert('请至少勾选一个门类'); return; }

      // 循环写入
      let skipped = [];
      let added = 0;
      chosenCatIds.forEach(catId => {
        const exists = Store.state.entries.some(e => e.ownerLdap.toUpperCase() === currentUserLdap.toUpperCase() && e.petName === petName && e.categoryId === catId && e.status !== 'deleted');
        if (exists) {
          skipped.push(categories.find(c => c.id === catId).name);
        } else {
          Store.state.entries.push({
            id: `entry_${Date.now()}_${catId}`,
            categoryId: catId,
            petName,
            ownerLdap: currentUserLdap.toUpperCase(),
            photoUrl: uploadedPhoto,
            initialVotes: 0,
            status: 'active',
            createdAt: Date.now()
          });
          added++;
        }
      });

      Store.ensureMatches();
      Store.save();

      if (skipped.length > 0) {
        alert(`该毛孩已在【${skipped.join('、')}】报过名，其余门类提交成功！`);
      } else {
        alert('🎉 恭喜！毛孩提名成功！');
      }
      this.navigate('nominate');
    };

    document.getElementById('navBackBtn').onclick = () => this.navigate('index');
    document.getElementById('navMyNomBtn').onclick = () => this.navigate('my_nominations');
  },

  // 4. 初选划屏页 (Vote Initial)
  renderVoteInitial(container) {
    const { categories, entries, currentUserLdap } = Store.state;
    if (!Store.state.initialVotes[currentUserLdap]) {
      Store.state.initialVotes[currentUserLdap] = {};
    }
    const userVotes = Store.state.initialVotes[currentUserLdap];

    container.innerHTML = `
      <div style="min-height:100%;background:#FDFBF7;display:flex;flex-direction:column;">
        <div class="sim-nav-bar">
          <div class="sim-nav-left"><div class="sim-pill-btn" id="initMyNomBtn">📋 我的提名</div></div>
          <div class="sim-nav-center"><div class="sim-main-title">Pawscars毛孩奥斯卡</div><div class="sim-sub-title">初选投票</div></div>
          <div class="sim-nav-right">
            <div class="sim-bubble-btn" id="initRulesBubble"><div class="sim-avatar-circle">宫</div></div>
          </div>
        </div>

        <div style="flex:1;padding:12px 0 80px;overflow-y:auto;" id="initialRowsContainer">
          ${categories.map(cat => {
            const catEntries = [...entries.filter(e => e.categoryId === cat.id && e.status !== 'deleted')]
              .sort((a, b) => a.ownerLdap.localeCompare(b.ownerLdap));
            const selectedSet = new Set(userVotes[cat.id] || []);

            return `
              <div class="cat-swipe-row" data-cat="${cat.id}" style="margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0 20px 8px;">
                  <span style="font-size:15px;font-weight:700;color:${cat.textColor};">${cat.name}</span>
                  <span style="font-size:12px;color:#7A7270;">已选 <strong class="counter-${cat.id}" style="color:#2B2625;">${selectedSet.size}</strong>/8</span>
                </div>
                <!-- 横向可滑动容器 -->
                <div style="display:flex;gap:12px;overflow-x:auto;padding:0 20px 8px;scroll-snap-type:x mandatory;">
                  ${catEntries.map(pet => {
                    const isSelected = selectedSet.has(pet.id);
                    return `
                      <div class="swipe-pet-card ${isSelected ? 'selected' : ''}" data-pet="${pet.id}" data-cat="${cat.id}" style="flex-shrink:0;width:160px;display:flex;flex-direction:column;align-items:center;scroll-snap-align:center;cursor:pointer;">
                        <span style="font-size:13px;font-weight:700;color:#2B2625;margin-bottom:6px;">${pet.petName}</span>
                        <div style="width:160px;height:105px;border-radius:14px;background:${cat.bg};position:relative;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);border:${isSelected ? '2.5px solid #D85A30' : 'none'};">
                          <img src="${pet.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />
                          <div class="heart-toggle" style="position:absolute;top:6px;right:6px;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:14px;">
                            ${isSelected ? '❤️' : '🤍'}
                          </div>
                          <div style="position:absolute;bottom:6px;right:6px;background:rgba(255,255,255,0.85);font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;">
                            ${maskLdap(pet.ownerLdap)}
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- 底部吸底按钮 -->
        <div style="position:fixed;bottom:0;left:0;right:0;padding:10px 20px 24px;background:linear-gradient(to top,#FDFBF7 80%,rgba(253,251,247,0));display:flex;justify-content:center;z-index:90;">
          <button class="paw-btn paw-btn-primary" style="width:100%;max-width:335px;height:44px;font-size:15px;" id="submitInitVotesBtn">选好了！冲鸭</button>
        </div>
      </div>
    `;

    // 绑定爱心选择
    document.querySelectorAll('.swipe-pet-card').forEach(card => {
      card.onclick = () => {
        const catId = card.dataset.cat;
        const petId = card.dataset.pet;
        if (!userVotes[catId]) userVotes[catId] = [];

        const idx = userVotes[catId].indexOf(petId);
        if (idx !== -1) {
          userVotes[catId].splice(idx, 1);
        } else {
          if (userVotes[catId].length >= 8) {
            alert('每个门类最多选择 8 张哦！');
            return;
          }
          userVotes[catId].push(petId);
        }
        Store.save();
        this.renderVoteInitial(container);
      };
    });

    document.getElementById('submitInitVotesBtn').onclick = () => {
      alert('🎉 选好了！初选投票已锁定提交。结算后将按票数自动生成8强淘汰赛！');
      this.navigate('my_nominations');
    };

    document.getElementById('initRulesBubble').onclick = () => this.openRules();
    document.getElementById('initMyNomBtn').onclick = () => this.navigate('my_nominations');
  },

  // 5. PK 对局投票页 (Vote Match - 8进4 / 4强德比)
  renderVoteMatch(container) {
    const { config, categories, matches, currentUserLdap } = Store.state;
    const stage = config.currentPhase === 'vote_match_4' ? '4强德比' : '8进4';

    const currentCatId = this.params.catId || categories[0].id;
    const currentCat = categories.find(c => c.id === currentCatId);
    const catMatches = matches[`${currentCatId}_${stage}`] || [];

    // 找出未投票的第一场
    let curMatch = null;
    let matchIdx = 0;
    for (let i = 0; i < catMatches.length; i++) {
      const voted = Store.state.matchVotes[`${currentUserLdap}_${catMatches[i].id}`];
      if (!voted) {
        curMatch = catMatches[i];
        matchIdx = i;
        break;
      }
    }

    const isCompleted = catMatches.length > 0 && !curMatch;

    container.innerHTML = `
      <div style="min-height:100%;background:#FDFBF7;display:flex;flex-direction:column;">
        <div class="sim-nav-bar">
          <div class="sim-nav-left"><div class="sim-pill-btn" id="matchMyNomBtn">📋 我的提名</div></div>
          <div class="sim-nav-center">
            <div class="sim-main-title">Pawscars毛孩奥斯卡</div>
            <div class="sim-sub-title">${isCompleted ? `${stage} · 已完成` : `${stage} · 第 ${matchIdx + 1}/${catMatches.length} 场`}</div>
          </div>
          <div class="sim-nav-right"><div class="sim-bubble-btn" id="matchRulesBubble"><div class="sim-avatar-circle">宫</div></div></div>
        </div>

        <!-- 门类切换胶囊 -->
        <div style="display:flex;padding:10px 20px;gap:8px;overflow-x:auto;background:#FFF;box-shadow:0 2px 6px rgba(0,0,0,0.02);">
          ${categories.map(c => `
            <div class="match-cat-pill" data-id="${c.id}" style="padding:6px 14px;border-radius:16px;background:${c.id === currentCatId ? c.bg : '#F4F2EC'};color:${c.id === currentCatId ? c.textColor : '#7A7270'};font-size:12px;font-weight:${c.id === currentCatId ? '700' : '500'};cursor:pointer;white-space:nowrap;">
              ${c.icon} ${c.name}
            </div>
          `).join('')}
        </div>

        <div style="text-align:center;font-size:13px;font-weight:700;color:#554A49;margin:10px 0 6px;">
          ${isCompleted ? '🎉 该门类本轮已全部投完！' : '点击为TA投票'}
        </div>

        ${!isCompleted && curMatch ? `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 20px;">
            <!-- 选手 A -->
            <div class="pk-card" id="chooseA" style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
              <span style="font-size:15px;font-weight:700;margin-bottom:6px;color:#2B2625;">${curMatch.entryA.petName}</span>
              <div class="photo-wrap" style="width:150px;height:150px;border-radius:16px;border:1.5px solid #EBE6DC;overflow:hidden;position:relative;background:#FFF;box-shadow:0 4px 12px rgba(0,0,0,0.04);transition:all 0.2s;">
                <img src="${curMatch.entryA.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />
                <div style="position:absolute;bottom:6px;right:6px;background:rgba(255,255,255,0.88);font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;">${maskLdap(curMatch.entryA.ownerLdap)}</div>
              </div>
            </div>

            <!-- VS 圆形 -->
            <div style="width:36px;height:36px;border-radius:50%;background:#F1EFE8;border:2px solid #FFF;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#554A49;margin:10px 0;box-shadow:0 2px 6px rgba(0,0,0,0.06);z-index:10;">VS</div>

            <!-- 选手 B -->
            <div class="pk-card" id="chooseB" style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
              <span style="font-size:15px;font-weight:700;margin-bottom:6px;color:#2B2625;">${curMatch.entryB.petName}</span>
              <div class="photo-wrap" style="width:150px;height:150px;border-radius:16px;border:1.5px solid #EBE6DC;overflow:hidden;position:relative;background:#FFF;box-shadow:0 4px 12px rgba(0,0,0,0.04);transition:all 0.2s;">
                <img src="${curMatch.entryB.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />
                <div style="position:absolute;bottom:6px;right:6px;background:rgba(255,255,255,0.88);font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;">${maskLdap(curMatch.entryB.ownerLdap)}</div>
              </div>
            </div>
          </div>

          <div style="padding:10px 20px 24px;display:flex;justify-content:center;">
            <button class="paw-btn paw-btn-outline" style="width:100%;max-width:320px;height:42px;font-size:13px;" id="shareMatchBtn">🔗 分享本场PK</button>
          </div>
        ` : `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 30px;text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">🎉</div>
            <div style="font-size:16px;font-weight:700;color:#2B2625;margin-bottom:8px;">【${currentCat.name}】本轮投票已完成</div>
            <div style="font-size:13px;color:#7A7270;margin-bottom:20px;">你的每一票都已精准记录（并列严格按时间戳裁决）。</div>
            <button class="paw-btn paw-btn-primary" style="width:100%;max-width:260px;height:42px;" id="nextCatBtn">再投下一个门类</button>
          </div>
        `}
      </div>
    `;

    document.querySelectorAll('.match-cat-pill').forEach(pill => {
      pill.onclick = () => {
        this.navigate('vote_match', { catId: pill.dataset.id });
      };
    });

    const triggerVote = (side) => {
      const wrap = document.getElementById(side === 'A' ? 'chooseA' : 'chooseB').querySelector('.photo-wrap');
      wrap.style.border = '2.5px solid #D85A30';
      wrap.style.transform = 'scale(1.03)';
      wrap.innerHTML += '<div style="position:absolute;top:8px;left:8px;width:24px;height:24px;border-radius:50%;background:#D85A30;color:#FFF;display:flex;align-items:center;justify-content:center;font-weight:bold;">✓</div>';

      Store.state.matchVotes[`${currentUserLdap}_${curMatch.id}`] = side;
      if (side === 'A') curMatch.votesA += 1;
      else curMatch.votesB += 1;
      Store.save();

      setTimeout(() => {
        this.renderVoteMatch(container);
      }, 550);
    };

    if (document.getElementById('chooseA')) document.getElementById('chooseA').onclick = () => triggerVote('A');
    if (document.getElementById('chooseB')) document.getElementById('chooseB').onclick = () => triggerVote('B');
    if (document.getElementById('shareMatchBtn')) {
      document.getElementById('shareMatchBtn').onclick = () => {
        alert(`【${curMatch.entryA.petName} VS ${curMatch.entryB.petName}】海报卡片已生成，可分享至微信群拉票！`);
      };
    }
    if (document.getElementById('nextCatBtn')) {
      document.getElementById('nextCatBtn').onclick = () => {
        const nextIdx = (categories.findIndex(c => c.id === currentCatId) + 1) % categories.length;
        this.navigate('vote_match', { catId: categories[nextIdx].id });
      };
    }

    document.getElementById('matchRulesBubble').onclick = () => this.openRules();
    document.getElementById('matchMyNomBtn').onclick = () => this.navigate('my_nominations');
  },

  // 6. 颁奖页 (Awards)
  renderAwards(container) {
    const { categories, entries, congrats } = Store.state;
    const currentCatId = this.params.catId || categories[0].id;
    const currentCat = categories.find(c => c.id === currentCatId);
    const catEntries = entries.filter(e => e.categoryId === currentCatId && e.status !== 'deleted');

    const champion = catEntries[0] || null;
    const runnerUp = catEntries[1] || null;
    const thirdPlace = catEntries[2] || null;

    container.innerHTML = `
      <div style="min-height:100%;background:#FDFBF7;display:flex;flex-direction:column;">
        <div class="sim-nav-bar">
          <div class="sim-nav-left"><div class="sim-pill-btn" id="awardsMyNomBtn">📋 我的提名</div></div>
          <div class="sim-nav-center"><div class="sim-main-title">Pawscars毛孩奥斯卡</div><div class="sim-sub-title">颁奖结果</div></div>
          <div class="sim-nav-right"><div class="sim-bubble-btn" id="awardsRulesBubble"><div class="sim-avatar-circle">宫</div></div></div>
        </div>

        <div style="flex:1;padding:12px 20px 40px;overflow-y:auto;">
          <!-- 门类切换胶囊 -->
          <div style="display:flex;gap:8px;margin-bottom:16px;justify-content:center;">
            ${categories.map(c => `
              <div class="awards-cat-pill" data-id="${c.id}" style="padding:6px 14px;border-radius:16px;background:${c.id === currentCatId ? c.bg : '#F1EFE8'};color:${c.id === currentCatId ? c.textColor : '#7A7270'};font-size:12px;font-weight:${c.id === currentCatId ? '700' : '500'};cursor:pointer;">
                ${c.name}
              </div>
            `).join('')}
          </div>

          <!-- 领奖台 (亚军左 - 冠军中上浮 - 季军右) -->
          <div style="display:flex;align-items:flex-end;justify-content:center;gap:12px;padding:20px 0 10px;">
            <!-- 亚军 -->
            ${runnerUp ? `
              <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;" id="silverSlot">
                <span style="font-size:22px;margin-bottom:4px;">🥈</span>
                <div style="width:68px;height:68px;border-radius:18px;border:2px solid #C0C0C0;overflow:hidden;position:relative;background:#FFF;">
                  <img src="${runnerUp.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />
                  <div style="position:absolute;bottom:4px;right:4px;background:rgba(255,255,255,0.85);font-size:8px;font-weight:bold;padding:1px 4px;border-radius:4px;">${maskLdap(runnerUp.ownerLdap)}</div>
                </div>
                <span style="font-size:13px;font-weight:700;margin-top:6px;">${runnerUp.petName}</span>
                <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:#E5E5E5;color:#4F4F4F;margin-top:2px;">亚军</span>
              </div>
            ` : ''}

            <!-- 冠军 (最大上浮) -->
            ${champion ? `
              <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:20px;cursor:pointer;" id="goldSlot">
                <span style="font-size:30px;margin-bottom:4px;">🏆</span>
                <div style="width:96px;height:96px;border-radius:18px;border:3px solid #FAC775;overflow:hidden;position:relative;background:#FFF;box-shadow:0 8px 20px rgba(250,199,117,0.3);">
                  <img src="${champion.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />
                  <div style="position:absolute;bottom:4px;right:4px;background:rgba(255,255,255,0.85);font-size:8px;font-weight:bold;padding:1px 4px;border-radius:4px;">${maskLdap(champion.ownerLdap)}</div>
                </div>
                <span style="font-size:15px;font-weight:800;margin-top:6px;">${champion.petName}</span>
                <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:#FAC775;color:#5C4A02;margin-top:2px;">冠军</span>
              </div>
            ` : ''}

            <!-- 季军 -->
            ${thirdPlace ? `
              <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;" id="bronzeSlot">
                <span style="font-size:22px;margin-bottom:4px;">🥉</span>
                <div style="width:62px;height:62px;border-radius:18px;border:2px solid #CD7F32;overflow:hidden;position:relative;background:#FFF;">
                  <img src="${thirdPlace.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />
                  <div style="position:absolute;bottom:4px;right:4px;background:rgba(255,255,255,0.85);font-size:8px;font-weight:bold;padding:1px 4px;border-radius:4px;">${maskLdap(thirdPlace.ownerLdap)}</div>
                </div>
                <span style="font-size:13px;font-weight:700;margin-top:6px;">${thirdPlace.petName}</span>
                <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:#F2D2B6;color:#6E3F1A;margin-top:2px;">季军</span>
              </div>
            ` : ''}
          </div>

          <!-- 生成获奖证书主操作 -->
          <div style="margin:14px 0 20px;">
            <button class="paw-btn paw-btn-primary" style="width:100%;height:44px;font-size:15px;" id="genCertBtn">生成获奖证书</button>
          </div>

          <!-- 分隔线 -->
          <div style="width:100%;height:1px;background:#ECE7DE;margin-bottom:20px;"></div>

          <!-- 贺词墙 -->
          <div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;">
              <span style="font-size:15px;font-weight:700;color:#2B2625;">贺词墙 <span style="font-size:12px;color:#8C8482;font-weight:normal;">(${congrats.length}条祝贺)</span></span>
              <span style="font-size:11px;color:#A39B99;">每人限发1条祝福</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
              ${congrats.map(c => `
                <div style="background:#F4F2EC;border-radius:14px;padding:12px 14px;">
                  <div style="font-size:13px;color:#38242A;line-height:1.5;margin-bottom:6px;">${c.content}</div>
                  <div style="display:flex;justify-content:space-between;font-size:10px;color:#7A7270;font-weight:600;">
                    <span>${maskLdap(c.ownerLdap)}</span>
                    <span style="color:#B5ACA9;font-weight:normal;">刚刚</span>
                  </div>
                </div>
              `).join('')}
            </div>
            <button class="paw-btn paw-btn-outline" style="width:100%;height:40px;" id="sendCongratsBtn">✍️ 发送贺词</button>
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll('.awards-cat-pill').forEach(pill => {
      pill.onclick = () => this.navigate('awards', { catId: pill.dataset.id });
    });

    if (champion) {
      document.getElementById('genCertBtn').onclick = () => this.openCert(champion, currentCat.name, '冠军');
      document.getElementById('goldSlot').onclick = () => this.openCert(champion, currentCat.name, '冠军');
    }
    if (runnerUp) document.getElementById('silverSlot').onclick = () => this.openCert(runnerUp, currentCat.name, '亚军');
    if (thirdPlace) document.getElementById('bronzeSlot').onclick = () => this.openCert(thirdPlace, currentCat.name, '季军');

    document.getElementById('sendCongratsBtn').onclick = () => {
      document.getElementById('congratsTextarea').value = '';
      document.getElementById('congratsLength').innerText = '0';
      document.getElementById('globalCongratsModal').classList.remove('hidden');
    };

    document.getElementById('congratsTextarea').oninput = (e) => {
      document.getElementById('congratsLength').innerText = e.target.value.length;
    };

    document.getElementById('submitCongratsModalBtn').onclick = () => {
      const text = document.getElementById('congratsTextarea').value.trim();
      if (!text) { alert('请输入祝贺内容'); return; }
      Store.state.congrats.unshift({
        id: `msg_${Date.now()}`,
        ownerLdap: Store.state.currentUserLdap,
        content: text,
        createdAt: Date.now()
      });
      Store.save();
      document.getElementById('globalCongratsModal').classList.add('hidden');
      alert('🎉 贺词发送成功，已展示在贺词墙！');
      this.renderAwards(container);
    };

    document.getElementById('awardsRulesBubble').onclick = () => this.openRules();
    document.getElementById('awardsMyNomBtn').onclick = () => this.navigate('my_nominations');
  },

  // 7. 我的提名私密页 (My Nominations)
  renderMyNominations(container) {
    const { config, categories, entries, currentUserLdap } = Store.state;
    const myEntries = entries.filter(e => e.ownerLdap.toUpperCase() === currentUserLdap.toUpperCase() && e.status !== 'deleted');

    container.innerHTML = `
      <div style="min-height:100%;background:#FDFBF7;display:flex;flex-direction:column;">
        <div class="sim-nav-bar">
          <div class="sim-nav-left"><div class="sim-pill-btn" id="myNomBackBtn">‹ 返回</div></div>
          <div class="sim-nav-center"><div class="sim-main-title">我的提名</div><div class="sim-sub-title">参赛毛孩状态追踪</div></div>
          <div class="sim-nav-right"></div>
        </div>

        <div style="flex:1;padding:16px 20px 30px;">
          <!-- 用户名卡片 -->
          <div style="background:#FFF;border-radius:20px;padding:14px 16px;display:flex;align-items:center;margin-bottom:16px;box-shadow:0 3px 10px rgba(0,0,0,0.03);">
            <div style="width:42px;height:42px;border-radius:50%;background:#FBEAF0;display:flex;align-items:center;justify-content:center;font-size:20px;margin-right:12px;">🐾</div>
            <div>
              <div style="font-size:15px;font-weight:700;color:#2B2625;">活动ID: ${currentUserLdap}</div>
              <div style="font-size:11px;color:#8C8482;">（私密页面，仅你本人可见实时票数与晋级状态）</div>
            </div>
          </div>

          ${myEntries.length > 0 ? `
            <div style="display:flex;flex-direction:column;gap:12px;">
              ${myEntries.map(e => {
                const cat = categories.find(c => c.id === e.categoryId);
                let statusTitle = '报名成功';
                let statusDetail = '已就绪，静候初选开启';
                if (config.currentPhase === 'vote_initial') {
                  statusTitle = '初选进行中';
                  statusDetail = `已获 ${e.initialVotes || 0} 票（前8名晋级淘汰赛）`;
                } else if (config.currentPhase === 'vote_match_8') {
                  statusTitle = '8进4单败淘汰赛';
                  statusDetail = '已按ID字母配对对决中，静候胜负公布！';
                } else if (config.currentPhase === 'vote_match_4') {
                  statusTitle = '4强巅峰德比';
                  statusDetail = '正处于6场循环赛激烈交锋中！';
                } else if (config.currentPhase === 'awards') {
                  statusTitle = '荣誉获奖者 🏆';
                  statusDetail = '恭喜荣登领奖台，快去生成专属荣誉证书！';
                }

                return `
                  <div style="background:#FFF;border-radius:20px;padding:14px;display:flex;box-shadow:0 4px 14px rgba(0,0,0,0.04);">
                    <div style="width:84px;height:84px;border-radius:14px;overflow:hidden;position:relative;margin-right:14px;flex-shrink:0;">
                      <img src="${e.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />
                      <div style="position:absolute;bottom:4px;right:4px;background:rgba(255,255,255,0.85);font-size:8px;font-weight:bold;padding:1px 4px;border-radius:4px;">${maskLdap(e.ownerLdap)}</div>
                    </div>
                    <div style="flex:1;display:flex;flex-direction:column;justify-content:space-between;">
                      <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:16px;font-weight:700;color:#2B2625;">${e.petName}</span>
                        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:${cat ? cat.bg : '#FAC775'};color:${cat ? cat.textColor : '#412402'};">${cat ? cat.name : e.categoryId}</span>
                      </div>
                      <div style="background:#FAF8F2;border-radius:10px;padding:6px 10px;margin-top:6px;">
                        <div style="font-size:12px;font-weight:700;color:#D85A30;">${statusTitle}</div>
                        <div style="font-size:11px;color:#6E6765;">${statusDetail}</div>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div style="text-align:center;padding:50px 20px;">
              <div style="font-size:44px;margin-bottom:10px;">🐶</div>
              <div style="font-size:16px;font-weight:700;color:#38242A;margin-bottom:4px;">你还没有提名毛孩</div>
              <div style="font-size:12px;color:#8C8482;margin-bottom:20px;">快去为自家的毛孩子报名参加 Pawscars 吧！</div>
              <button class="paw-btn paw-btn-primary" style="height:42px;" id="emptyNomBtn">立即去提名</button>
            </div>
          `}
        </div>
      </div>
    `;

    document.getElementById('myNomBackBtn').onclick = () => this.navigate('index');
    if (document.getElementById('emptyNomBtn')) document.getElementById('emptyNomBtn').onclick = () => this.navigate('nominate');
  },

  // 8. 管理后台控制台 (Admin)
  renderAdmin(container) {
    const { config, categories, entries } = Store.state;
    const phaseNames = {
      nominate: '1. 报名期',
      vote_initial: '2. 初选划屏',
      vote_match_8: '3. 8进4淘汰赛',
      vote_match_4: '4. 4强德比',
      awards: '5. 颁奖盛典'
    };

    container.innerHTML = `
      <div style="min-height:100%;background:#FDFBF7;display:flex;flex-direction:column;">
        <div class="sim-nav-bar">
          <div class="sim-nav-left"><div class="sim-pill-btn" id="adminBackBtn">‹ 返回</div></div>
          <div class="sim-nav-center"><div class="sim-main-title">管理后台</div><div class="sim-sub-title">赛程与数据运维</div></div>
          <div class="sim-nav-right"></div>
        </div>

        <div style="flex:1;padding:16px 20px 40px;overflow-y:auto;">
          <!-- 阶段流转控制 -->
          <div style="background:#FFF;border-radius:20px;padding:18px;margin-bottom:16px;box-shadow:0 4px 14px rgba(0,0,0,0.03);">
            <div style="font-size:14px;font-weight:700;margin-bottom:12px;color:#38242A;">⚙️ 活动阶段流转控制</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              ${Object.keys(phaseNames).map(p => `
                <button class="admin-phase-btn" data-phase="${p}" style="height:38px;background:${config.currentPhase === p ? '#FAC775' : '#F4F2EC'};border:1.5px solid ${config.currentPhase === p ? '#D8982D' : '#EBE6DC'};border-radius:12px;font-size:12px;font-weight:${config.currentPhase === p ? '700' : 'normal'};cursor:pointer;">
                  ${phaseNames[p]}
                </button>
              `).join('')}
            </div>
            <div style="font-size:11px;color:#7A7270;margin-top:10px;line-height:1.4;">
              当前阶段：<strong style="color:#D85A30;">${phaseNames[config.currentPhase]}</strong>（切换至 8进4 或 4强德比 会自动根据赛制规则结算并生成对阵表）
            </div>
          </div>

          <!-- 模拟身份切换 -->
          <div style="background:#FFF;border-radius:20px;padding:18px;margin-bottom:16px;box-shadow:0 4px 14px rgba(0,0,0,0.03);">
            <div style="font-size:14px;font-weight:700;margin-bottom:8px;color:#38242A;">👤 模拟身份快捷切换器</div>
            <div style="font-size:12px;color:#635C5B;margin-bottom:8px;">当前登录ID：<strong style="color:#D85A30;">${Store.state.currentUserLdap || '未绑定'}</strong></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
              ${['JENNIFER', 'ZHANG', 'ALICE', 'BOBBY', 'LIMA0001', 'privacy-by-design'].map(id => `
                <button class="small-switch-btn" data-id="${id}" style="padding:4px 10px;font-size:11px;border-radius:10px;background:${id.includes('0') || id.includes('-') ? '#FAC775' : '#F1EFE8'};color:${id.includes('0') || id.includes('-') ? '#412402' : '#333'};font-weight:${id.includes('0') || id.includes('-') ? '700' : 'normal'};border:none;cursor:pointer;">${id.includes('0') || id.includes('-') ? '👑 ' : ''}${id}</button>
              `).join('')}
            </div>
            <div style="font-size:11px;color:#E56B6F;font-weight:700;cursor:pointer;" id="unbindAdminBtn">⚠️ 解绑当前身份（测试首次进入流程）</div>
          </div>

          <!-- 活动管理员名单公示 -->
          <div style="background:#FFF;border-radius:20px;padding:18px;margin-bottom:16px;box-shadow:0 4px 14px rgba(0,0,0,0.03);">
            <div style="font-size:14px;font-weight:700;margin-bottom:10px;color:#38242A;">👑 活动管理员团队</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <span style="background:#FFF3CD;color:#633806;border:1px solid #F5C658;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;">👑 lima0001 (LIMA0001)</span>
              <span style="background:#FFF3CD;color:#633806;border:1px solid #F5C658;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;">👑 privacy-by-design</span>
              <span style="background:#FFF3CD;color:#633806;border:1px solid #F5C658;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;">👑 宫师姐 (ADMIN_GONG)</span>
            </div>
          </div>

          <!-- 自定义门类 -->
          <div style="background:#FFF;border-radius:20px;padding:18px;margin-bottom:16px;box-shadow:0 4px 14px rgba(0,0,0,0.03);">
            <div style="font-size:14px;font-weight:700;margin-bottom:10px;color:#38242A;">🏷️ 自定义三大门类名称</div>
            ${categories.map(c => `
              <div style="display:flex;align-items:center;margin-bottom:8px;">
                <span style="font-size:20px;margin-right:8px;">${c.icon}</span>
                <input class="cat-name-input" data-id="${c.id}" value="${c.name}" style="flex:1;height:36px;background:#F7F5F0;border:1px solid #EAE5DB;border-radius:10px;padding:0 10px;font-size:13px;" />
              </div>
            `).join('')}
          </div>

          <!-- 重置所有数据 -->
          <div style="background:#FFF;border-radius:20px;padding:18px;box-shadow:0 4px 14px rgba(0,0,0,0.03);">
            <div style="font-size:14px;font-weight:700;margin-bottom:8px;color:#38242A;">🔄 数据重置</div>
            <button class="paw-btn paw-btn-outline" style="width:100%;height:40px;color:#E56B6F;border-color:#E56B6F;font-size:13px;" id="adminResetBtn">一键重置所有模拟数据</button>
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll('.admin-phase-btn').forEach(btn => {
      btn.onclick = () => {
        Store.state.config.currentPhase = btn.dataset.phase;
        Store.ensureMatches();
        Store.save();
        document.getElementById('simPhaseSelect').value = btn.dataset.phase;
        alert(`阶段已切换至：${phaseNames[btn.dataset.phase]}`);
        this.renderAdmin(container);
      };
    });

    document.querySelectorAll('.small-switch-btn').forEach(btn => {
      btn.onclick = () => {
        Store.state.currentUserLdap = btn.dataset.id;
        Store.save();
        document.getElementById('simUserSelect').value = btn.dataset.id;
        alert(`已切换身份为: ${btn.dataset.id}`);
        this.renderAdmin(container);
      };
    });

    document.getElementById('unbindAdminBtn').onclick = () => {
      Store.state.currentUserLdap = '';
      Store.save();
      document.getElementById('simUserSelect').value = 'UNBOUND';
      alert('已解绑当前身份！现在进入任何功能都将引导至身份验证页。');
      this.renderAdmin(container);
    };

    document.querySelectorAll('.cat-name-input').forEach(input => {
      input.onchange = (e) => {
        const cat = categories.find(c => c.id === input.dataset.id);
        if (cat) cat.name = e.target.value.trim();
        Store.save();
      };
    });

    document.getElementById('adminResetBtn').onclick = () => {
      if (confirm('确认恢复初始数据？')) {
        Store.reset();
        document.getElementById('simPhaseSelect').value = Store.state.config.currentPhase;
        document.getElementById('simUserSelect').value = Store.state.currentUserLdap;
        alert('数据已重置！');
        this.renderAdmin(container);
      }
    };

    document.getElementById('adminBackBtn').onclick = () => this.navigate('index');
  }
};

window.addEventListener('DOMContentLoaded', () => {
  Router.init();
});
