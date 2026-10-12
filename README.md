# Douban Plus

将豆瓣收藏带进 Obsidian，用卡片、封面架或时间线浏览自己的电影、电视剧、图书、音乐与游戏记录。

[English](README.en.md) · [下载安装包](https://github.com/shanxinxin6-droid/obsidian-douban-plus/releases) · [反馈问题](https://github.com/shanxinxin6-droid/obsidian-douban-plus/issues)

基于 [Wanxp/obsidian-douban](https://github.com/Wanxp/obsidian-douban) 开发，由 **shanxinxin6-droid** 独立维护，采用 GPLv3 许可证。本项目负责增强功能的维护与用户支持。

当前版本 **0.1.0，为测试版**，通过 GitHub Releases、BRAT 和手动安装提供，不在 Obsidian 官方社区插件目录发布。GitHub 源码 ZIP 不是可安装的插件包，请下载 Release 附件。

## 功能

- **本地看板**：电影、电视剧、图书、音乐、游戏、舞台剧与豆瓣日记集中展示。左侧按钮或“打开豆瓣看板”命令在主工作区打开看板。
- **三种布局**：卡片展示收藏信息，封面架紧凑排列，时间线按收藏日期组织，并记住上次选择。
- **搜索与筛选**：本地搜索标题和标签，按类型、状态、评分、年份筛选，支持分组、排序和结果数量统计。
- **豆瓣搜索／导入**：工具栏的地球与放大镜图标打开联网搜索，选择条目后按模板创建笔记。
- **收藏同步**：沿用上游电影、电视剧、图书、音乐、游戏的批量同步，提供进度、取消和结果摘要。
- **自定义模板兼容**：新建整篇笔记时自动补充 `douban_` 属性，模板没有类型或评分字段也能进入看板。
- **正文保护**：已关联笔记再次同步默认刷新插件属性并保留正文；重复关联或无效 YAML 提示处理，不自动覆盖。
- **旧笔记兼容**：原配置导入、属性补全预览、备份与恢复；首次使用 Plus 新导入的笔记通常无需补全。

看板读取本地笔记，浏览和筛选不需要登录。远程封面需要联网，本地封面可以离线显示。时间线展示当前收藏日期，不记录多次观看或状态变更历史。

## 安装

### BRAT 安装与更新

1. 在 Obsidian“设置 → 第三方插件／社区插件”中安装并启用 **BRAT**。
2. 打开 BRAT 设置，选择 **Add a beta plugin**（添加测试插件）。
3. 输入本项目仓库地址：

   ```text
   https://github.com/shanxinxin6-droid/obsidian-douban-plus
   ```

4. 选择可用的发布版本，首个测试版为 `0.1.0`。安装后在 Obsidian 插件列表中启用 **Douban Plus**。
5. 后续通过 BRAT 检查更新；若选择固定版本，需要调整版本选择才能升级。

BRAT 从**已公开的 GitHub Release 附件**安装插件；只有源码或未公开的 Draft Release 时无法安装。界面以所安装的 BRAT 版本为准，参见 [BRAT 官方说明](https://github.com/TfTHacker/obsidian42-brat)。

### 下载插件包手动安装

1. 打开本项目的 [Releases](https://github.com/shanxinxin6-droid/obsidian-douban-plus/releases)，在 **Assets** 中下载 `obsidian-douban-plus-0.1.0.zip`，后续使用对应版本号。
2. 解压，将其中的 `obsidian-douban-plus` 文件夹放入笔记库的插件目录：

   ```text
   你的笔记库/
   └── .obsidian/
       └── plugins/
           └── obsidian-douban-plus/
               ├── main.js
               ├── manifest.json
               ├── styles.css
               ├── LICENSE
               ├── NOTICE
               ├── THIRD_PARTY_NOTICES.txt
               ├── SOURCE.md
               └── INSTALL.md
   ```

3. 重启 Obsidian或重新加载插件列表，在设置中启用 **Douban Plus**。

`.obsidian` 可能是隐藏目录；自定义配置目录时，使用实际目录下的 `plugins`。**Obsidian 不直接导入 ZIP，需要先解压。** 也可以分别下载 Release 中的三个运行文件，放入同一插件目录，并保留随版本提供的许可说明。

### 手动更新

先禁用插件，再用新版本覆盖运行文件与许可说明，随后重新启用。**保留现有 `data.json` 和 `backups` 目录**，它们保存配置、登录信息和迁移备份。手动安装通过重新下载或改用 BRAT 更新。

## 第一次使用

1. 在“设置 → Douban Plus”中检查输出目录、笔记命名规则与模板，可以使用默认模板或指定自己的模板。
2. 若从原插件切换，在“高级 → 导入原配置”中读取旧配置，或选择／粘贴 JSON，预览后确认。只导入配置，不复制模板和笔记文件，也不迁移登录凭据。
3. 在 Plus 中登录豆瓣，以获取个人收藏状态、评分和评论；已有本地看板可以先离线使用。
4. 点击左侧“打开豆瓣看板”，通过联网搜索导入单个条目，或点击同步并选择收藏范围。
5. 用布局菜单切换卡片、封面和时间线，在“详细筛选”中调整评分、年份与排序。

管理工具提供属性刷新和索引重建。旧笔记缺少关联属性时，在“高级 → 迁移／修复笔记属性”中先查看预览，再选择要写入的笔记，详见 [迁移指南](docs/MIGRATION.md)。Plus 新导入的笔记通常不需要修复。

原插件与 Plus 使用不同插件 ID，可以同时安装。执行同步时建议只启用一个，避免同时写入同一组笔记。首次导入或批量修改前请备份笔记库。

## 模板与笔记属性

自定义模板继续使用上游的 `{{title}}`、`{{director}}`、`{{myComment}}` 等字段，无需为了看板添加字段。新导入整篇笔记时，在头部 YAML 中补充稳定的 `douban_` 属性，包含标识、类型、标题、封面、评分、状态、日期与标签。

- `douban_` 前缀由插件维护，其他自定义属性和正文继续保留。
- 豆瓣评分为 0–10 分，个人评分为 1–5 星，缺失值显示未知／未评分。
- 已关联笔记改名或移动后，通过“类别＋豆瓣 ID”找到当前文件。
- 属性刷新会重新序列化 YAML，可能改变头部排版与注释；正文保留。
- **强制覆盖会重新生成正文**，默认关闭；需要重新套用模板时才使用。

完整字段与保存规则见 [开发与属性说明](docs/DEVELOPMENT.md)。

## 网络与本地数据

搜索、登录、同步、属性刷新及远程封面加载会访问豆瓣相关服务，包括 `douban.com` 与 `doubanio.com`。若启用上游提供的 PicGo 图床功能，还会调用你配置的本地图床服务及上传目标。

笔记保存在当前笔记库。配置和登录 Cookie 保存在插件数据文件中，默认位置为 `.obsidian/plugins/obsidian-douban-plus/data.json`，不采用额外的凭据加密。迁移备份保存在同目录的 `backups` 下。分享配置、日志或笔记库时，请移除登录凭据及个人信息；提交问题不需要提供 Cookie。

## 支持范围与已知限制

| 项目 | 当前状态 |
| --- | --- |
| 版本 | `0.1.0` 测试版 |
| 最低 Obsidian 版本 | 清单声明 `1.4.4`，该版本尚未实机验收 |
| 已验证环境 | Windows 桌面 Obsidian `1.14.4` 的基础看板与部分迁移操作 |
| 移动端 | 保留上游兼容代码，尚未验收；首轮测试建议使用桌面端 |
| 真实账号登录、搜索导入与批量同步 | 自动测试使用模拟响应；完整真实账号流程尚待验收 |
| 舞台剧、日记 | 支持本地看板展示与上游单条导入，不增加批量收藏同步 |

豆瓣页面变化、登录失效或访问限制可能导致联网操作失败，本地笔记仍可浏览。缺少封面时显示类型图标。影视链接不能单独区分电影和电视剧，旧笔记可能需要联网补全。完整记录见 [测试报告](docs/TEST_REPORT.md)。

## 开发

使用 Node.js **24** 和锁文件安装依赖：

```sh
npm ci
npm run typecheck
npm run test:unit
npm run package:plugin
```

`npm run dev` 监听构建；`npm run deploy:dev` 部署到独立 `.dev-vault`，不覆盖已有测试配置。打包产物位于 `dist/`；测试库、登录配置、依赖和构建产物不纳入版本管理。

- [开发与属性说明](docs/DEVELOPMENT.md)
- [配置迁移与旧笔记补全](docs/MIGRATION.md)
- [测试报告与已知限制](docs/TEST_REPORT.md)
- [创建 GitHub 仓库与发布步骤](docs/RELEASING.md)
- [版本变更](CHANGELOG.md)

## 反馈与许可

请向 [本项目 Issues](https://github.com/shanxinxin6-droid/obsidian-douban-plus/issues) 反馈，并提供插件版本、Obsidian 版本、系统、复现步骤及脱敏模板。本项目的增强功能问题由本项目处理。

感谢 **Wanxp 与 obsidian-douban 的贡献者**提供基础实现，上游历史与已有代码声明保留。登录组件中的微信读书实现参考声明也予以保留。

采用 **GNU GPL v3.0**，见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。编译包中的第三方代码保留各自许可，并随包附带 `THIRD_PARTY_NOTICES.txt`。本项目由社区独立维护，与豆瓣及 Obsidian 官方没有隶属关系。