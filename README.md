# GitLab Webhook Handler

一个用于接收和处理 GitLab webhook 的 Node.js 服务，支持实时推送通知到浏览器插件和企业微信。

## 功能特性

-   ✅ 接收 GitLab 触发的 webhook 请求
-   ✅ 支持多种 GitLab 事件类型（Push、Merge Request、Issue、Pipeline 等）
-   ✅ 可选的 webhook 安全验证（Secret Token）
-   ✅ 结构化日志记录
-   ✅ **浏览器插件支持** - 实时推送通知到浏览器
-   ✅ **企业微信通知** - 支持企业微信机器人推送
-   ✅ 易于扩展的通知机制（可扩展其他通知渠道）

## 整体工作流程

```
┌─────────────┐
│   GitLab    │
│   项目仓库   │
└──────┬──────┘
       │ 触发事件（Push/MR/Issue/Pipeline等）
       │ POST /webhook/gitlab
       ▼
┌─────────────────────────┐
│  Webhook Handler Server  │
│  (Node.js Express)       │
│                          │
│  1. 接收并验证 webhook    │
│  2. 解析事件类型和数据    │
│  3. 处理业务逻辑          │
│  4. 分发通知              │
└──────┬──────────┬────────┘
       │          │
       │          │
       ▼          ▼
┌─────────────┐  ┌──────────────┐
│ 浏览器插件   │  │  企业微信     │
│ (SSE连接)   │  │  (Webhook)   │
│             │  │              │
│ • 实时通知   │  │ • 群消息推送  │
│ • 原生提醒   │  │              │
└─────────────┘  └──────────────┘
```

### 详细流程说明

1. **GitLab 触发事件**：当 GitLab 项目中发生事件（如代码推送、合并请求、Issue 创建等）时，GitLab 会向配置的 webhook URL 发送 POST 请求。

2. **服务器接收处理**：

    - `webhookHandler.js` 接收并验证请求（可选的安全令牌验证）
    - `webhookProcessor.js` 解析事件类型，提取关键信息（项目名、分支、用户等）
    - 根据事件类型调用相应的处理函数

3. **通知分发**：

    - **浏览器插件通知**：通过 Server-Sent Events (SSE) 实时推送给已连接的浏览器插件客户端
    - **企业微信通知**：通过企业微信机器人 webhook 发送群消息（可选）

4. **客户端接收**：
    - 浏览器插件通过 SSE 长连接接收通知，显示浏览器原生通知
    - 企业微信群收到机器人消息

## 使用方法

### 一、服务器端部署

#### 方式一：直接运行（开发/测试环境）

1. **安装依赖**

    ```bash
    npm install
    ```

2. **配置环境变量**

    创建 `.env` 文件（参考 `env.example`）：

    ```env
    PORT=33333
    # HOST: 如果不设置，将自动使用本机 IP 地址
    # HOST=0.0.0.0
    WEBHOOK_SECRET_TOKEN=your-secret-token-here
    LOG_LEVEL=info
    # 企业微信通知（可选）
    # WECHAT_WORK_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
    ```

3. **启动服务**

    ```bash
    # 生产环境
    npm start

    # 开发环境（自动重启）
    npm run dev
    ```

    服务启动后，控制台会显示：

    ```
    Server is running on http://192.168.1.100:33333
    GitLab webhook URL: http://192.168.1.100:33333/webhook/gitlab
    ```

#### 方式二：打包成可执行文件（生产环境推荐）

适用于 CentOS 等服务器环境，无需安装 Node.js。

1. **打包**

    ```bash
    npm install
    npm run build:exe
    ```

    打包完成后，会在 `dist` 目录下生成 `gitlab-webhook-handler` 可执行文件。

2. **部署到服务器**

    ```bash
    # 上传文件
    scp dist/gitlab-webhook-handler user@your-server:/path/to/deploy/

    # 设置执行权限
    chmod +x /path/to/deploy/gitlab-webhook-handler
    ```

3. **配置环境变量**

    创建 `.env` 文件或使用环境变量：

    ```bash
    export PORT=33333
    export WEBHOOK_SECRET_TOKEN=your-secret-token
    ./gitlab-webhook-handler
    ```

4. **使用 systemd 管理服务（推荐）**

    创建 `/etc/systemd/system/gitlab-webhook-handler.service`：

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

    启动服务：

    ```bash
    sudo systemctl daemon-reload
    sudo systemctl enable gitlab-webhook-handler
    sudo systemctl start gitlab-webhook-handler
    sudo systemctl status gitlab-webhook-handler
    ```

