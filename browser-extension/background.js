/**
 * 后台服务脚本
 * 负责与 webhook 服务器通信，接收通知并显示
 */

// 默认配置
const DEFAULT_CONFIG = {
	serverUrl: 'http://localhost:33333',
	userId: '',
	userName: '',
};

// 存储配置
let config = { ...DEFAULT_CONFIG };
let reconnectAttempts = 0;
let reconnectTimer = null;
let eventSource = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3秒

/**
 * 加载配置
 */
async function loadConfig() {
	try {
		const result = await chrome.storage.sync.get(['config']);
		if (result.config) {
			config = { ...DEFAULT_CONFIG, ...result.config };
		}
	} catch (error) {
		console.error('加载配置失败:', error);
	}
}

/**
 * 保存配置
 */
async function saveConfig() {
	try {
		await chrome.storage.sync.set({ config });
	} catch (error) {
		console.error('保存配置失败:', error);
	}
}

/**
 * 连接到 webhook 服务器的事件流
 */
async function connectToServer() {
	if (!config.userId || !config.serverUrl) {
		console.log('配置不完整，无法连接:', {
			userId: config.userId,
			serverUrl: config.serverUrl,
		});
		return;
	}

	// 如果已有连接，先关闭
	if (eventSource) {
		eventSource.close();
		eventSource = null;
	}

	// 确保先注册用户
	await registerUser();

	const url = `${config.serverUrl}/events?userId=${encodeURIComponent(config.userId)}`;
	console.log('正在连接到服务器:', url);

	try {
		eventSource = new EventSource(url);

		eventSource.onopen = () => {
			console.log('已连接到服务器');
			reconnectAttempts = 0;
			updateBadge('', 'green');
		};

		eventSource.onmessage = event => {
			try {
				const data = JSON.parse(event.data);
				handleWebhookEvent(data);
			} catch (error) {
				console.error('解析事件数据失败:', error);
			}
		};

		eventSource.onerror = error => {
			console.error('EventSource 连接错误:', error);
			updateBadge('!', 'red');
			// 只有在连接状态不是 CONNECTING 时才重连
			if (eventSource && eventSource.readyState === EventSource.CLOSED) {
				handleReconnect();
			}
		};

		// 监听自定义事件类型
		eventSource.addEventListener('webhook', event => {
			try {
				const data = JSON.parse(event.data);
				handleWebhookEvent(data);
			} catch (error) {
				console.error('处理 webhook 事件失败:', error);
			}
		});
	} catch (error) {
		console.error('连接服务器失败:', error);
		updateBadge('!', 'red');
		handleReconnect();
	}
}

/**
 * 处理 webhook 事件
 */
function handleWebhookEvent(data) {
	// 检查是否是连接事件
	if (data.type === 'connected') {
		// 连接事件转换为专门的通知类型
		showNotification({
			eventType: 'Connection Event',
			project: '系统',
			message: data.message || '已连接到服务器',
			serverUrl: config.serverUrl,
			timestamp: data.timestamp || new Date().toISOString(),
		});
		return;
	}

	// 检查是否应该通知此用户
	if (!shouldNotifyUser(data)) {
		return;
	}

	// 显示通知
	showNotification(data);

	// 存储事件历史
	storeEvent(data);
}

/**
 * 判断是否应该通知当前用户
 */
function shouldNotifyUser(data) {
	// 如果事件中指定了目标用户，检查是否匹配
	if (data.targetUsers && Array.isArray(data.targetUsers)) {
		return (
			data.targetUsers.includes(config.userId) || data.targetUsers.includes(config.userName)
		);
	}

	// 如果事件中指定了项目，检查用户是否关注该项目
	// 这里可以根据实际需求扩展匹配逻辑
	const project = data.project || data.repository?.name;
	if (project && config.watchedProjects) {
		return config.watchedProjects.includes(project);
	}

	// 默认：如果配置了用户ID，则接收所有事件
	return !!config.userId;
}

/**
 * 检查通知权限
 */
