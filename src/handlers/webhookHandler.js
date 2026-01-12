import { logger } from '../utils/logger.js';
import { processWebhook } from '../services/webhookProcessor.js';

/**
 * GitLab webhook 处理器
 * 处理来自 GitLab 的 webhook 请求
 */
export const webhookHandler = async (req, res) => {
  try {
    const webhookData = req.body;
    const headers = req.headers;
    
    // 记录接收到的 webhook
    logger.info('GitLab webhook received', {
      eventType: headers['x-gitlab-event'],
      project: webhookData.project?.name || webhookData.repository?.name,
      branch: webhookData.ref,
      user: webhookData.user?.name || webhookData.user_username,
    });

    // 如果配置了 webhook 密钥令牌，则进行验证
    const secretToken = process.env.WEBHOOK_SECRET_TOKEN;
    if (secretToken) {
      const providedToken = headers['x-gitlab-token'];
      if (providedToken !== secretToken) {
        logger.warn('Webhook secret token mismatch');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    // 处理 webhook 数据
    await processWebhook(webhookData, headers);

    // 发送成功响应
    res.status(200).json({ 
      success: true, 
      message: 'Webhook processed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error processing webhook:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
};
