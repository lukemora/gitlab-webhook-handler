import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 读取 package.json 获取版本号
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

/**
 * 查找 Chrome 可执行文件路径
 */
function findChromePath() {
	const possiblePaths = [
		// Windows 常见路径
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
		process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
		// macOS 路径
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		// Linux 路径
		'/usr/bin/google-chrome',
		'/usr/bin/chromium-browser',
		'/usr/bin/chromium',
	];

	for (const path of possiblePaths) {
		if (existsSync(path)) {
			return path;
		}
	}
	return null;
}

async function packageExtension() {
	try {
		const extensionDir = './dist/browser-extension';
		const keyFile = './dist/extension-key.pem';
		const crxFile = `./dist/gitlab-webhook-extension-v${pkg.version}.crx`;

		// 检查扩展程序目录是否存在
		if (!existsSync(extensionDir)) {
			console.error('❌ 错误: 扩展程序目录不存在');
			console.log('   请先运行: npm run build:extension');
			process.exit(1);
		}

		// 查找 Chrome 路径
		const chromePath = findChromePath();
		if (!chromePath) {
			console.error('❌ 错误: 未找到 Chrome 浏览器');
			console.log('\n请手动打包扩展程序:');
			console.log('  1. 在 Chrome 中打开 chrome://extensions/');
			console.log('  2. 开启"开发者模式"');
			console.log('  3. 点击"打包扩展程序"');
			console.log(`  4. 扩展程序根目录: ${extensionDir}`);
			console.log('  5. 私钥文件（首次留空，会自动生成）');
			console.log(`  6. 输出文件将保存为: ${crxFile}`);
			process.exit(1);
		}

		console.log('📦 开始打包扩展程序为 .crx 文件...');
		console.log(`  Chrome 路径: ${chromePath}`);
		console.log(`  扩展程序目录: ${extensionDir}`);
		console.log(`  输出文件: ${crxFile}`);

		// 构建 Chrome 打包命令
		const extensionPath = join(process.cwd(), extensionDir).replace(/\\/g, '/');
		const keyFileArg = existsSync(keyFile)
			? `--pack-extension-key="${join(process.cwd(), keyFile).replace(/\\/g, '/')}"`
			: '';
		const command = `"${chromePath}" --pack-extension="${extensionPath}" ${keyFileArg}`;

		console.log('\n⏳ 正在打包...');
		console.log(`  执行命令: ${command.replace(chromePath, 'chrome')}`);

		try {
			const { stdout, stderr } = await execAsync(command, {
				maxBuffer: 10 * 1024 * 1024, // 10MB buffer
			});

			if (stdout) {
				console.log(stdout);
			}

			// Chrome 打包命令可能会输出到 stderr，但实际成功了
			if (
				stderr &&
				!stderr.includes('Extension packaged successfully') &&
				!stderr.includes('Created')
			) {
				// 某些情况下 stderr 可能包含成功信息
				if (!stderr.toLowerCase().includes('success')) {
					console.warn('⚠️  警告:', stderr);
				}
			}
		} catch (error) {
			// 即使有错误，也可能成功创建了文件，继续检查
			if (error.stderr && !error.stderr.includes('Extension packaged successfully')) {
				console.warn('⚠️  命令执行警告:', error.stderr);
			}
		}

		// 检查生成的 .crx 文件
		const expectedCrxPath = join(process.cwd(), extensionDir + '.crx');
		const expectedPemPath = join(process.cwd(), extensionDir + '.pem');

		if (existsSync(expectedCrxPath)) {
			// 重命名文件
			const { renameSync } = await import('fs');
			renameSync(expectedCrxPath, join(process.cwd(), crxFile));
			console.log(`\n✅ .crx 文件已创建: ${crxFile}`);
		} else {
			console.log('\n⚠️  未找到生成的 .crx 文件');
			console.log('   可能的原因:');
			console.log('   1. Chrome 打包命令执行失败');
			console.log('   2. 文件被创建在其他位置');
			console.log('\n请手动打包扩展程序（见上方说明）');
		}

		if (existsSync(expectedPemPath)) {
			const { renameSync } = await import('fs');
			renameSync(expectedPemPath, join(process.cwd(), keyFile));
			console.log(`✅ 私钥文件已保存: ${keyFile}`);
			console.log('   请妥善保管此私钥文件，用于后续更新扩展程序');
		}

		console.log('\n📝 安装 .crx 文件:');
		console.log('  1. 双击 .crx 文件，或在 Chrome 中拖拽安装');
		console.log('  2. 确认安装提示');
		console.log('  注意：.crx 文件安装后不会显示"未打包"标签');
	} catch (error) {
		console.error('❌ 打包失败:', error.message);
		console.log('\n请尝试手动打包:');
		console.log('  1. 在 Chrome 中打开 chrome://extensions/');
		console.log('  2. 开启"开发者模式"');
		console.log('  3. 点击"打包扩展程序"');
		process.exit(1);
	}
}

packageExtension();