async function checkNotificationPermission() {
	if (!chrome.notifications) {
		return false;
	}

	try {
		const permission = await chrome.notifications.getPermissionLevel();
		return permission !== 'denied';
	} catch (error) {
		// 即使出错，也返回 true，尝试创建通知
		return true;
	}
}

/**
 * 构建通知标题
 */
function buildNotificationTitle(data) {
	const eventType = data.eventType || '未知事件';

	// 根据事件类型返回友好的中文标题
	const titleMap = {
		'Merge Request Hook': '合并请求通知',
		'Push Hook': '代码推送通知',
		'Issue Hook': 'Issue 通知',
		'Pipeline Hook': '流水线通知',
		'Tag Push Hook': '标签推送通知',
		'Note Hook': '评论通知',
		'Connection Event': '连接状态通知',
	};

	return titleMap[eventType] || `${eventType} 通知`;
}

/**
 * 构建详细的通知消息
 */
function buildNotificationMessage(data) {
	const messageParts = [];
	const eventType = data.eventType || '未知事件';

	// 连接事件单独处理
	if (eventType === 'Connection Event') {
		messageParts.push(`状态: 已连接`);
		if (data.message) {
			messageParts.push(`消息: ${data.message}`);
		}
		if (data.serverUrl) {
			messageParts.push(`服务器: ${data.serverUrl}`);
		}

		// 时间戳
		const timestamp = data.timestamp || new Date().toISOString();
		try {
			const date = new Date(timestamp);
			const timeStr = date.toLocaleString('zh-CN', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
			});
			messageParts.push(`时间: ${timeStr}`);
		} catch (e) {
			const timeStr = new Date().toLocaleString('zh-CN', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
			});
			messageParts.push(`时间: ${timeStr}`);
		}

		return messageParts.join('\n');
	}

	// 项目信息
	const project = data.project || data.repository?.name || '未知项目';
	messageParts.push(`项目: ${project}`);

	// 获取原始 webhook 数据（如果存在）
	const rawData = data.raw || {};
	const eventData = data.data || {};

	// 根据事件类型添加特定信息
	if (eventType === 'Merge Request Hook') {
		const objectAttrs = rawData.object_attributes || {};

		// 操作类型
		const action = eventData.action || objectAttrs.action || '未知操作';
		const actionMap = {
			open: '🆕 新建',
			update: '🔄 更新',
			merge: '✅ 合并',
			close: '❌ 关闭',
			reopen: '🔓 重新打开',
		};
		const actionText = actionMap[action] || action;
		messageParts.push(`操作: ${actionText}`);

		// 状态
		const state = objectAttrs.state || eventData.state || '未知';
		messageParts.push(`状态: ${state}`);

		// 标题
		const title = objectAttrs.title || eventData.title || '无标题';
		messageParts.push(`标题: ${title}`);

		// 源分支
		const sourceBranch = objectAttrs.source_branch || eventData.sourceBranch || '-';
		messageParts.push(`源分支: ${sourceBranch}`);

		// 目标分支
		const targetBranch = objectAttrs.target_branch || eventData.targetBranch || '-';
		messageParts.push(`目标分支: ${targetBranch}`);

		// 创建者
		const creator =
			data.user ||
			objectAttrs.author?.name ||
			objectAttrs.author?.username ||
			rawData.user?.name ||
			rawData.user_username ||
			'-';
		messageParts.push(`创建者: ${creator}`);

		// 链接
		const url =
			objectAttrs.web_url ||
			objectAttrs.url ||
			eventData.webUrl ||
			eventData.url ||
			data.url ||
			'#';
		if (url && url !== '#') {
			messageParts.push(`链接: 查看详情`);
		}
	} else if (eventType === 'Push Hook') {
		// 推送事件
		if (data.branch || rawData.ref) {
			messageParts.push(`分支: ${data.branch || rawData.ref}`);
		}
		if (data.user || rawData.user?.name || rawData.user_username) {
			messageParts.push(`用户: ${data.user || rawData.user?.name || rawData.user_username}`);
		}
		const commits = eventData.commits || rawData.commits?.length || 0;
		if (commits > 0) {
			messageParts.push(`提交数: ${commits}`);
		}
	} else if (eventType === 'Pipeline Hook') {
		// 流水线事件
		const objectAttrs = rawData.object_attributes || {};

		const status = objectAttrs.status || eventData.status || '未知';
		messageParts.push(`状态: ${status}`);

		if (objectAttrs.stage || eventData.stage) {
			messageParts.push(`阶段: ${objectAttrs.stage || eventData.stage}`);
		}

		const ref = objectAttrs.ref || eventData.ref || data.branch || rawData.ref || '-';
		if (ref !== '-') {
			messageParts.push(`分支: ${ref}`);
		}

		if (data.user || rawData.user?.name || rawData.user_username) {
			messageParts.push(`用户: ${data.user || rawData.user?.name || rawData.user_username}`);
		}
	} else {
		// 通用事件
		if (data.user || rawData.user?.name || rawData.user_username) {
			messageParts.push(`用户: ${data.user || rawData.user?.name || rawData.user_username}`);
		}
		if (data.branch || rawData.ref) {
			messageParts.push(`分支: ${data.branch || rawData.ref}`);
		}
		if (data.message) {
			messageParts.push(data.message);
		}
	}

	// 时间戳
	const timestamp = data.timestamp || data.receivedAt || new Date().toISOString();
	try {
		const date = new Date(timestamp);
		const timeStr = date.toLocaleString('zh-CN', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
		messageParts.push(`时间: ${timeStr}`);
	} catch (e) {
		// 如果时间解析失败，使用当前时间
		const timeStr = new Date().toLocaleString('zh-CN', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
		messageParts.push(`时间: ${timeStr}`);
	}

	return messageParts.length > 0 ? messageParts.join('\n') : '收到新的 GitLab 事件';
}

/**
 * 显示浏览器通知（桌面弹窗）
 * 这个函数会创建浏览器原生的桌面通知，即使不打开插件弹窗也能看到
 */
async function showNotification(data) {
	// 检查通知API是否可用
	if (!chrome.notifications) {
		return;
	}

	// 构建友好的标题
	const title = buildNotificationTitle(data);

	// 构建详细的通知消息
	const fullMessage = buildNotificationMessage(data);

	// 生成通知ID
	const notificationId = `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

	// 提取 URL（组装正确的 GitLab 完整 URL，避免相对路径）
	const rawData = data.raw || {};
	const objectAttrs = rawData.object_attributes || {};
	const eventData = data.data || {};
	const eventType = data.eventType || '';

	const isAbsoluteUrl = u =>
		typeof u === 'string' && (u.startsWith('http://') || u.startsWith('https://'));

	let url = '#';

	if (eventType === 'Pipeline Hook') {
		// 流水线：优先用服务端下发的完整 webUrl/url，否则用 project.web_url + /-/pipelines/id 拼接
		const candidate =
			eventData.webUrl || eventData.url || objectAttrs.web_url || objectAttrs.url;
		if (isAbsoluteUrl(candidate)) {
			url = candidate;
		} else {
			const projectWebUrl = eventData.projectWebUrl || rawData.project?.web_url;
			const pipelineId = objectAttrs.id || eventData.id;
			if (projectWebUrl && pipelineId) {
				url = `${projectWebUrl.replace(/\/$/, '')}/-/pipelines/${pipelineId}`;
			} else {
				url = isAbsoluteUrl(candidate) ? candidate : '#';
			}
		}
	} else if (objectAttrs.url && objectAttrs.target?.git_http_url) {
		// 合并请求等：从 target.git_http_url 取基址，从 url 取路径
		try {
			const gitHttpUrl = new URL(objectAttrs.target.git_http_url);
			const baseUrl = `${gitHttpUrl.protocol}//${gitHttpUrl.host}`;
			const originalUrl = new URL(objectAttrs.url, baseUrl);
			const path = originalUrl.pathname;
			url = `${baseUrl}${path}`;
		} catch (error) {
			console.warn('URL 组装失败，使用原始 URL:', error);
			url =
				objectAttrs.web_url || objectAttrs.url || eventData.webUrl || eventData.url || '#';
			if (!isAbsoluteUrl(url)) url = '#';
		}
	} else {
		const candidate =
			objectAttrs.web_url || objectAttrs.url || eventData.webUrl || eventData.url;
		url = isAbsoluteUrl(candidate) ? candidate : '#';
	}

	// 保存通知数据，用于点击时打开链接
	const notificationData = {
		url: url,
		timestamp: Date.now(),
	};

	try {
		// 保存通知数据
		const result = await chrome.storage.local.get(['notificationData']);
		const notificationMap = result.notificationData || {};
		notificationMap[notificationId] = notificationData;
		await chrome.storage.local.set({ notificationData: notificationMap });

		// 检查图标是否存在
		let iconUrl = chrome.runtime.getURL('icons/icon48.png');
		try {
			const iconResponse = await fetch(iconUrl, { method: 'HEAD' });
			if (!iconResponse.ok) {
				iconUrl = undefined;
			}
		} catch (error) {
			iconUrl = undefined;
		}

		// 构建通知选项
		const notificationOptions = {
			type: 'basic',
			title: title,
			message: fullMessage.substring(0, 200),
			priority: 2,
		};

		// 只有在图标可用时才添加
		if (iconUrl) {
			notificationOptions.iconUrl = iconUrl;
		}

		// 创建通知（即使在后台运行时也能显示）
		chrome.notifications.create(notificationId, notificationOptions, createdId => {
			if (chrome.runtime.lastError) {
				console.error('创建通知失败:', chrome.runtime.lastError);
				// 如果创建失败且是因为图标问题，尝试不使用图标
				if (notificationOptions.iconUrl) {
					chrome.notifications.create(
						notificationId,
						{
							...notificationOptions,
							iconUrl: undefined,
						},
						retryId => {
							if (chrome.runtime.lastError) {
								console.error('重试创建通知仍然失败:', chrome.runtime.lastError);
							}
						}
					);
				}
			} else {
				console.log('通知已创建:', createdId);
			}
		});

		// 更新徽章
		updateBadge('1', 'blue');
	} catch (error) {
		console.error('显示通知时出错:', error);
	}
}

