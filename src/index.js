import express from 'express';
import dotenv from 'dotenv';
import { webhookHandler } from './handlers/webhookHandler.js';
import { logger } from './utils/logger.js';
import { getLocalIP } from './utils/network.js';
import { clientManager } from './services/clientManager.js';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 33333;
// 使用 0.0.0.0 监听（所有网络接口），但获取实际 IP 用于显示
const LISTEN_HOST = process.env.HOST || '0.0.0.0';
const DISPLAY_HOST = process.env.HOST || getLocalIP();

// CORS 中间件 - 允许浏览器插件访问
app.use((req, res, next) => {
	// 设置 CORS 头
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	res.setHeader(
		'Access-Control-Allow-Headers',
		'Content-Type, Authorization, X-Gitlab-Event, X-Gitlab-Token'
	);
	res.setHeader('Access-Control-Expose-Headers', 'Content-Type');

	// 处理 OPTIONS 预检请求
	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	next();
});

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志中间件
app.use((req, res, next) => {
	logger.info(`${req.method} ${req.path}`, {
		ip: req.ip,
		userAgent: req.get('user-agent'),
	});
	next();
});

// 健康检查端点
app.get('/health', (req, res) => {
	res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 客户端注册端点
app.post('/api/clients/register', (req, res) => {
	try {
		const { userId, userName, userAgent } = req.body;
		const result = clientManager.registerClient(userId, userName, userAgent);
		res.json(result);
	} catch (error) {
		logger.error('客户端注册失败', error);
		res.status(400).json({ error: error.message });
	}
});

// SSE 事件流端点（用于浏览器插件连接）
app.get('/events', (req, res) => {
	const userId = req.query.userId;

	if (!userId) {
		return res.status(400).json({ error: 'userId is required' });
	}

	// 设置 SSE 响应头（CORS 已在全局中间件中设置）
	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');

	// 添加客户端连接
	clientManager.addClientConnection(userId, res);

	// 定期发送心跳（保持连接活跃）
	const heartbeatInterval = setInterval(() => {
		try {
			res.write(': heartbeat\n\n');
		} catch (error) {
			clearInterval(heartbeatInterval);
		}
	}, 30000); // 每30秒发送一次心跳

	// 清理函数
	req.on('close', () => {
		clearInterval(heartbeatInterval);
		clientManager.removeClientConnection(userId, res);
	});
});

// 获取客户端列表（管理用）
app.get('/api/clients', (req, res) => {
	res.json({
		clients: clientManager.getClientList(),
		stats: clientManager.getStats(),
	});
});

// GitLab webhook 端点
app.post('/webhook/gitlab', webhookHandler);

// 404 处理器
app.use((req, res) => {
	res.status(404).json({ error: 'Not Found' });
});

// 错误处理器
app.use((err, req, res, next) => {
	logger.error('Unhandled error:', err);
	res.status(500).json({ error: 'Internal Server Error' });
});

// 启动服务器（带错误处理，便于 nohup 时在 nohup.out 中看到失败原因）
const server = app.listen(PORT, LISTEN_HOST, () => {
	logger.info(`Server is running on http://${DISPLAY_HOST}:${PORT}`);
	logger.info(`GitLab webhook URL: http://${DISPLAY_HOST}:${PORT}/webhook/gitlab`);
	logger.info(`Health check URL: http://${DISPLAY_HOST}:${PORT}/health`);
});

server.on('error', err => {
	logger.error('服务器启动失败', { message: err.message, code: err.code });
	process.exit(1);
});

process.on('uncaughtException', err => {
	logger.error('未捕获的异常', { message: err.message, stack: err.stack });
	process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
	logger.error('未处理的 Promise 拒绝', { reason: String(reason) });
	process.exit(1);
});
