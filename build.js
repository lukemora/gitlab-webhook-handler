import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

// 读取 package.json 获取版本号
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

async function buildProject() {
  try {
    console.log('📦 开始打包项目...');
    
    // 确保 dist 目录存在
    mkdirSync('dist', { recursive: true });
    
    // 使用 esbuild 打包
    await build({
      entryPoints: ['src/index.js'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: 'dist/bundle.js',
      external: [],
      banner: {
        js: `/* GitLab Webhook Handler v${pkg.version} - Built at ${new Date().toISOString()} */`
      },
      minify: false,
      sourcemap: false,
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    });

    console.log('✅ ESBuild 打包完成！输出文件: dist/bundle.js');
    
    // 创建用于 pkg 的 package.json
    const pkgConfig = {
      name: pkg.name,
      version: pkg.version,
      main: 'bundle.js',
      bin: {
        'gitlab-webhook-handler': 'bundle.js'
      },
      pkg: {
        scripts: ['bundle.js'],
        assets: ['../env.example'],
        // 处理 Express 视图引擎的动态 require 警告
        // 由于项目不使用视图引擎，这些警告可以安全忽略
        patches: []
      }
    };
    
    writeFileSync('dist/package.json', JSON.stringify(pkgConfig, null, 2));
    console.log('✅ 已创建 pkg 配置文件: dist/package.json');
    
    console.log('\n📝 使用以下命令生成 Linux 可执行文件:');
    console.log('  npm run build:exe');
    console.log('\n生成的可执行文件将位于: dist/gitlab-webhook-handler');
  } catch (error) {
    console.error('❌ 打包失败:', error);
    process.exit(1);
  }
}

buildProject();
