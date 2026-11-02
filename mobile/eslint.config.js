// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    rules: {
      // Quy tắc của HTML; chữ trong React Native không cần đổi dấu " thành &quot;
      'react/no-unescaped-entities': 'off',
    },
  },
]);