/**
 * 更新扩展图标徽章
 */
function updateBadge(text, color) {
	chrome.action.setBadgeText({ text });
	chrome.action.setBadgeBackgroundColor({ color });
}

/**
 * 存储事件到本地
 */
async function storeEvent(data) {
	try {
		const result = await chrome.storage.local.get(['events']);
		const events = result.events || [];
		events.unshift({
			...data,
			receivedAt: new Date().toISOString(),
		});

		// 只保留最近100条
		const limitedEvents = events.slice(0, 100);
		await chrome.storage.local.set({ events: limitedEvents });
	} catch (error) {
		console.error('存储事件失败:', error);
	}
}

/**
 * 处理重连
 */
function handleReconnect() {
	// 清除之前的重连定时器
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}

	if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
		console.log('已达到最大重连次数，停止重连');
		updateBadge('X', 'red');
		return;
	}

	reconnectAttempts++;
	const delay = RECONNECT_DELAY * reconnectAttempts;
	console.log(`将在 ${delay}ms 后尝试第 ${reconnectAttempts} 次重连`);

	reconnectTimer = setTimeout(() => {
		if (config.userId && config.serverUrl) {
			connectToServer();
		} else {
			console.log('配置不完整，取消重连');
			reconnectAttempts = 0;
		}
	}, delay);
}

