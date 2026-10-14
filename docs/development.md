# 开发说明

## 环境与运行

在 macOS 上安装 Node.js 22.12+、Rust 稳定版和 Xcode Command Line Tools。以下命令均从项目根目录执行。

```sh
npm ci
npm run tauri -- dev
```

前端预览：

```sh
npm run dev
```

默认地址为 `http://127.0.0.1:5173`。浏览器预览主要用于检查编辑器与布局，原生文件对话框、真实保存和 macOS 菜单需要在桌面应用中验证。

## 项目结构

```text
src/
├── main.ts                编辑器生命周期、文档切换、保存与菜单分发
├── folders.ts             文件夹侧边栏与子目录加载
├── editor-actions.ts      即时编辑与源码格式命令
├── editor-preferences.ts  输入配对等编辑偏好
├── footnotes.ts           脚注排版、编号与导航
├── inline-html.ts         受支持的内联 HTML 标记
├── table-selection.ts     表格文字选区
├── focus.ts               专注模式
├── privacy.ts             窗口遮蔽与跨窗口同步
├── preferences-store.ts   设置默认值、校验与持久化同步
├── preferences.ts         设置界面
└── style.css              主窗口布局与主题适配
src-tauri/
├── src/main.rs            文件读写、摘要校验、草稿与原生命令
├── src/folders.rs         文件夹选择、目录列举与受限文档读取
├── src/menus.rs           macOS 原生菜单
├── src/preferences.rs     设置文件、设置窗口与图片复制
└── tauri.conf.json        窗口、资源、安全策略与打包配置
public/themes/             主题、字体与许可说明
tests/                     Rust 之外的 Playwright 回归脚本与 Markdown 样例
docs/assets/               README 截图与图标
tools/                     图标裁切与 README 截图脚本
```

## 构建

```sh
npm run build
npm run tauri -- build --bundles app
```

应用路径：`src-tauri/target/release/bundle/macos/Mori.app`。

仓库包含 npm 与 Cargo 锁文件。Rust 发布配置保留构建工具的调试元数据，用于兼容当前验证环境中的 Xcode 链接器；无需因此修改系统工具链。

在 Apple Silicon 上构建完成后，可生成带版本号的安装包与源码包：

```sh
python3 tools/package-release.py
```

脚本从 Tauri 配置读取版本，在项目上一级输出 `release-<版本>/Mori.app`、带版本号的 ZIP、最新安装包副本和源码 ZIP，并进行本地签名与归档校验。它不会执行 Apple 公证。

## 测试

Rust 测试不依赖开发服务器：

```sh
cargo test --manifest-path src-tauri/Cargo.toml
```

覆盖原子写入、Unicode、写入失败、外部修改／删除检测、图片冲突与越界链接保护，以及文件夹过滤和文档路径边界。

浏览器测试需要 Python、Google Chrome 和 Playwright。Python 版本需能安装 `tests/requirements.txt` 中固定的 Playwright 版本。先启动 `npm run dev`，再在另一个终端运行：

```sh
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r tests/requirements.txt

npm test
python3 tests/folders.py
python3 tests/outline_layout.py
python3 tests/menu_actions.py
python3 tests/preferences.py
python3 tests/privacy.py
python3 tests/sample_and_selection.py
```

Chrome 脚本使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。开发服务器固定使用 `http://127.0.0.1:5173`；端口占用时会启动失败，请解决端口冲突后重试。

支持 `--webkit` 的脚本可额外检查 WebKit 行为：

```sh
python3 -m playwright install webkit
python3 tests/sample_and_selection.py --webkit
python3 tests/menu_actions.py --webkit
python3 tests/preferences.py --webkit
python3 tests/privacy.py --webkit
```

| 脚本 | 主要覆盖 |
| --- | --- |
| `editor.py` | 空白启动、8 个主题、源码往返、精确导出、恢复与撤销 |
| `folders.py` | 文件夹选择、嵌套目录、文件过滤、未保存确认、切换与撤销隔离 |
| `outline_layout.py` | 8 个主题 × 8 个宽度，大纲导航与即时／源码布局 |
| `sample_and_selection.py` | 完整 Markdown 样例、公式、脚注、文字选择与格式化 |
| `menu_actions.py` | 格式、表格、查找替换、导出与显示操作 |
| `preferences.py` | 设置搜索、跨页面同步、持久化、导入导出与文档保真 |
| `privacy.py` | 手动／自动遮蔽、跨页面状态、唤醒操作与内容保留 |

浏览器测试与 Rust 测试分别验证前端和实际读写逻辑，不能代替全部原生交互验收。自动测试中的远程样例图片使用固定响应，不验证外部图片服务的可用性。

## 更新 README 截图

启动开发服务器、安装上述 Python 依赖并确保 Google Chrome 可用后：

```sh
python3 tools/capture-readme.py
```

脚本创建临时演示文件夹，使用独立浏览器上下文拍摄编辑器、文件树、Night 主题和外观设置，并复制当前应用图标。图片输出到 `docs/assets/`，不读取用户文档，也不修改已安装应用的数据。

截图是浏览器预览，README 中应保留这一说明。原生菜单栏和系统文件对话框不要用浏览器截图代替。

## 许可汇总

更新依赖后，先运行 `npm ci`，再运行：

```sh
python3 tools/generate-third-party-notices.py
```

该脚本从已安装的生产 npm 依赖与 Cargo 元数据汇总第三方许可声明和许可原文，不将它们重新许可为项目 MIT。打包会将项目许可与第三方说明一并放入应用资源。

## 文档与资源约定

- 功能说明以实际实现为准，README 描述当前状态，不累积开发过程记录。
- 截图使用演示文件，保留相对路径，避免写入个人文件名和本机绝对路径。
- 新增或替换主题、字体时，同时更新 `public/themes/NOTICE.md` 和相应许可文件。
- 图标原始素材与裁切说明位于 `src-tauri/icons/`；裁切脚本为 `tools/round-app-icon.swift`。