5. **部署故障排查（nohup 启动后 Exit 1 时）**

    若使用 `nohup ./gitlab-webhook-handler &` 启动后进程立即退出（Exit 1），请按下面步骤排查：

    - **查看具体错误**：程序会把错误写入 stderr，被 nohup 重定向到 `nohup.out`。在同一目录执行：
        ```bash
        cat nohup.out
        ```
    - **常见原因**：
        - **端口被占用**：默认 33333。可修改 `.env` 中 `PORT` 或先执行 `lsof -i :33333` / `ss -tlnp | grep 33333` 确认。
        - **无 .env 时**：在可执行文件所在目录（如 `/data`）放置 `.env`，或使用 `export PORT=33333` 等环境变量后再运行。
        - **使用 proxychains 时**：先不用代理直接运行 `./gitlab-webhook-handler`，确认能正常监听后再用 `proxychains`，以排除代理导致的启动失败。

6. **Permission denied（权限被拒绝）**

    若出现 `proxychains: can't load process './gitlab-webhook-handler': Permission denied` 或直接执行 `./gitlab-webhook-handler` 也报权限拒绝，按下面检查：

    - **给可执行文件加执行权限**（上传后常会丢失）：
        ```bash
        chmod +x ./gitlab-webhook-handler
        ```
    - **确认目录未挂载为 noexec**：若可执行文件所在分区挂载时带了 `noexec`，该目录下无法执行任何二进制。检查：
        ```bash
        mount | grep /data
        ```
        若输出含 `noexec`，需用 `mount -o remount,exec /data` 重新挂载（或修改 `/etc/fstab` 后重启），或把程序放到允许执行的目录（如 `/opt`、`/usr/local/bin`）再运行。
    - **SELinux 拦截**（仅限启用 SELinux 的系统）：临时放宽：`setenforce 0`；或为可执行文件设置正确上下文：`chcon -t bin_t ./gitlab-webhook-handler`。

### 二、配置 GitLab Webhook

1. **获取 Webhook URL**

    根据服务器部署情况，webhook URL 格式为：

    - 本地开发：`http://localhost:33333/webhook/gitlab`
    - 服务器部署：`http://your-server-ip:33333/webhook/gitlab`

2. **在 GitLab 中配置**

    - 进入项目 → **Settings** → **Webhooks**
    - 填写 **URL**：`http://your-server-ip:33333/webhook/gitlab`
    - 填写 **Secret token**（如果配置了 `WEBHOOK_SECRET_TOKEN`）
    - 选择触发事件：
        - ✅ Push events
        - ✅ Merge request events
        - ✅ Issues events
        - ✅ Pipeline events
    - 点击 **Add webhook**

3. **测试 Webhook**

    点击 **Test** 按钮或执行 Git 操作（如 push 代码）来触发测试。

### 三、浏览器插件使用（可选）

浏览器插件用于接收实时通知，显示浏览器原生提醒。

1. **加载插件**

    - 打开 Chrome/Edge 浏览器
    - 进入 `chrome://extensions/` 或 `edge://extensions/`
    - 开启"开发者模式"
    - 点击"加载已解压的扩展程序"
    - 选择项目的 `browser-extension` 目录

2. **配置插件**

    - 点击插件图标，打开配置页面
    - 设置服务器地址：`http://your-server-ip:33333`
    - 设置用户 ID 和用户名（用于标识身份）
    - 保存配置

3. **开始接收通知**
    - 插件会自动连接到服务器（通过 SSE）
    - 当 GitLab 事件触发时，浏览器会显示原生通知
    - 可以点击通知查看详细信息

详细说明请查看 [browser-extension/README.md](./browser-extension/README.md)

### 四、企业微信通知（可选）

1. **获取企业微信机器人 Webhook URL**

    - 在企业微信群中添加机器人
    - 获取 webhook URL，格式：`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx`

2. **配置环境变量**

    ```env
    WECHAT_WORK_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
    ```

3. **重启服务**
    - 配置后重启服务，企业微信通知会自动生效

## 核心组件说明

### 服务器端组件

-   **`src/index.js`** - Express 服务器入口，定义路由和中间件
-   **`src/handlers/webhookHandler.js`** - 接收 GitLab webhook 请求，验证并转发
-   **`src/services/webhookProcessor.js`** - 处理不同事件类型，提取关键信息
-   **`src/services/clientManager.js`** - 管理浏览器插件客户端连接（SSE）
-   **`src/services/browserNotifier.js`** - 向浏览器插件发送通知
-   **`src/services/wechatWorkNotifier.js`** - 向企业微信发送通知

### 浏览器插件组件

-   **`browser-extension/background.js`** - 后台脚本，管理 SSE 连接
-   **`browser-extension/popup.js`** - 弹窗界面，显示连接状态
-   **`browser-extension/options.js`** - 配置页面，设置服务器地址和用户信息

## 支持的事件类型

当前支持以下 GitLab webhook 事件：

