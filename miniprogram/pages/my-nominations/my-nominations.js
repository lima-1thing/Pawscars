const StorageService = require('../../utils/storage');

Page({
  data: {
    userLdap: '',
    entries: []
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const user = StorageService.getUserBinding();
    if (!user) {
      wx.redirectTo({ url: '/pages/auth/auth' });
      return;
    }

    const config = StorageService.getConfig();
    const categories = StorageService.getCategories();
    const rawEntries = StorageService.getMyNominations(user.ldap);

    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    const entries = rawEntries.map(e => {
      const cat = catMap[e.categoryId] || { name: e.categoryId, bg: '#FAC775', textColor: '#412402' };
      
      let phaseStatusTitle = '报名成功';
      let phaseStatusDetail = '等待初选开始';

      if (config.currentPhase === 'vote_initial') {
        phaseStatusTitle = '初选划屏中';
        phaseStatusDetail = `当前已被选中 ${e.initialVotes || 0} 次（初选前8晋级）`;
      } else if (config.currentPhase === 'vote_match_8') {
        phaseStatusTitle = '8进4单败淘汰赛';
        phaseStatusDetail = '已按ID字母配对对决中，静候胜负公布！';
      } else if (config.currentPhase === 'vote_match_4') {
        phaseStatusTitle = '4强巅峰德比';
        phaseStatusDetail = '正处于6场循环赛激烈交锋中！';
      } else if (config.currentPhase === 'awards') {
        const awards = StorageService.getAwardsResult(e.categoryId);
        if (awards.champion && awards.champion.id === e.id) {
          phaseStatusTitle = '荣耀总冠军 🥇';
          phaseStatusDetail = '恭喜荣登最高领奖台！快去生成专属奖状';
        } else if (awards.runnerUp && awards.runnerUp.id === e.id) {
          phaseStatusTitle = '荣誉亚军 🥈';
          phaseStatusDetail = '荣获亚军银牌！表现极为出彩';
        } else if (awards.thirdPlace && awards.thirdPlace.id === e.id) {
          phaseStatusTitle = '荣誉季军 🥉';
          phaseStatusDetail = '荣获季军铜牌！实力非凡';
        } else {
          phaseStatusTitle = '优秀参选毛孩';
          phaseStatusDetail = '感谢全情参与！所有毛孩都是王者';
        }
      }

      return {
        ...e,
        categoryName: cat.name,
        catBg: cat.bg,
        catText: cat.textColor,
        phaseStatusTitle,
        phaseStatusDetail
      };
    });

    this.setData({
      userLdap: user.ldap,
      entries
    });
  },

  onGoNominate() {
    wx.navigateTo({ url: '/pages/nominate/nominate' });
  }
});
