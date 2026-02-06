import { logger } from '../utils/logger.js';
import { processWebhook } from '../services/webhookProcessor.js';

/**
 * GitLab webhook 处理器
 * 处理来自 GitLab 的 webhook 请求
 */
export const webhookHandler = async (req, res) => {
	// 确保响应总是被发送
	let responseSent = false;

	const sendResponse = (statusCode, data) => {
		if (!responseSent) {
			responseSent = true;
			res.status(statusCode).json(data);
		}
	};

	try {
		const webhookData = req.body;
		const headers = req.headers;

		// 记录接收到的 webhook
		const eventType = headers['x-gitlab-event'];
		logger.info('GitLab webhook received', {
			eventType,
			project: webhookData.project?.name || webhookData.repository?.name,
			branch: webhookData.ref,
			user: webhookData.user?.name || webhookData.user_username,
		});

		// 流水线事件时打印完整 payload，便于调试
		if (eventType === 'Pipeline Hook') {
			logger.info('Pipeline webhook 原始数据（完整 body）:', webhookData);
		}

		// 如果配置了 webhook 密钥令牌，则进行验证
		const secretToken = process.env.WEBHOOK_SECRET_TOKEN;
		if (secretToken) {
			const providedToken = headers['x-gitlab-token'];
			if (providedToken !== secretToken) {
				logger.warn('Webhook secret token mismatch', {
					provided: providedToken ? '[REDACTED]' : 'missing',
					expected: '[REDACTED]',
				});
				return sendResponse(401, { error: 'Unauthorized' });
			}
		}

		// 处理 webhook 数据（异步处理，不阻塞响应）
		processWebhook(webhookData, headers).catch(error => {
			logger.error('Error in processWebhook (non-blocking):', error);
			// 不阻断响应，因为响应已经发送
		});

		// 立即发送成功响应（不等待异步处理完成）
		sendResponse(200, {
			success: true,
			message: 'Webhook received and processing',
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		logger.error('Error processing webhook:', error);
		sendResponse(500, {
			error: 'Internal Server Error',
			message: error.message,
		});
	}
};