-   **Push Hook** - 代码推送事件：当代码推送到仓库时触发
-   **Merge Request Hook** - 合并请求事件：当创建、更新、合并 MR 时触发
-   **Issue Hook** - Issue 事件：当创建、更新、关闭 Issue 时触发
-   **Pipeline Hook** - CI/CD 流水线事件：当 Pipeline 状态变化时触发
-   **其他事件** - 通用处理：其他未明确处理的事件类型

每种事件都会提取关键信息（项目名、分支、用户、时间等），并发送给配置的通知渠道。

## 项目结构

```
gitlab-webhook-handler/
├── src/
│   ├── index.js                    # Express 服务器入口
│   ├── handlers/
│   │   └── webhookHandler.js       # Webhook 请求处理器
│   ├── services/
│   │   ├── webhookProcessor.js     # 事件处理和业务逻辑
│   │   ├── browserNotifier.js      # 浏览器插件通知服务
│   │   ├── wechatWorkNotifier.js   # 企业微信通知服务
│   │   └── clientManager.js        # 客户端连接管理（SSE）
│   └── utils/
│       ├── logger.js               # 日志工具
│       └── network.js              # 网络工具
├── browser-extension/              # 浏览器插件
│   ├── manifest.json               # 插件配置文件
│   ├── background.js               # 后台脚本（SSE 连接管理）
│   ├── popup.html/js               # 弹窗界面
│   ├── options.html/js             # 配置页面
│   └── icons/                      # 插件图标
├── .env                            # 环境变量配置（需创建）
├── package.json
└── README.md
```

## 扩展开发

### 添加新的通知渠道

在 `src/services/webhookProcessor.js` 中，可以添加新的通知逻辑：

```javascript
// 示例：添加钉钉通知
import { notifyDingTalk } from './dingTalkNotifier.js';

export const processWebhook = async (webhookData, headers) => {
	// ... 现有处理逻辑 ...

	// 添加钉钉通知
	if (process.env.DINGTALK_WEBHOOK_URL) {
		try {
			await notifyDingTalk(webhookData, eventInfo);
		} catch (error) {
			logger.error('发送钉钉通知失败', error);
		}
	}
};
```

### 自定义事件处理逻辑

在 `webhookProcessor.js` 中的各个事件处理函数里，可以添加自定义逻辑：

```javascript
const handlePushEvent = async (webhookData, eventInfo) => {
	// 自定义处理逻辑
	// 例如：检查特定分支、触发部署、发送特定通知等
};
```

## API 端点

### 核心端点

| 端点                    | 方法 | 说明                | 用途              |
| ----------------------- | ---- | ------------------- | ----------------- |
| `/webhook/gitlab`       | POST | 接收 GitLab webhook | GitLab 配置此 URL |
| `/health`               | GET  | 健康检查            | 服务监控          |
| `/events`               | GET  | SSE 事件流          | 浏览器插件连接    |
| `/api/clients/register` | POST | 注册客户端          | 浏览器插件注册    |
| `/api/clients`          | GET  | 获取客户端列表      | 管理查看          |

**示例：健康检查**

```bash
curl http://localhost:33333/health
# 响应: {"status":"ok","timestamp":"2024-01-08T10:00:00.000Z"}
```

**示例：查看已连接客户端**

```bash
curl http://localhost:33333/api/clients
# 响应: {"clients":[...],"stats":{...}}
```

## 配置说明

### 环境变量

| 变量名                    | 说明                    | 必填 | 默认值                       |
| ------------------------- | ----------------------- | ---- | ---------------------------- |
| `PORT`                    | 服务端口                | 否   | `33333`                      |
| `HOST`                    | 监听地址                | 否   | `0.0.0.0`（自动使用本机 IP） |
| `WEBHOOK_SECRET_TOKEN`    | GitLab webhook 安全令牌 | 否   | 无（不验证）                 |
| `LOG_LEVEL`               | 日志级别                | 否   | `info`                       |
| `WECHAT_WORK_WEBHOOK_URL` | 企业微信机器人 URL      | 否   | 无（不发送）                 |

### 浏览器通知“目标用户”规则（重要）

为避免“配置过插件的人都会收到通知”，服务端会优先从 GitLab webhook 内容中推导本次事件的**相关人**作为目标用户（与插件配置的 `userId` 对应，通常是 GitLab 用户 ID）：

-   **Merge Request Hook**：`reviewer_ids` / `assignee_ids` / `assignee_id` / `author_id`（以及可能存在的 `reviewers` / `assignees` 用户对象）
-   **Issue Hook**：`assignee_ids` / `assignee_id` / `author_id`
-   **其他事件**：优先使用触发者 `user.id` / `user_id` 等字段

当无法推导出任何目标用户时，默认**不发送**浏览器通知。

### 日志级别

-   `ERROR` - 仅错误日志
-   `WARN` - 警告及以上
-   `INFO` - 信息及以上（默认）
-   `DEBUG` - 所有日志

服务会记录：webhook 接收、事件处理、客户端连接、错误等信息。
