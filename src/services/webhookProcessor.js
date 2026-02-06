import { logger } from '../utils/logger.js';
import { clientManager } from './clientManager.js';
import { notifyWeChatWork } from './wechatWorkNotifier.js';
import { notifyBrowserClients } from './browserNotifier.js';

/** 判断是否为内网/不可访问的 GitLab 地址（如 K8s 内 gitlab-0），需要被插件上报的 base URL 替代 */
function isInternalGitlabUrl(url) {
	if (!url || typeof url !== 'string') return true;
	const u = url.trim();
	return !u || u.includes('gitlab-0');
}

/**
 * 处理 webhook 数据
 * 此函数可以扩展以处理不同的 webhook 事件
 * 并与通知服务（微信、H5 等）集成
 */
export const processWebhook = async (webhookData, headers) => {
	const eventType = headers['x-gitlab-event'] || 'unknown';

	logger.info(`Processing webhook event: ${eventType}`);

	// 提取通用信息（含 GitLab 实例 URL，用于拼接可访问的 web 链接）
	// 先用请求头 X-Gitlab-Instance；若为空或为内网地址（如 gitlab-0），则用插件上报的 gitlabBaseUrl
	const rawInstance = (headers['x-gitlab-instance'] || '').trim().replace(/\/$/, '');
	const fromPlugin = clientManager.getAnyClientGitlabBaseUrl();
	const gitlabInstance = isInternalGitlabUrl(rawInstance) ? (fromPlugin || rawInstance) : rawInstance;

	const eventInfo = {
		eventType,
		project: webhookData.project?.name || webhookData.repository?.name,
		branch: webhookData.ref,
		commit: webhookData.commits?.[0] || webhookData.object_attributes,
		user: webhookData.user?.name || webhookData.user_username,
		timestamp: new Date().toISOString(),
		gitlabInstance,
	};

	// 处理不同的事件类型
	switch (eventType) {
		case 'Push Hook':
			await handlePushEvent(webhookData, eventInfo);
			break;

		case 'Merge Request Hook':
			await handleMergeRequestEvent(webhookData, eventInfo);
			break;

		case 'Issue Hook':
			await handleIssueEvent(webhookData, eventInfo);
			break;

		case 'Pipeline Hook':
			await handlePipelineEvent(webhookData, eventInfo);
			break;

		default:
			logger.info(`Unhandled event type: ${eventType}`);
			await handleGenericEvent(webhookData, eventInfo);
	}

	// 发送企业微信通知
	if (process.env.WECHAT_WORK_WEBHOOK_URL) {
		try {
			await notifyWeChatWork(webhookData, eventInfo);
		} catch (error) {
			logger.error('发送企业微信通知失败', error);
			// 不阻断主流程，即使通知失败也继续
		}
	}

	// 发送浏览器插件通知
	try {
		await notifyBrowserClients(webhookData, eventInfo);
	} catch (error) {
		logger.error('发送浏览器通知失败', error);
		// 不阻断主流程，即使通知失败也继续
	}
};

/**
 * 处理推送事件
 */
const handlePushEvent = async (webhookData, eventInfo) => {
	logger.info('Processing push event', {
		project: eventInfo.project,
		branch: eventInfo.branch,
		commits: webhookData.commits?.length || 0,
		user: eventInfo.user,
	});

	// 可以在这里添加具体的处理逻辑
	// 例如：通知相关人员代码已推送
};

/**
 * 处理合并请求事件
 */
const handleMergeRequestEvent = async (webhookData, eventInfo) => {
	const mrData = webhookData.object_attributes;
	logger.info('Processing merge request event', {
		project: eventInfo.project,
		action: mrData?.action,
		sourceBranch: mrData?.source_branch,
		targetBranch: mrData?.target_branch,
		title: mrData?.title,
		user: eventInfo.user,
	});

	// 可以在这里添加具体的处理逻辑
	// 例如：通知相关人员有新的合并请求
};

/**
 * 处理 Issue 事件
 */
const handleIssueEvent = async (webhookData, eventInfo) => {
	const issueData = webhookData.object_attributes;
	logger.info('Processing issue event', {
		project: eventInfo.project,
		action: issueData?.action,
		title: issueData?.title,
		state: issueData?.state,
		user: eventInfo.user,
	});

	// 可以在这里添加具体的处理逻辑
	// 例如：通知相关人员有新的 issue
};

/**
 * 处理流水线事件
 */
const handlePipelineEvent = async (webhookData, eventInfo) => {
	const pipelineData = webhookData.object_attributes;
	logger.info('Processing pipeline event', {
		project: eventInfo.project,
		branch: pipelineData?.ref,
		status: pipelineData?.status,
		stage: pipelineData?.stage,
		user: eventInfo.user,
	});

	// 可以在这里添加具体的处理逻辑
	// 例如：通知相关人员 CI/CD 状态
};

/**
 * 处理通用/未知事件
 */
const handleGenericEvent = async (webhookData, eventInfo) => {
	logger.info('Processing generic event', eventInfo);

	// 保存原始数据，便于后续分析
	// 可以存储到数据库或文件系统
};
