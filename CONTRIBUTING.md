# 参与开发

欢迎通过 Issue 反馈问题，或提交聚焦于一个改动的 Pull Request。开发环境、构建命令与完整测试说明见 [开发文档](docs/development.md)。

## 提交前

1. Fork 仓库，从 `main` 创建工作分支。
2. 保持改动范围清晰，更新受影响的文档与必要的回归测试。
3. 运行 `npm ci`、`npm run build` 和 `cargo test --locked --manifest-path src-tauri/Cargo.toml`。
4. 涉及编辑器、文件切换或布局时，启动开发服务器并运行相应 Playwright 脚本。
5. 在 PR 中说明问题、最终行为和验证结果。界面改动可附演示截图。

不要提交安装包、构建缓存、个人笔记、恢复草稿、凭据或真实用户文件。新增主题、字体和其它素材时，附上来源及适用许可，不要将第三方素材直接改标为项目 MIT。

## 报告问题

请提供 Mori 版本、macOS 版本、机型架构、复现步骤，以及不含隐私信息的最小 Markdown 样例。安全问题请按 [安全说明](SECURITY.md) 私下报告。
