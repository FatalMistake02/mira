module.exports = {
  presets: ['module:metro-react-native-babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        alias: {
          '@': './src',
          '@components': './src/components',
          '@features': './src/features',
          '@hooks': './src/hooks',
          '@utils': './src/utils',
          '@themes': './src/themes',
          '@layouts': './src/layouts',
          '@assets': './src/assets',
        },
      },
    ],
  ],
};

module.exports.plugins = [require.resolve('babel-plugin-module-resolver')];
