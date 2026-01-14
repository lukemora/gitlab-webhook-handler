import { logger } from '../utils/logger.js';
import { clientManager } from './clientManager.js';

/**
 * 向浏览器插件客户端发送通知
 */
export const notifyBrowserClients = async (webhookData, eventInfo) => {
  try {
    // 构建通知消息
    const notification = {
      type: 'webhook',
      eventType: eventInfo.eventType,
      project: eventInfo.project,
      branch: eventInfo.branch,
      user: eventInfo.user,
      timestamp: eventInfo.timestamp,
      data: {
        // 根据事件类型添加特定数据
        ...(eventInfo.eventType === 'Push Hook' && {
          commits: webhookData.commits?.length || 0,
          commitMessages: webhookData.commits?.map(c => c.message).slice(0, 3) || [],
        }),
        ...(eventInfo.eventType === 'Merge Request Hook' && {
          action: webhookData.object_attributes?.action,
          title: webhookData.object_attributes?.title,
          sourceBranch: webhookData.object_attributes?.source_branch,
          targetBranch: webhookData.object_attributes?.target_branch,
          url: webhookData.object_attributes?.url,
          webUrl: webhookData.object_attributes?.web_url,
        }),
        ...(eventInfo.eventType === 'Pipeline Hook' && {
          status: webhookData.object_attributes?.status,
          stage: webhookData.object_attributes?.stage,
          ref: webhookData.object_attributes?.ref,
        }),
        test:'123123'
      },
      raw: webhookData,
    };

    // 确定目标用户
    // 这里可以根据项目、分支、用户等规则来确定应该通知哪些用户
    const targetUsers = determineTargetUsers(webhookData, eventInfo);

    if (targetUsers.length === 0) {
      logger.info('没有目标用户，跳过浏览器通知');
      return { success: false, reason: 'no_target_users' };
    }

    // 发送给目标用户
    const sentCount = clientManager.broadcastToClients(targetUsers, notification);

    if (sentCount > 0) {
      logger.info('浏览器通知已发送', {
        eventType: eventInfo.eventType,
        targetUsers,
        sentCount,
      });
      return { success: true, sentCount, targetUsers };
    } else {
      logger.warn('浏览器通知发送失败：目标用户未连接', { targetUsers });
      return { success: false, reason: 'clients_not_connected', targetUsers };
    }
  } catch (error) {
    logger.error('发送浏览器通知失败', error);
    return { success: false, error: error.message };
  }
};

/**
 * 确定应该通知的目标用户
 * 可以根据实际需求扩展此逻辑
 */
function determineTargetUsers(webhookData, eventInfo) {
  const targetUsers = [];

  // 方式1: 如果webhook数据中指定了目标用户
  if (webhookData.targetUsers && Array.isArray(webhookData.targetUsers)) {
    targetUsers.push(...webhookData.targetUsers);
  }

  // 方式2: 根据项目配置（可以从配置文件或数据库读取）
  // 这里示例：如果项目名包含特定前缀，通知特定用户
  const project = eventInfo.project;
  if (project) {
    // 示例规则：可以根据项目名匹配用户
    // 实际使用时，可以从配置文件或数据库读取映射关系
  }

  // 方式3: 根据事件类型和用户
  // 例如：合并请求事件，通知项目维护者
  if (eventInfo.eventType === 'Merge Request Hook') {
    // 可以添加特定逻辑
  }

  // 方式4: 如果没有特定规则，返回所有已注册的用户（用于测试）
  // 实际使用时，应该根据业务逻辑确定目标用户
  if (targetUsers.length === 0) {
    // 获取所有已注册的用户ID（仅用于开发测试）
    const allClients = clientManager.getClientList();
    targetUsers.push(...allClients.map(c => c.userId));
  }

  // 去重
  return [...new Set(targetUsers)];
}
