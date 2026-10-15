// Cấu hình Metro mặc định của Expo (tự xử lý monorepo), thêm đuôi .wasm:
// bản web của expo-sqlite cần nạp file wa-sqlite.wasm, thiếu thì build web báo lỗi.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');

module.exports = config;