/**
 * 注册用户到服务器
 */
async function registerUser() {
	if (!config.userId || !config.serverUrl) {
		return;
	}

	try {
		const response = await fetch(`${config.serverUrl}/api/clients/register`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				userId: config.userId,
				userName: config.userName,
				userAgent: navigator.userAgent,
				timestamp: new Date().toISOString(),
			}),
		});

		if (!response.ok) {
			console.error('用户注册失败:', response.statusText);
		}
	} catch (error) {
		console.error('注册用户时出错:', error);
	}
}

// 初始化
chrome.runtime.onInstalled.addListener(async () => {
	await loadConfig();
	if (config.userId && config.serverUrl) {
		await registerUser();
		connectToServer();
	}
});

// 启动时连接（包括浏览器后台运行时）
chrome.runtime.onStartup.addListener(async () => {
	await loadConfig();
	if (config.userId && config.serverUrl) {
		await registerUser();
		connectToServer();
	}
});

// 确保在 service worker 重新激活时也能连接
// 在 Manifest V3 中，当 service worker 被唤醒时，检查连接状态
async function ensureConnection() {
	await loadConfig();
	if (config.userId && config.serverUrl) {
		// 如果连接已断开或不存在，重新连接
		if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
			console.log('检测到连接断开，重新连接...');
			await registerUser();
			connectToServer();
		}
	}
}

