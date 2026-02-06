import { logger } from '../utils/logger.js';
import { clientManager } from './clientManager.js';

/**
 * 用 GitLab 实例 base URL 解析链接（payload 可能为内网地址如 http://gitlab-0 或 gitlab-0/path）
 * 当 payload 为无协议 path（如 gitlab-0/cmgii-cct/...）时，按 path 与 base 拼接
 */
function resolveUrlWithInstance(url, gitlabInstance) {
	if (!url || typeof url !== 'string') return url || '';
	if (!gitlabInstance) return url;
	try {
		// 已是完整 http(s) URL：只保留 path + search + hash，用 base 替换 origin
		if (url.startsWith('http://') || url.startsWith('https://')) {
			const parsed = new URL(url);
			return gitlabInstance + parsed.pathname + parsed.search + parsed.hash;
		}
		// 无协议（如 gitlab-0/cmgii-cct/...）：当作 path 与 base 拼接
		const path = url.startsWith('/') ? url : `/${url}`;
		return gitlabInstance + path;
	} catch {
		return url;
	}
}

/**
 * 向浏览器插件客户端发送通知
 */
export const notifyBrowserClients = async (webhookData, eventInfo) => {
	const { gitlabInstance } = eventInfo || {};

	try {
		// 流水线事件：拼出完整 GitLab URL，优先用 X-Gitlab-Instance 作为 base（webhook 自带）
		const pipelineData =
			eventInfo.eventType === 'Pipeline Hook'
				? (() => {
						const attrs = webhookData.object_attributes || {};
						const rawProjectWebUrl = webhookData.project?.web_url || '';
						const projectWebUrl = resolveUrlWithInstance(
							rawProjectWebUrl,
							gitlabInstance
						);
						const pipelineId = attrs.id;
						let fullPipelineUrl =
							typeof attrs.web_url === 'string' && attrs.web_url.startsWith('http')
								? attrs.web_url
								: projectWebUrl && pipelineId
									? `${projectWebUrl.replace(/\/$/, '')}/-/pipelines/${pipelineId}`
									: attrs.web_url || attrs.url || '';
						fullPipelineUrl = resolveUrlWithInstance(fullPipelineUrl, gitlabInstance);
						return {
							status: attrs.status,
							stage: attrs.stage,
							ref: attrs.ref,
							id: pipelineId,
							url: fullPipelineUrl,
							webUrl: fullPipelineUrl,
							projectWebUrl,
						};
					})()
				: null;

		// 构建通知消息
		const notification = {
			type: 'webhook',
			eventType: eventInfo.eventType,
			project: eventInfo.project,
			branch: eventInfo.branch,
			user: eventInfo.user,
			timestamp: eventInfo.timestamp,
			data: {
				...(eventInfo.eventType === 'Push Hook' && {
					commits: webhookData.commits?.length || 0,
					commitMessages: webhookData.commits?.map(c => c.message).slice(0, 3) || [],
				}),
				...(eventInfo.eventType === 'Merge Request Hook' && {
					action: webhookData.object_attributes?.action,
					title: webhookData.object_attributes?.title,
					sourceBranch: webhookData.object_attributes?.source_branch,
					targetBranch: webhookData.object_attributes?.target_branch,
					url: resolveUrlWithInstance(webhookData.object_attributes?.url, gitlabInstance),
					webUrl: resolveUrlWithInstance(
						webhookData.object_attributes?.web_url,
						gitlabInstance
					),
				}),
				...(pipelineData && { ...pipelineData }),
			},
			raw: webhookData,
		};

		// 确定目标用户
		// 这里可以根据项目、分支、用户等规则来确定应该通知哪些用户
		const targetUsers = determineTargetUsers(webhookData, eventInfo);
		// 同时把目标用户写进消息体，便于客户端侧二次过滤/排查
		notification.targetUsers = targetUsers;

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
	const targetUsers = new Set();

	const addUserId = id => {
		if (id === null || id === undefined) return;
		const str = String(id).trim();
		if (!str) return;
		targetUsers.add(str);
	};

	const addUserIds = ids => {
		if (!Array.isArray(ids)) return;
		ids.forEach(addUserId);
	};

	const addUsersFromObjects = users => {
		if (!Array.isArray(users)) return;
		users.forEach(u => {
			if (!u) return;
			// GitLab webhook 用户对象通常是 { id, username, name, ... }
			addUserId(u.id);
		});
	};

	// 方式1: 如果webhook数据中指定了目标用户
	if (webhookData.targetUsers && Array.isArray(webhookData.targetUsers)) {
		addUserIds(webhookData.targetUsers);
	}

	// 方式2: 基于 GitLab webhook 内容推导“相关人”
	// 目标：避免默认群发；尽量只通知事件参与者（尤其是合并请求/Issue 场景）
	const eventType = eventInfo.eventType;
	const objectAttributes = webhookData.object_attributes || {};

	if (eventType === 'Merge Request Hook') {
		// reviewers / assignees 优先
		addUserIds(objectAttributes.reviewer_ids);
		addUserIds(objectAttributes.assignee_ids);
		addUserId(objectAttributes.assignee_id);
		addUserId(objectAttributes.author_id);
		addUsersFromObjects(webhookData.reviewers);
		addUsersFromObjects(webhookData.assignees);
		addUserId(webhookData.assignee?.id);
	} else if (eventType === 'Issue Hook') {
		addUserIds(objectAttributes.assignee_ids);
		addUserId(objectAttributes.assignee_id);
		addUserId(objectAttributes.author_id);
		addUsersFromObjects(webhookData.assignees);
		addUserId(webhookData.assignee?.id);
	} else {
		// 其他事件：默认只通知触发者（避免所有人都收到）
		addUserId(webhookData.user?.id);
		addUserId(webhookData.user_id);
		addUserId(objectAttributes.user_id);
		addUserId(objectAttributes.author_id);
	}

	return Array.from(targetUsers);
}
