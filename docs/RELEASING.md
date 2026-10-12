# 创建 GitHub 仓库与发布

发布渠道为 GitHub Releases、BRAT 与 ZIP 手动安装，不提交官方插件目录。维护者 `shanxinxin6-droid`，仓库 `obsidian-douban-plus`，插件 ID 保持 `obsidian-douban-plus`，首版 `0.1.0`。

以下为待执行步骤；文档和预设链接不表示远程仓库或 Release 已创建。实际状态以 GitHub 页面为准。

## 1. GitHub 登录

本机已有 GitHub CLI，但整理文档时原登录凭据返回 HTTP 401。先在 PowerShell 中执行：

```powershell
Set-Location 'D:\work\projcet\obsidian-douban-plus'
gh auth login --hostname github.com --git-protocol https --web
gh auth status
gh api user --jq .login
gh auth setup-git
```

按 CLI 提示在浏览器完成授权，确认用户名为 `shanxinxin6-droid`。不要把 Token 粘贴到 README、Issue 或聊天中。[GitHub CLI 登录说明](https://cli.github.com/manual/gh_auth_login)

## 2. 创建公开仓库并保留历史

本地已有完整上游历史，不需要重新 `git init`。先核对本地修改均已提交，`upstream` 仍指向 Wanxp 原仓库。

```powershell
git status --short
git remote -v
gh repo create shanxinxin6-droid/obsidian-douban-plus --public --source . --remote origin --description 'Douban Plus: a local collection dashboard and template-compatible imports for Obsidian.'
git push -u origin HEAD:main
gh repo edit shanxinxin6-droid/obsidian-douban-plus --default-branch main
```

这会把当前开发分支推送为远程 `main`，不改写上游历史，也不改变本地分支名称。后续在本地开发分支上推送到 `main` 时，使用明确的 `git push origin HEAD:main`。不要使用强制推送。

如同名仓库已存在，不重复创建，先核查它的内容与所有权，再添加正确的 `origin`；不要覆盖已有不相关仓库。[GitHub CLI 创建仓库说明](https://cli.github.com/manual/gh_repo_create)

也可以在 GitHub 网页中创建一个 **Public、空仓库**，不要勾选生成 README、许可证或 `.gitignore`，然后执行：

```powershell
git remote add origin https://github.com/shanxinxin6-droid/obsidian-douban-plus.git
git push -u origin HEAD:main
```

在仓库设置中确认默认分支为 `main`。`origin` 为自己的仓库，`upstream` 保持原作者仓库。测试库、个人配置、迁移备份、依赖与 `dist` 不提交；如果曾误提交个人数据，仅添加忽略规则不会从历史中移除它们。

## 3. 验证与打包

```powershell
npm ci
npm run test:unit
npm run package:plugin
git diff --check
```

`package:plugin` 已包含类型检查和生产构建，并检查包版本、插件版本与最低版本记录一致。失败时先修复，不继续发布。产物：

```text
dist/
├── obsidian-douban-plus-0.1.0.zip
└── obsidian-douban-plus/
    ├── main.js
    ├── manifest.json
    ├── styles.css
    ├── LICENSE
    ├── NOTICE
    ├── INSTALL.md
    ├── SOURCE.md
    └── THIRD_PARTY_NOTICES.txt
```

依赖声明根据生产构建实际包含的包生成；缺少许可文本时打包失败，需要先处理。`dist/build-meta.json` 是生成声明使用的构建中间文件，不作为 Release 附件。

`0.1.0` 的真实账号、最低版本和移动端验收尚未完成，所以首版标为 **Pre-release**，保留 README 和发布说明中的限制。不能把模拟测试记作真实账号测试通过。

## 4. 创建源码标签与 Release 草稿

确保源码、锁文件、LICENSE、NOTICE、README、构建脚本和发布说明已提交。标签必须对应构建使用的源码；先核对工作区干净，再执行：

```powershell
git status --short
git push origin HEAD:main
git tag -a 0.1.0 -m 'Douban Plus 0.1.0'
git push origin 0.1.0
gh release create 0.1.0 --repo shanxinxin6-droid/obsidian-douban-plus --verify-tag --draft --prerelease --title 'Douban Plus 0.1.0' --notes-file docs/releases/0.1.0.md dist/obsidian-douban-plus/main.js dist/obsidian-douban-plus/manifest.json dist/obsidian-douban-plus/styles.css dist/obsidian-douban-plus/LICENSE dist/obsidian-douban-plus/NOTICE dist/obsidian-douban-plus/INSTALL.md dist/obsidian-douban-plus/SOURCE.md dist/obsidian-douban-plus/THIRD_PARTY_NOTICES.txt dist/obsidian-douban-plus-0.1.0.zip
```

**三个运行文件必须分别上传**，不能只上传 ZIP。GPL 许可、来源说明和对应源码也需随发布提供；GitHub 的标签源码归档包括锁文件与构建脚本，SOURCE.md 指向同一版本。不要上传 `data.json`、真实 Cookie、测试库或备份。

检查 Draft 中的附件、源码标签、版本和发布说明后，在 GitHub 点击 **Publish release**，或执行：

```powershell
gh release edit 0.1.0 --repo shanxinxin6-droid/obsidian-douban-plus --draft=false
```

该命令公开草稿，仍保留 Pre-release 标记。BRAT 用户需选择可用版本；草稿未公开时不能安装。先从 GitHub 下载公开附件，在独立库验证手动安装和 BRAT 安装，确认可用后再分享链接。

## 5. 后续更新

在功能分支完成修改与相关验证后，以新版本发布，不覆盖已公开的旧标签和附件。`npm version 0.1.1 --no-git-tag-version` 会同步 `package.json`、锁文件、`manifest.json` 和 `versions.json`；再更新 CHANGELOG、新版发布说明与文档中的版本信息，提交、构建、推送并创建对应标签。

若最低支持版本变化，更新 manifest 和 versions 的对应项，并记录验证环境。新版本继续同时提供独立运行文件、许可说明和 ZIP。BRAT 跟踪最新版本的用户通过 BRAT 更新；固定版本与手动安装用户自行选择更新。

## 来源与许可证记录

根 LICENSE 保留上游 GPLv3 全文；NOTICE 记录 Wanxp、上游贡献者、基线提交和 Plus 的修改。上游基线 `package.json` 曾标为 MIT，与根许可不一致，本项目采用根 GPLv3 路线，不以该历史字段改用 MIT；如需进一步澄清，应联系上游作者。

发布不表示原作者负责维护或背书，不重定向 Plus 的反馈到上游。更多安装与数据说明见根 README。
