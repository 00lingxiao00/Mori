# 第三方资源与许可

根目录 `LICENSE` 的 MIT 许可适用于 Mori 自行编写的代码。它不改变第三方依赖、主题、字体和其它素材的原有权利与许可。

## 依赖

项目使用 Tauri、Milkdown / ProseMirror、CodeMirror、KaTeX、Lucide 等依赖。JavaScript 与 Rust 依赖版本分别固定在 `package-lock.json` 与 `src-tauri/Cargo.lock`。

依赖包声明的许可与可获得的许可原文汇总在 `THIRD_PARTY_LICENSES.txt`。依赖升级后应重新生成此文件；软件包本身保留的许可声明优先适用。

## 主题与字体

主题资源位于 `public/themes/`，详细来源、适配说明与字体许可见 [主题说明](public/themes/NOTICE.md)。

- Lapis / Lapis Dark：YiNN，MIT 原文保存在 `public/themes/LAPIS-LICENSE`。
- Pixyll 保留其上游 MIT 版权说明；Newsprint 保留公共领域 reset 声明。
- Typora 默认主题上游仓库未声明仓库级统一许可证；这些适配资源不纳入 Mori 的 MIT 重新许可，保留原作者权利、来源和已有声明。
- 字体的 OFL、GUST 等许可保存在 `public/themes/licenses/` 与 `public/themes/gothic/`，不因所在仓库采用 MIT 而改变。

## 图标与截图

应用图标由项目维护者提供，原始素材与处理说明位于 `src-tauri/icons/`。界面截图来自 Mori 的演示文档。Typora 商标及相关权利归原权利人所有；Mori 与 Typora 无隶属关系。
