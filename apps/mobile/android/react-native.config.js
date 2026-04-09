const path = require('path');

module.exports = {
  project: {
    android: {
      sourceDir: path.join(__dirname, 'android'),
    },
  },
  dependency: {
    platforms: {
      android: {
        sourceDir: path.join(__dirname, 'android'),
      },
    },
  },
};
