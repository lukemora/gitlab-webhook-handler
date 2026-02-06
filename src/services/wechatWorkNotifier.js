import { logger } from '../utils/logger.js';

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

// 企业微信 webhook 地址（可通过环境变量配置）
const WECHAT_WORK_WEBHOOK_URL = process.env.WECHAT_WORK_WEBHOOK_URL;

/**
 * 发送消息到企业微信 webhook
 * @param {Object} message - 消息对象，格式符合企业微信 API 要求
 * @returns {Promise<Object>} 返回企业微信 API 响应
 */
export const sendToWeChatWork = async message => {
	try {
		const response = await fetch(WECHAT_WORK_WEBHOOK_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(message),
		});

		const result = await response.json();

		if (result.errcode === 0) {
			logger.info('消息已成功发送到企业微信', { msgtype: message.msgtype });
			return { success: true, data: result };
		} else {
			logger.error('企业微信 API 返回错误', {
				errcode: result.errcode,
				errmsg: result.errmsg,
			});
			return { success: false, error: result };
		}
	} catch (error) {
		logger.error('发送消息到企业微信时发生错误', error);
		return { success: false, error: error.message };
	}
};

/**
 * 格式化 GitLab Push 事件为企业微信 markdown 消息
 */
export const formatPushEventMessage = (webhookData, eventInfo) => {
	const commits = webhookData.commits || [];
	const commitCount = commits.length;
	const branch = eventInfo.branch?.replace('refs/heads/', '') || 'unknown';

	let commitList = '';
	if (commits.length > 0) {
		const displayCommits = commits.slice(0, 5); // 最多显示 5 个提交
		commitList = displayCommits
			.map((commit, index) => {
				const shortId = commit.id?.substring(0, 7) || 'unknown';
				const message = commit.message?.split('\n')[0] || 'no message';
				return `${index + 1}. \`${shortId}\` ${message}`;
			})
			.join('\n');

		if (commits.length > 5) {
			commitList += `\n> ... 还有 ${commits.length - 5} 个提交`;
		}
	}

	const content = `## 📦 代码推送通知

**项目：** <font color="info">${eventInfo.project || 'Unknown'}</font>
**分支：** <font color="comment">${branch}</font>
**提交者：** ${eventInfo.user || 'Unknown'}
**提交数量：** <font color="warning">${commitCount}</font>

### 提交列表
${commitList || '无提交信息'}

---
<font color="comment">时间：${new Date().toLocaleString('zh-CN')}</font>`;

	return {
		msgtype: 'markdown',
		markdown: {
			content,
		},
	};
};

/**
 * 格式化 GitLab Merge Request 事件为企业微信 markdown 消息
 */
export const formatMergeRequestMessage = (webhookData, eventInfo) => {
	const mrData = webhookData.object_attributes || {};
	const action = mrData.action || 'unknown';
	const actionText =
		{
			open: '🆕 新建',
			close: '❌ 关闭',
			merge: '✅ 合并',
			reopen: '🔄 重新打开',
			update: '📝 更新',
		}[action] || action;

	const statusColor =
		{
			opened: 'info',
			closed: 'comment',
			merged: 'warning',
		}[mrData.state] || 'comment';

	const content = `## 🔀 合并请求通知

**项目：** <font color="info">${eventInfo.project || 'Unknown'}</font>
**操作：** ${actionText}
**状态：** <font color="${statusColor}">${mrData.state || 'unknown'}</font>

**标题：** ${mrData.title || '无标题'}

**源分支：** <font color="comment">${mrData.source_branch || 'unknown'}</font>
**目标分支：** <font color="comment">${mrData.target_branch || 'unknown'}</font>

**创建者：** ${eventInfo.user || 'Unknown'}

${mrData.description ? `**描述：**\n> ${mrData.description.substring(0, 200)}${mrData.description.length > 200 ? '...' : ''}` : ''}

${mrData.url ? `**链接：** [查看详情](${resolveUrlWithInstance(mrData.url, eventInfo.gitlabInstance)})` : ''}

---
<font color="comment">时间：${new Date().toLocaleString('zh-CN')}</font>`;

	return {
		msgtype: 'markdown',
		markdown: {
			content,
		},
	};
};

/**
 * 格式化 GitLab Issue 事件为企业微信 markdown 消息
 */