// 定期检查连接状态（每30秒检查一次，确保后台运行时也能保持连接）
setInterval(() => {
	ensureConnection();
}, 30000);

// 立即检查一次连接
ensureConnection();

// 监听配置变化
chrome.storage.onChanged.addListener(async (changes, areaName) => {
	if (areaName === 'sync' && changes.config) {
		// 先加载最新配置
		await loadConfig();
		if (config.userId && config.serverUrl) {
			// 先注册用户，再连接
			await registerUser();
			// 延迟一下确保注册完成
			setTimeout(() => {
				connectToServer();
			}, 500);
		} else {
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}
			updateBadge('', 'gray');
		}
	}
});

// 监听通知点击事件
chrome.notifications.onClicked.addListener(async notificationId => {
	try {
		const result = await chrome.storage.local.get(['notificationData']);
		const notificationMap = result.notificationData || {};
		const data = notificationMap[notificationId];

		if (data && data.url && data.url !== '#') {
			// 在后台运行时也能打开链接
			// chrome.tabs.create 会自动创建新窗口（如果当前没有窗口）
			try {
				await chrome.tabs.create({ url: data.url });
			} catch (tabError) {
				// 如果 tabs.create 失败（例如没有窗口），尝试使用 windows.create
				try {
					await chrome.windows.create({ url: data.url, focused: true });
				} catch (windowError) {
					console.error('无法打开链接:', windowError);
				}
			}
		}

		// 清理已点击的通知数据
		delete notificationMap[notificationId];
		await chrome.storage.local.set({ notificationData: notificationMap });

		// 关闭通知
		chrome.notifications.clear(notificationId);
	} catch (error) {
		console.error('处理通知点击时出错:', error);
	}
});

// 监听通知关闭事件，清理数据
chrome.notifications.onClosed.addListener(async notificationId => {
	try {
		const result = await chrome.storage.local.get(['notificationData']);
		const notificationMap = result.notificationData || {};
		delete notificationMap[notificationId];
		await chrome.storage.local.set({ notificationData: notificationMap });
	} catch (error) {
		console.error('清理通知数据时出错:', error);
	}
});

// 监听来自 popup 或 options 页面的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'reconnect') {
		// 重置重连计数
		reconnectAttempts = 0;
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		// 重新加载配置并连接
		loadConfig().then(() => {
			connectToServer();
		});
		sendResponse({ success: true });
	} else if (request.action === 'getStatus') {
		// 确保使用最新配置
		loadConfig().then(() => {
			sendResponse({
				connected: eventSource && eventSource.readyState === 1, // EventSource.OPEN = 1
				config: { ...config }, // 返回配置副本
			});
		});
		return true; // 异步响应
	} else if (request.action === 'checkNotificationPermission') {
		checkNotificationPermission().then(hasPermission => {
			sendResponse({ hasPermission });
		});
		return true; // 异步响应
	} else if (request.action === 'testNotification') {
		const testData = request.data || {
			eventType: '测试通知',
			project: 'GitLab Webhook 通知助手',
			user: '系统',
			message: '这是一条测试通知！如果您看到这条桌面弹窗，说明通知功能正常工作。',
		};
		showNotification(testData);
		sendResponse({ success: true });
		return true;
	}
	return true; // 保持消息通道开放
});
