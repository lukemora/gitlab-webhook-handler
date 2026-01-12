import express from 'express';
import dotenv from 'dotenv';
import { webhookHandler } from './handlers/webhookHandler.js';
import { logger } from './utils/logger.js';
import { getLocalIP } from './utils/network.js';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 33333;
// 使用 0.0.0.0 监听（所有网络接口），但获取实际 IP 用于显示
const LISTEN_HOST = process.env.HOST || '0.0.0.0';
const DISPLAY_HOST = process.env.HOST || getLocalIP();

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

// 启动服务器
app.listen(PORT, LISTEN_HOST, () => {
  logger.info(`Server is running on http://${DISPLAY_HOST}:${PORT}`);
  logger.info(`GitLab webhook URL: http://${DISPLAY_HOST}:${PORT}/webhook/gitlab`);
  logger.info(`Health check URL: http://${DISPLAY_HOST}:${PORT}/health`);
});
