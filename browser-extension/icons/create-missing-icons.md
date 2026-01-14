# 创建缺失的图标文件

如果您想要使用正确尺寸的图标，可以按照以下方法创建：

## 方法1：使用在线工具（推荐）

1. 访问 https://www.favicon-generator.org/
2. 上传您现有的图标（如 icon96.png）
3. 下载生成的图标包
4. 将以下文件复制到 `icons/` 目录：
   - `favicon-16x16.png` → `icon16.png`（如果已存在可跳过）
   - `favicon-32x32.png` → `icon32.png`（如果已存在可跳过）
   - 将 `favicon-32x32.png` 放大为 48x48 → `icon48.png`
   - `favicon-96x96.png` → `icon96.png`（如果已存在可跳过）
   - 将 `favicon-96x96.png` 放大为 128x128 → `icon128.png`
