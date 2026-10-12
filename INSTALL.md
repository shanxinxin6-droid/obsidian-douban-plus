# Douban Plus 安装与更新

本插件由 shanxinxin6-droid 独立维护。仓库及下载地址：

https://github.com/shanxinxin6-droid/obsidian-douban-plus

## BRAT 安装

在 Obsidian 中安装并启用 BRAT。在 BRAT 设置中选择 Add a beta plugin，输入上面的仓库地址，选择已公开的版本并安装，再启用 Douban Plus。通过 BRAT 检查更新；固定版本需要调整版本选择。

BRAT 需要 GitHub Release 中分别提供 main.js、manifest.json、styles.css，不能直接安装源码或未公开的草稿版本。

## ZIP 手动安装

1. 在仓库 Releases 的 Assets 下下载 `obsidian-douban-plus-版本号.zip`，不要下载 GitHub 自动生成的 Source code ZIP。
2. 解压出 `obsidian-douban-plus` 文件夹，放入 `<笔记库>/.obsidian/plugins/`；自定义配置目录时使用实际目录。
3. 确认该文件夹下直接包含 `main.js`、`manifest.json`、`styles.css`，保留随包提供的许可、来源和安装说明。
4. 重启 Obsidian，在插件设置中启用 Douban Plus。

Obsidian 不能直接导入 ZIP。`.obsidian` 目录可能被系统隐藏。

## 更新

先禁用插件，用新版本覆盖运行文件和许可说明，再重新启用。保留现有 `data.json` 和 `backups` 目录；它们保存配置、登录信息和迁移备份。手动安装需要重新下载更新，或改用 BRAT。

## 初次使用

先在插件设置中检查输出目录与模板，然后登录并选择导入或同步范围。通过左侧按钮或“打开豆瓣看板”命令进入看板。

原配置导入和“迁移／修复笔记属性”位于“高级”标签页。全新 Plus 导入一般无需修复。已有条目默认刷新属性并保留正文；强制覆盖会重新生成正文。批量写入前备份笔记库。

0.1.0 为测试版；已验证 Windows 桌面 Obsidian 1.14.4 的基础看板与部分迁移。清单声明的最低版本 1.4.4、移动端与完整真实账号同步尚未验收。完整说明、反馈入口、测试报告与许可见仓库 README、LICENSE、NOTICE 和随包 SOURCE.md。