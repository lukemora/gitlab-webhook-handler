/**
 * 配置页面脚本
 */

// 默认配置
const defaultConfig = {
  serverUrl: 'http://localhost:33333',
  userId: '',
  userName: '',
};

// 加载配置
async function loadConfig() {
  try {
    const result = await chrome.storage.sync.get(['config']);
    const config = result.config || defaultConfig;
    
    document.getElementById('serverUrl').value = config.serverUrl || '';
    document.getElementById('userId').value = config.userId || '';
    document.getElementById('userName').value = config.userName || '';
  } catch (error) {
    console.error('加载配置失败:', error);
    showStatus('加载配置失败', 'error');
  }
}

// 保存配置
async function saveConfig() {
  const config = {
    serverUrl: document.getElementById('serverUrl').value.trim(),
    userId: document.getElementById('userId').value.trim(),
    userName: document.getElementById('userName').value.trim(),
  };

  // 验证必填项
  if (!config.serverUrl || !config.userId) {
    showStatus('请填写服务器地址和用户ID', 'error');
    return;
  }

  try {
    await chrome.storage.sync.set({ config });
    showStatus('配置已保存！插件将自动重新连接', 'success');
    
    // 隐藏连接状态，等待重新连接
    document.getElementById('connectionStatus').style.display = 'none';
    
    // 通知后台脚本重新连接
    chrome.runtime.sendMessage({ action: 'reconnect' });
    
    // 延迟检查连接状态（给连接一些时间）
    setTimeout(() => {
      checkConnectionStatus();
    }, 3000);
  } catch (error) {
    console.error('保存配置失败:', error);
    showStatus('保存配置失败: ' + error.message, 'error');
  }
}

// 测试连接
async function testConnection() {
  const serverUrl = document.getElementById('serverUrl').value.trim();
  const userId = document.getElementById('userId').value.trim();

  if (!serverUrl || !userId) {
    showStatus('请先填写服务器地址和用户ID', 'error');
    return;
  }

  // 隐藏之前的连接状态，避免冲突
  document.getElementById('connectionStatus').style.display = 'none';
  showStatus('正在测试连接...', 'info');

  try {
    // 测试健康检查端点
    const healthResponse = await fetch(`${serverUrl}/health`);
    if (!healthResponse.ok) {
      throw new Error('服务器健康检查失败');
    }

    // 测试注册端点
    const registerResponse = await fetch(`${serverUrl}/api/clients/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        userName: document.getElementById('userName').value.trim(),
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      }),
    });

    if (registerResponse.ok) {
      showStatus('✅ 连接成功！服务器已响应', 'success');
      // 测试成功后，更新连接状态显示
      setTimeout(() => {
        updateConnectionStatus(true, '已连接到服务器');
      }, 1000);
    } else {
      throw new Error('注册失败: ' + registerResponse.statusText);
    }
  } catch (error) {
    console.error('测试连接失败:', error);
    showStatus('❌ 连接失败: ' + error.message, 'error');
    updateConnectionStatus(false, '未连接到服务器');
  }
}

// 检查连接状态
async function checkConnectionStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
    if (response && response.connected) {
      updateConnectionStatus(true, '已连接到服务器');
    } else {
      updateConnectionStatus(false, '未连接到服务器');
    }
  } catch (error) {
    console.error('检查连接状态失败:', error);
    updateConnectionStatus(false, '无法检查连接状态');
  }
}

// 更新连接状态显示
function updateConnectionStatus(connected, text) {
  const statusDiv = document.getElementById('connectionStatus');
  const indicator = statusDiv.querySelector('.status-indicator');
  const textSpan = document.getElementById('connectionText');

  statusDiv.style.display = 'block';
  statusDiv.className = 'connection-status ' + (connected ? 'connected' : 'disconnected');
  indicator.className = 'status-indicator ' + (connected ? 'connected' : 'disconnected');
  textSpan.textContent = text;
}

// 显示状态消息
function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
  statusDiv.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
}

// 事件监听
document.getElementById('configForm').addEventListener('submit', (e) => {
  e.preventDefault();
  saveConfig();
});

document.getElementById('testBtn').addEventListener('click', testConnection);

// 定期检查连接状态（但不要过于频繁，避免与保存/测试操作冲突）
let statusCheckInterval = null;

function startStatusCheck() {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
  }
  statusCheckInterval = setInterval(() => {
    // 只在没有显示临时状态消息时检查
    const statusDiv = document.getElementById('status');
    if (statusDiv.style.display === 'none' || !statusDiv.textContent.includes('正在')) {
      checkConnectionStatus();
    }
  }, 5000);
}

// 启动定期检查
startStatusCheck();

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  checkConnectionStatus();
});
