# GitLab Webhook Handler

一个用于接收和处理 GitLab webhook 的 Node.js 服务。

## 功能特性

- ✅ 接收 GitLab 触发的 webhook 请求
- ✅ 支持多种 GitLab 事件类型（Push、Merge Request、Issue、Pipeline 等）
- ✅ 可选的 webhook 安全验证（Secret Token）
- ✅ 结构化日志记录
- ✅ 易于扩展的通知机制（预留微信服务号/H5 等接口）

## 快速开始

### 安装依赖

```bash
npm install
```

### 打包成可执行文件（用于 CentOS 7 服务器）

项目支持打包成 Linux 可执行文件，方便在服务器上直接运行，无需安装 Node.js 环境。

#### 1. 安装打包依赖

```bash
npm install
```

#### 2. 执行打包

```bash
npm run build:exe
```

打包完成后，会在 `dist` 目录下生成 `gitlab-webhook-handler` 可执行文件。

#### 3. 部署到服务器

将生成的可执行文件上传到 CentOS 7 服务器：

```bash
# 上传文件到服务器
scp dist/gitlab-webhook-handler user@your-server:/path/to/deploy/

# 在服务器上设置执行权限
chmod +x /path/to/deploy/gitlab-webhook-handler

# 运行可执行文件
/path/to/deploy/gitlab-webhook-handler
```

#### 4. 配置环境变量

可执行文件仍然需要环境变量配置。你可以：

- 在运行前设置环境变量：
  ```bash
  export PORT=33333
  export WEBHOOK_SECRET_TOKEN=your-secret-token
  ./gitlab-webhook-handler
  ```

- 或者创建 `.env` 文件（需要将 `env.example` 也上传到服务器）：
  ```bash
  cp env.example .env
  # 编辑 .env 文件
  ./gitlab-webhook-handler
  ```

#### 5. 使用 systemd 管理服务（可选）

创建 systemd 服务文件 `/etc/systemd/system/gitlab-webhook-handler.service`：

```ini
[Unit]
Description=GitLab Webhook Handler
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/deploy
ExecStart=/path/to/deploy/gitlab-webhook-handler
Restart=always
RestartSec=10
Environment="PORT=33333"
Environment="WEBHOOK_SECRET_TOKEN=your-secret-token"

[Install]
WantedBy=multi-user.target
```

然后启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable gitlab-webhook-handler
sudo systemctl start gitlab-webhook-handler
sudo systemctl status gitlab-webhook-handler
```

### 配置环境变量

创建 `.env` 文件（参考 `.env.example`）：

```env
PORT=33333
# HOST: 如果不设置，将自动使用本机 IP 地址
# HOST=0.0.0.0
WEBHOOK_SECRET_TOKEN=your-secret-token-here
LOG_LEVEL=info
```

### 启动服务

```bash
# 生产环境
npm start

# 开发环境（自动重启）
npm run dev
```

服务启动后，会在控制台显示 webhook URL。

## GitLab Webhook 配置

### Webhook URL

启动服务后，GitLab webhook 应该配置的 URL 为：

```
http://your-server-ip:33333/webhook/gitlab
```

或者如果服务部署在本地开发环境：

```
http://localhost:33333/webhook/gitlab
```

如果使用内网穿透工具（如 ngrok），URL 格式为：

```
https://your-ngrok-domain.ngrok.io/webhook/gitlab
```

### 在 GitLab 中配置 Webhook

1. 进入你的 GitLab 项目
2. 导航到 **Settings** → **Webhooks**
3. 填写以下信息：
   - **URL**: `http://your-server-ip:33333/webhook/gitlab`
   - **Secret token** (可选): 如果设置了 `WEBHOOK_SECRET_TOKEN` 环境变量，在这里填写相同的值
   - **Trigger**: 选择需要触发的事件类型
     - Push events
     - Merge request events
     - Issues events
     - Pipeline events
     - 等等...
4. 点击 **Add webhook**

### 测试 Webhook

配置完成后，可以点击 **Test** 按钮测试 webhook，或者执行相应的 Git 操作（如 push 代码）来触发 webhook。

## 项目结构

```
gitlab-webhook-handler/
├── src/
│   ├── index.js                 # 主服务器入口
│   ├── handlers/
│   │   └── webhookHandler.js    # Webhook 请求处理器
│   ├── services/
│   │   └── webhookProcessor.js  # Webhook 业务逻辑处理
│   └── utils/
│       └── logger.js            # 日志工具
├── .env                         # 环境变量（需要创建）
├── .gitignore
├── package.json
└── README.md
```

## 支持的事件类型

当前支持以下 GitLab webhook 事件：

- **Push Hook**: 代码推送事件
- **Merge Request Hook**: 合并请求事件
- **Issue Hook**: Issue 事件
- **Pipeline Hook**: CI/CD 流水线事件
- **其他事件**: 通用处理

## 扩展开发

### 添加通知功能

在 `src/services/webhookProcessor.js` 中的各个事件处理函数里，可以添加通知逻辑：

```javascript
// 示例：发送微信服务号通知
const handlePushEvent = async (webhookData, eventInfo) => {
  // 处理逻辑...
  
  // 发送微信通知
  await sendWeChatNotification({
    title: '代码推送通知',
    content: `${eventInfo.user} 推送了代码到 ${eventInfo.branch}`,
    recipients: ['user1', 'user2'],
  });
};
```

### 添加其他服务集成

可以创建新的服务模块，例如：

- `src/services/wechatService.js` - 微信服务号集成
- `src/services/notificationService.js` - 统一通知服务
- `src/services/databaseService.js` - 数据存储服务

## API 端点

### POST /webhook/gitlab

接收 GitLab webhook 请求。

**请求头**:
- `X-Gitlab-Event`: 事件类型
- `X-Gitlab-Token`: 安全令牌（如果配置了）

**响应**:
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "timestamp": "2024-01-08T10:00:00.000Z"
}
```

### GET /health

健康检查端点。

**响应**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-08T10:00:00.000Z"
}
```

## 日志

服务会记录以下信息：

- Webhook 接收日志
- 事件处理日志
- 错误日志

日志级别可通过 `LOG_LEVEL` 环境变量配置：
- `ERROR`: 仅错误
- `WARN`: 警告及以上
- `INFO`: 信息及以上（默认）
- `DEBUG`: 所有日志

## 安全建议

1. **使用 Secret Token**: 在 GitLab 和服务器中都配置相同的 Secret Token
2. **使用 HTTPS**: 生产环境建议使用 HTTPS
3. **防火墙配置**: 只允许 GitLab IP 访问 webhook 端点
4. **环境变量**: 不要将敏感信息提交到代码仓库

## 许可证

MIT
