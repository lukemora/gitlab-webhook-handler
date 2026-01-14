import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, createWriteStream } from 'fs';
import { join } from 'path';

// 读取 package.json 获取版本号
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

/**
 * 递归复制目录
 */
function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 创建 ZIP 压缩包
 */
async function createZip(sourceDir, outputPath) {
  try {
    // 动态导入 archiver，如果未安装则返回 false
    const archiver = (await import('archiver')).default;
    
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // 最高压缩级别
      });

      output.on('close', () => {
        const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
        console.log(`✅ ZIP 压缩包已创建: ${outputPath} (${sizeInMB} MB)`);
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);
      
      // 添加所有文件到压缩包
      archive.directory(sourceDir, false);
      
      archive.finalize();
    });
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      return false; // 表示 archiver 未安装
    }
    throw error;
  }
}

async function buildExtension() {
  try {
    console.log('📦 开始打包浏览器插件...');
    
    const sourceDir = './browser-extension';
    const outputDir = './dist/browser-extension';
    const zipPath = `./dist/gitlab-webhook-extension-v${pkg.version}.zip`;
    
    // 确保输出目录存在
    mkdirSync(outputDir, { recursive: true });
    
    // 需要复制的文件列表
    const filesToCopy = [
      'manifest.json',
      'background.js',
      'config.js',
      'popup.html',
      'popup.js',
      'options.html',
      'options.js'
    ];
    
    // 复制文件
    console.log('📋 复制插件文件...');
    for (const file of filesToCopy) {
      const srcPath = join(sourceDir, file);
      const destPath = join(outputDir, file);
      
      try {
        copyFileSync(srcPath, destPath);
        console.log(`  ✓ ${file}`);
      } catch (error) {
        console.warn(`  ⚠ 跳过 ${file}: ${error.message}`);
      }
    }
    
    // 复制 icons 目录
    console.log('📋 复制图标文件...');
    const iconsSrc = join(sourceDir, 'icons');
    const iconsDest = join(outputDir, 'icons');
    if (statSync(iconsSrc).isDirectory()) {
      copyDir(iconsSrc, iconsDest);
      console.log('  ✓ icons/');
    }
    
    // 更新 manifest.json 中的版本号（如果需要）
    const manifestPath = join(outputDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.version = pkg.version;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  ✓ 已更新 manifest.json 版本号为 v${pkg.version}`);
    
    console.log(`\n✅ 浏览器插件打包完成！输出目录: ${outputDir}`);
    
    // 尝试创建 ZIP 压缩包
    console.log('\n📦 创建 ZIP 压缩包...');
    const zipResult = await createZip(outputDir, zipPath);
    if (zipResult === false) {
      console.log('⚠️  未安装 archiver 包，跳过 ZIP 压缩包创建');
      console.log('   如需创建 ZIP，请运行: npm install --save-dev archiver');
    }
    
    console.log('\n📝 安装说明:');
    console.log('\n【方式一：加载未打包扩展程序（开发模式）】');
    console.log('  1. 在 Chrome 浏览器中打开 chrome://extensions/');
    console.log('  2. 开启右上角的"开发者模式"');
    console.log(`  3. 点击"加载已解压的扩展程序"，选择目录: ${outputDir}`);
    console.log('  注意：这种方式会显示"未打包的扩展程序"，这是正常的开发模式');
    
    console.log('\n【方式二：使用 ZIP 文件（用于发布到 Chrome Web Store）】');
    if (zipResult !== false) {
      console.log(`  1. ZIP 文件已创建: ${zipPath}`);
      console.log('  2. 此 ZIP 文件可用于：');
      console.log('     - 提交到 Chrome Web Store');
      console.log('     - 手动解压后使用方式一安装');
      console.log('  注意：Chrome 不支持直接安装 ZIP 文件，需要先解压');
    } else {
      console.log('  ZIP 文件未创建，请先安装 archiver: npm install --save-dev archiver');
    }
    
    console.log('\n【方式三：生成已打包扩展程序（.crx 文件）】');
    console.log('  要生成真正的"已打包"扩展程序（不显示"未打包"标签），有两种方式：');
    console.log('\n  方式 A - 使用命令行（推荐）:');
    console.log(`    npm run package:extension`);
    console.log('    这会自动使用 Chrome 命令行工具生成 .crx 文件');
    console.log('\n  方式 B - 手动打包:');
    console.log('  1. 在 Chrome 中打开 chrome://extensions/');
    console.log('  2. 开启"开发者模式"');
    console.log('  3. 点击"打包扩展程序"');
    console.log(`  4. 扩展程序根目录选择: ${outputDir}`);
    console.log('  5. 私钥文件（首次打包留空，会自动生成）');
    console.log('  6. 点击"打包扩展程序"生成 .crx 文件');
    console.log('\n  注意：.crx 文件可以双击安装，且不会显示"未打包"标签');
    
    console.log('\n💡 重要提示:');
    console.log('  - "未打包的扩展程序"标签是正常的，表示从本地文件夹加载');
    console.log('  - 只有从 Chrome Web Store 安装或使用 .crx 文件安装才会显示为"已打包"');
    console.log('  - 开发时使用"未打包"模式更方便调试和更新');
    
  } catch (error) {
    console.error('❌ 打包失败:', error);
    process.exit(1);
  }
}

buildExtension();