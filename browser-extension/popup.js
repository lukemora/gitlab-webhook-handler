/**
 * 弹窗脚本
 */

// 更新状态
async function updateStatus() {
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const infoDiv = document.getElementById('info');

    if (response && response.connected) {
      statusIndicator.className = 'status-indicator connected';
      statusText.textContent = '已连接';
    } else {
      statusIndicator.className = 'status-indicator disconnected';
      statusText.textContent = '未连接';
    }

    if (response && response.config) {
      infoDiv.style.display = 'block';
      // 确保显示正确的配置值
      const userId = response.config.userId || '';
      const serverUrl = response.config.serverUrl || '';
      document.getElementById('userId').textContent = userId || '未设置';
      document.getElementById('serverUrl').textContent = serverUrl || '未设置';
    } else {
      // 如果没有配置，也显示信息区域但显示未设置
      infoDiv.style.display = 'block';
      document.getElementById('userId').textContent = '未设置';
      document.getElementById('serverUrl').textContent = '未设置';
    }
  } catch (error) {
    console.error('获取状态失败:', error);
    document.getElementById('statusIndicator').className = 'status-indicator disconnected';
    document.getElementById('statusText').textContent = '错误';
    // 即使出错也显示信息区域
    const infoDiv = document.getElementById('info');
    infoDiv.style.display = 'block';
    document.getElementById('userId').textContent = '未设置';
    document.getElementById('serverUrl').textContent = '未设置';
  }
}

// 检查通知权限
async function checkNotificationPermission() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkNotificationPermission' });
    const warningDiv = document.getElementById('permissionWarning');
    
    if (response && !response.hasPermission) {
      warningDiv.classList.remove('hidden');
      warningDiv.innerHTML = `
        ⚠️ <strong>通知权限可能被禁用</strong><br>
        <small>点击 <a href="#" id="openNotificationSettings" style="color: #856404; text-decoration: underline;">这里</a> 打开通知设置</small>
      `;
      
      // 添加点击事件
      const settingsLink = document.getElementById('openNotificationSettings');
      if (settingsLink) {
        settingsLink.addEventListener('click', (e) => {
          e.preventDefault();
          chrome.tabs.create({ url: 'chrome://settings/content/notifications' });
        });
      }
    } else {
      warningDiv.classList.add('hidden');
    }
  } catch (error) {
    console.error('检查通知权限失败:', error);
  }
}

// 测试通知
async function testNotification() {
  try {
    const btn = document.getElementById('testNotificationBtn');
    if (!btn) {
      console.error('测试通知按钮不存在');
      return;
    }
    
    const originalText = btn.textContent;
    btn.textContent = '测试中...';
    btn.disabled = true;
    
    const testData = {
      eventType: '测试通知',
      project: 'GitLab Webhook',
      user: '系统',
      message: '这是一条测试通知！如果您看到浏览器桌面弹窗，说明通知功能正常。',
      url: '#'
    };
    
    await chrome.runtime.sendMessage({ 
      action: 'testNotification',
      data: testData
    });
    
    // 恢复按钮
    setTimeout(() => {
      if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }, 1000);
    
  } catch (error) {
    console.error('测试通知失败:', error);
    alert('测试通知失败: ' + error.message);
    const btn = document.getElementById('testNotificationBtn');
    if (btn) {
      btn.disabled = false;
    }
  }
}

// 事件监听
document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('reconnectBtn').addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({ action: 'reconnect' });
    setTimeout(updateStatus, 1000);
  } catch (error) {
    console.error('重连失败:', error);
  }
});

const testNotificationBtn = document.getElementById('testNotificationBtn');
if (testNotificationBtn) {
  testNotificationBtn.addEventListener('click', testNotification);
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  updateStatus();
  checkNotificationPermission();
  
  // 定期更新状态
  setInterval(() => {
    updateStatus();
  }, 2000);
});
