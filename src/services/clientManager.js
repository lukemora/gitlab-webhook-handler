import { logger } from '../utils/logger.js';

/**
 * 客户端管理器
 * 管理已连接的浏览器插件客户端
 */
class ClientManager {
  constructor() {
    // 存储客户端连接：userId -> Set<Response>
    this.clients = new Map();
    // 存储客户端信息：userId -> { userName, connectedAt, userAgent }
    this.clientInfo = new Map();
  }

  /**
   * 注册客户端
   */
  registerClient(userId, userName, userAgent) {
    if (!userId) {
      throw new Error('用户ID不能为空');
    }

    // 存储客户端信息
    this.clientInfo.set(userId, {
      userName: userName || userId,
      userAgent,
      connectedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    });

    logger.info('客户端已注册', { userId, userName });
    return { success: true, userId };
  }

  /**
   * 添加客户端连接（SSE）
   */
  addClientConnection(userId, res) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }

    this.clients.get(userId).add(res);

    // 更新最后活跃时间
    if (this.clientInfo.has(userId)) {
      this.clientInfo.get(userId).lastSeen = new Date().toISOString();
    }

    logger.info('客户端连接已添加', { userId, totalConnections: this.clients.get(userId).size });

    // 当连接关闭时移除
    res.on('close', () => {
      this.removeClientConnection(userId, res);
    });

    // 发送初始连接确认
    this.sendToClient(userId, {
      type: 'connected',
      message: '已连接到服务器',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 移除客户端连接
   */
  removeClientConnection(userId, res) {
    if (this.clients.has(userId)) {
      this.clients.get(userId).delete(res);
      
      // 如果没有连接了，清理
      if (this.clients.get(userId).size === 0) {
        this.clients.delete(userId);
        logger.info('客户端已断开', { userId });
      } else {
        logger.info('客户端连接已移除', { userId, remainingConnections: this.clients.get(userId).size });
      }
    }
  }

  /**
   * 向指定客户端发送消息
   */
  sendToClient(userId, data) {
    if (!this.clients.has(userId) || this.clients.get(userId).size === 0) {
      logger.warn('客户端未连接', { userId });
      return false;
    }

    const message = `data: ${JSON.stringify(data)}\n\n`;
    let sentCount = 0;

    this.clients.get(userId).forEach((res) => {
      try {
        res.write(message);
        sentCount++;
      } catch (error) {
        logger.error('发送消息失败', { userId, error: error.message });
        this.removeClientConnection(userId, res);
      }
    });

    logger.info('消息已发送', { userId, sentCount, totalConnections: this.clients.get(userId).size });
    return sentCount > 0;
  }

  /**
   * 向多个客户端广播消息
   */
  broadcastToClients(userIds, data) {
    if (!Array.isArray(userIds)) {
      userIds = [userIds];
    }

    let successCount = 0;
    userIds.forEach((userId) => {
      if (this.sendToClient(userId, data)) {
        successCount++;
      }
    });

    return successCount;
  }

  /**
   * 向所有客户端广播消息
   */
  broadcastToAll(data) {
    let totalSent = 0;
    this.clients.forEach((connections, userId) => {
      if (this.sendToClient(userId, data)) {
        totalSent++;
      }
    });
    return totalSent;
  }

  /**
   * 获取客户端列表
   */
  getClientList() {
    const list = [];
    this.clientInfo.forEach((info, userId) => {
      const isConnected = this.clients.has(userId) && this.clients.get(userId).size > 0;
      list.push({
        userId,
        ...info,
        isConnected,
        connectionCount: isConnected ? this.clients.get(userId).size : 0,
      });
    });
    return list;
  }

  /**
   * 获取客户端统计信息
   */
  getStats() {
    return {
      totalClients: this.clientInfo.size,
      connectedClients: this.clients.size,
      totalConnections: Array.from(this.clients.values()).reduce((sum, set) => sum + set.size, 0),
    };
  }
}

// 单例模式
export const clientManager = new ClientManager();
