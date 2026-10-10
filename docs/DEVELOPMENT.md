# Douban Plus 开发说明

## 工程基线

本地仓库保留 Wanxp/obsidian-douban 的完整 Git 历史，以 `22bde026fa3d8d021ba4acd35e0c43ffa93243a8` 为起点。`upstream` 指向原仓库，开发分支为 `feature/douban-dashboard`。没有创建远程仓库、推送或发布。许可证为根目录 `License` 中的 GPLv3；上游作者声明保留。

插件名 Douban Plus，ID `obsidian-douban-plus`，版本 `0.1.0`。最低 Obsidian 版本声明为 1.4.4，属性刷新使用公开 `FileManager.processFrontMatter()`；桌面实测版本见测试报告。没有新增桌面专属依赖，移动端尚未验收。

## 安装与开发

环境：Node.js 24（本机 24.16.0），npm 11.13.0；Obsidian 类型固定为 1.13.1。

```sh
npm ci
npm run typecheck
npm run test:unit
npm run build
npm run package:plugin
npm run deploy:dev
```

`npm run dev` 监听源码并构建。`deploy:dev` 将三个插件文件复制到独立 `.dev-vault/.obsidian/plugins/obsidian-douban-plus`，首次生成七类虚构笔记、缺类型旧笔记及正文模板；已有测试文件与配置保留，不自动覆盖。构建后重载 Obsidian 插件。虚构 ID 不用于真实同步。

`package:plugin` 生成 `dist/obsidian-douban-plus-0.1.0.zip`，内部只有 `obsidian-douban-plus/main.js`、`manifest.json`、`styles.css`。依赖、参考克隆、测试库、个人配置和构建产物均在忽略列表。持续集成执行锁文件安装、默认测试及生产打包，不自动发布。

## 代码职责

| 文件 | 职责 |
| --- | --- |
| `src/org/wanxp/dashboard/model.ts` | 稳定身份、类型、查询、排序、统计及视图设置 |
| `properties.ts` | 严格头部 YAML 解析、模板补充属性及结构化数据转换 |
| `index.ts` | 本地 Markdown 索引、重复关联、事件通知及重建 |
| `view.ts` | 原生 ItemView、网格/列表、过滤分组、分批显示 |
| `migration.ts` | 补全预览、备份、原子写入、恢复及配置白名单 |
| `modals.ts` | 配置导入确认、字段映射、补全与恢复界面 |
| `src/org/wanxp/main.ts` | 注册视图、模板导入、复用原同步及属性刷新桥接 |

影视身份键共用 `movie:ID`，其他资源按类别区分。文件路径从当前索引获取；重命名不会成为新的远程条目。一个条目关联多个文件时保留全部关联并提示，自动同步跳过冲突。

笔记是数据来源，索引只存内存，可重建。启动等待 Obsidian 完成初始索引，监听属性、移动、删除事件，合并重复通知。每批最多渲染 100 个卡片。

## 属性约定

| 属性 | 值与用途 |
| --- | --- |
| `douban_source` / `douban_schema` | 固定 `douban` / `1` |
| `douban_id` / `douban_url` | 字符串 ID / 原条目链接 |
| `douban_type` | `movie`、`teleplay`、`book`、`music`、`game`、`theater`、`note`、`unknown` |
| `douban_title` / `douban_cover` | 标题 / 封面 URL 或本地图片路径 |
| `douban_score` / `douban_rating` | 豆瓣 0–10 分 / 个人 1–5 星；未评分为 null，不用零冒充评分 |
| `douban_state` | `wish`、`do`、`collect`、`not`、`unknown` |
| `douban_published_date` | 发布日期，缺失为 null |
| `douban_collection_date` | 收藏日期，缺失为 null |
| `douban_tags` | 个人标签数组 |
| `douban_synced_at` | 成功获取该条目数据的 ISO 时间；离线补全不虚构此时间 |

`douban_` 前缀由插件维护；自定义模板无需引用这些字段。整篇导入先渲染模板、合并头部属性，再创建文件。已有条目默认只刷新属性；正文不重新渲染。YAML 重新序列化可能改变排版与注释，不承诺头部逐字保留；正文保留。BOM、CRLF/LF 和正文分隔线有专门测试。非法 YAML 拒绝写入。编辑器插入片段保留上游行为。

请求失败不写入属性；成功获取的数据会更新评分、状态等，缺失值标记未知。没有收藏日期时，最近收藏排序退回文件修改时间，界面显示来源。统计反映当前结果，并非完整远程收藏或活动历史。

## 同步与验证

同步与刷新共享任务锁。取消标记立即生效，当前请求结束后释放锁，取消后不继续写入。原增量历史不阻止已关联条目刷新；历史不能证明笔记仍存在。未迁移旧笔记和重复关联先处理再自动更新。

上游默认测试基线 31 项通过、20 项条件性跳过，类型检查与生产构建通过。新增测试见 `test/Dashboard*.test.ts`。使用模拟网络和固定样例，不把模拟结果记为真实账户同步通过。实机手工步骤、性能数据和待验证项见 [测试报告](TEST_REPORT.md)。
