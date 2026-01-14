/**
 * 共享配置
 * 定义扩展的默认配置
 * 
 * 注意：此文件在 options.html 中通过 script 标签引入
 * background.js 由于是 service worker，无法直接引入，因此需要保持同步
 */

const DEFAULT_CONFIG = {
  serverUrl: 'http://localhost:33333',
  userId: '',
  userName: '',
};
