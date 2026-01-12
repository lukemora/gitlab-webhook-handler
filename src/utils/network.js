import { networkInterfaces } from 'os';

/**
 * 获取本机 IP 地址
 * 返回找到的第一个非内部 IPv4 地址
 */
export const getLocalIP = () => {
  const interfaces = networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // 跳过内部（回环）和非 IPv4 地址
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  // 如果未找到外部 IP，则回退到 localhost
  return '127.0.0.1';
};