export const formatIssueMessage = (webhookData, eventInfo) => {
	const issueData = webhookData.object_attributes || {};
	const action = issueData.action || 'unknown';
	const actionText =
		{
			open: '🆕 新建',
			close: '❌ 关闭',
			reopen: '🔄 重新打开',
			update: '📝 更新',
		}[action] || action;

	const stateColor =
		{
			opened: 'warning',
			closed: 'comment',
		}[issueData.state] || 'comment';

	const content = `## 🐛 Issue 通知

**项目：** <font color="info">${eventInfo.project || 'Unknown'}</font>
**操作：** ${actionText}
**状态：** <font color="${stateColor}">${issueData.state || 'unknown'}</font>

**标题：** ${issueData.title || '无标题'}

**创建者：** ${eventInfo.user || 'Unknown'}

${issueData.description ? `**描述：**\n> ${issueData.description.substring(0, 200)}${issueData.description.length > 200 ? '...' : ''}` : ''}

${issueData.url ? `**链接：** [查看详情](${resolveUrlWithInstance(issueData.url, eventInfo.gitlabInstance)})` : ''}

---
<font color="comment">时间：${new Date().toLocaleString('zh-CN')}</font>`;

	return {
		msgtype: 'markdown',
		markdown: {
			content,
		},
	};
};

/**
 * 格式化 GitLab Pipeline 事件为企业微信 markdown 消息
 */
export const formatPipelineMessage = (webhookData, eventInfo) => {
	const pipelineData = webhookData.object_attributes || {};
	const status = pipelineData.status || 'unknown';
	const projectWebUrl = webhookData.project?.web_url || '';
	const pipelineId = pipelineData.id;
	const pipelineUrl =
		typeof pipelineData.web_url === 'string' && pipelineData.web_url.startsWith('http')
			? pipelineData.web_url
			: projectWebUrl && pipelineId
				? `${projectWebUrl.replace(/\/$/, '')}/-/pipelines/${pipelineId}`
				: pipelineData.web_url || pipelineData.url || '';
	const resolvedPipelineUrl = resolveUrlWithInstance(pipelineUrl, eventInfo.gitlabInstance);

	const statusEmoji =
		{
			success: '✅',
			failed: '❌',
			running: '🔄',
			pending: '⏳',
			canceled: '🚫',
			skipped: '⏭️',
		}[status] || '❓';

	const statusColor =
		{
			success: 'info',
			failed: 'warning',
			running: 'comment',
			pending: 'comment',
			canceled: 'comment',
			skipped: 'comment',
		}[status] || 'comment';

	const content = `## 🔄 流水线通知

**项目：** <font color="info">${eventInfo.project || 'Unknown'}</font>
**状态：** ${statusEmoji} <font color="${statusColor}">${status}</font>
**分支：** <font color="comment">${pipelineData.ref || eventInfo.branch || 'unknown'}</font>

**阶段：** ${pipelineData.stage || 'unknown'}

${pipelineData.duration ? `**耗时：** ${pipelineData.duration} 秒` : ''}

**触发者：** ${eventInfo.user || 'Unknown'}

${resolvedPipelineUrl ? `**链接：** [查看详情](${resolvedPipelineUrl})` : ''}

---
<font color="comment">时间：${new Date().toLocaleString('zh-CN')}</font>`;

	return {
		msgtype: 'markdown',
		markdown: {
			content,
		},
	};
};

/**
 * 格式化通用事件为企业微信文本消息
 */
export const formatGenericMessage = (webhookData, eventInfo) => {
	const content = `GitLab Webhook 通知

事件类型：${eventInfo.eventType}
项目：${eventInfo.project || 'Unknown'}
用户：${eventInfo.user || 'Unknown'}
时间：${new Date().toLocaleString('zh-CN')}

详细信息请查看日志。`;

	return {
		msgtype: 'text',
		text: {
			content,
		},
	};
};

/**
 * 根据事件类型格式化并发送消息到企业微信
 */
export const notifyWeChatWork = async (webhookData, eventInfo) => {
	let message;

	switch (eventInfo.eventType) {
		case 'Push Hook':
			message = formatPushEventMessage(webhookData, eventInfo);
			break;

		case 'Merge Request Hook':
			message = formatMergeRequestMessage(webhookData, eventInfo);
			break;

		case 'Issue Hook':
			message = formatIssueMessage(webhookData, eventInfo);
			break;

		case 'Pipeline Hook':
			message = formatPipelineMessage(webhookData, eventInfo);
			break;

		default:
			message = formatGenericMessage(webhookData, eventInfo);
	}

	return await sendToWeChatWork(message);
};
