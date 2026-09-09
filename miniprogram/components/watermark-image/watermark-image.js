const { maskLdap } = require('../../utils/mask');

Component({
  properties: {
    src: {
      type: String,
      value: ''
    },
    petName: {
      type: String,
      value: ''
    },
    ownerLdap: {
      type: String,
      value: '',
      observer(newVal) {
        this.setData({
          maskedLdap: maskLdap(newVal)
        });
      }
    },
    showNameAbove: {
      type: Boolean,
      value: false
    },
    customStyle: {
      type: String,
      value: 'width: 150px; height: 150px;'
    },
    customClass: {
      type: String,
      value: ''
    }
  },

  data: {
    maskedLdap: '***'
  },

  lifetimes: {
    attached() {
      if (this.properties.ownerLdap) {
        this.setData({
          maskedLdap: maskLdap(this.properties.ownerLdap)
        });
      }
    }
  }
});
