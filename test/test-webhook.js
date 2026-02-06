import { req, reqHeader } from './request.js';
import dotenv from 'dotenv';
import http from 'http';

// 加载环境变量
dotenv.config();

/**
 * 本地触发 GitLab webhook 模拟请求
 * 使用 req.js 中的真实请求头和请求体数据
 */
const triggerLocalWebhook = () => {
	return new Promise((resolve, reject) => {
		const PORT = process.env.PORT || 33333;
		const HOST = process.env.HOST || 'localhost';
		const url = `http://${HOST}:${PORT}/webhook/gitlab`;

		console.log('🚀 开始发送模拟 GitLab webhook 请求...');
		console.log(`📍 目标 URL: ${url}`);
		console.log(`📋 事件类型: ${reqHeader['X-Gitlab-Event']}`);
		console.log(`📦 项目名称: ${req.project?.name || req.repository?.name}`);
		console.log('');

		const requestBody = JSON.stringify(req);

		// 准备请求头
		// 如果环境变量中有 WEBHOOK_SECRET_TOKEN，则使用它（覆盖 reqHeader 中的值）
		const headers = {
			...reqHeader,
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(requestBody),
		};

		// 如果配置了环境变量中的 token，使用它
		if (process.env.WEBHOOK_SECRET_TOKEN) {
			headers['X-Gitlab-Token'] = process.env.WEBHOOK_SECRET_TOKEN;
			console.log('🔐 使用环境变量中的 WEBHOOK_SECRET_TOKEN');
		} else if (reqHeader['X-Gitlab-Token'] === '[REDACTED]') {
			console.log(
				'⚠️  警告: X-Gitlab-Token 为 [REDACTED]，如果服务器配置了 WEBHOOK_SECRET_TOKEN，请求可能会失败'
			);
		}
		console.log('');

		const options = {
			hostname: HOST,
			port: PORT,
			path: '/webhook/gitlab',
			method: 'POST',
			headers: headers,
		};

		const httpReq = http.request(options, res => {
			let responseData = '';

			res.on('data', chunk => {
				responseData += chunk;
			});

			res.on('end', () => {
				try {
					const parsedData = JSON.parse(responseData);

					if (res.statusCode === 200) {
						console.log('✅ Webhook 请求成功！');
						console.log('📥 响应数据:', JSON.stringify(parsedData, null, 2));
						resolve(parsedData);
					} else {
						console.error('❌ Webhook 请求失败！');
						console.error(`状态码: ${res.statusCode}`);
						console.error('响应数据:', JSON.stringify(parsedData, null, 2));
						reject(new Error(`请求失败: ${res.statusCode}`));
					}
				} catch (error) {
					console.error('❌ 解析响应数据时出错:', error.message);
					console.error('原始响应:', responseData);
					reject(error);
				}
			});
		});

		httpReq.on('error', error => {
			console.error('❌ 发送请求时出错:');
			console.error(error.message);

			if (error.code === 'ECONNREFUSED') {
				console.error('');
				console.error('💡 提示: 请确保 webhook 服务器正在运行');
				console.error(`   运行命令: npm start 或 npm run dev`);
			} else if (error.code === 'ECONNRESET') {
				console.error('');
				console.error('💡 提示: 连接被服务器重置，可能的原因：');
				console.error('   1. 服务器在处理请求时崩溃');
				console.error('   2. 服务器提前关闭了连接');
				console.error('   3. 请求格式不正确或请求体过大');
				console.error('');
				console.error('   请检查服务器日志以获取更多信息');
				console.error(`   确保服务器正在运行: npm start 或 npm run dev`);
			}

			reject(error);
		});

		// 发送请求体
		httpReq.write(requestBody);
		httpReq.end();
	});
};

// 执行触发
triggerLocalWebhook()
	.then(() => {
		console.log('');
		console.log('✨ 测试完成');
		process.exit(0);
	})
	.catch(error => {
		console.error('');
		console.error('💥 测试失败');
		process.exit(1);
	});
