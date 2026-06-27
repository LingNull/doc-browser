# 📚 DocBrowser — 轻量级文档浏览系统

纯浏览器访问的本地文档浏览系统，按「项目 → 模块 → 功能」三级结构组织开发文档，支持 Markdown 渲染、全文搜索、在线编辑、详设生成。

---

## 特性

- 📂 **三级目录** — 项目/模块/功能 层级浏览
- 📝 **Markdown 渲染** — GFM 模式，代码高亮、表格、任务列表
- 🎨 **Mermaid 图表** — 流程图、类图、时序图、ER 图实时渲染
- 🔍 **全文搜索** — 跨所有文档搜索内容
- ✏️ **在线编辑** — 直接编辑保存，不依赖外部编辑器
- 📥 **一键导入** — 选择本地目录，自动导入文档
- 🌙 **暗色模式** — 跟随系统或手动切换
- 🔄 **文件监听** — 外部修改自动刷新
- ⌨️ **键盘快捷键** — Ctrl+P 搜文件、Ctrl+E 编辑、Ctrl+B 侧边栏 ...
- 🤖 **AI 集成** — Claude Code 自动归档 + `/save-doc` `/detail-design` Skill
- ⚡ **零依赖** — Node.js 内置模块，无需 `npm install`

---

## 一键启动

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/doc-browser.git
cd doc-browser

# 启动（零依赖，无需 npm install）
node server.js

# 浏览器打开
# http://localhost:3000
```

自定义端口：
```bash
# Windows PowerShell
$env:PORT=8080; node server.js

# Linux / macOS
PORT=8080 node server.js
```

---

## 目录结构

```
doc-browser/
├── server.js              # 服务端（~600行，Node.js 内置模块）
├── package.json           # { "scripts": { "start": "node server.js" } }
├── public/                # 前端静态资源
│   ├── index.html         # SPA 主页面
│   ├── css/style.css      # Notion 风格样式
│   └── js/
│       ├── app.js         # 全局状态 & 快捷键 & 搜索
│       ├── tree.js        # 目录树组件
│       ├── viewer.js      # 文件阅读器 & 编辑器
│       └── import.js      # 文档导入模块
└── docs/                  # 📂 你的文档（按 项目/模块/功能 组织）
    └── 项目名/
        └── 模块名/
            └── 功能名/
                ├── 需求文档.md
                ├── 开发计划.md
                ├── 代码审查.md
                └── 测试报告.md
```

---

## 文档组织约定

在 `docs/` 下按三级目录组织：

```
docs/电商平台/用户模块/登录功能/需求文档.md
docs/电商平台/用户模块/登录功能/开发计划.md
docs/电商平台/订单模块/创建订单/需求文档.md
```

文件名建议：

| 文档类型 | 文件名 |
|---------|--------|
| 需求分析 | 需求文档.md |
| 开发计划 | 开发计划.md |
| 代码审查 | 代码审查.md |
| 测试报告 | 测试报告.md |
| 接口文档 | 接口文档.md |
| 数据库设计 | 数据库设计.md |

---

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+P` | 搜索文件 |
| `Ctrl+Shift+F` | 全文搜索 |
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+E` | 编辑当前文件 |
| `Ctrl+S` | 保存（编辑模式） |
| `F11` | 全屏 |

---

## AI 集成（Claude Code）

项目包含 `CLAUDE.md`，Claude Code 对话时自动读取归档约定。

### 可用 Skill

| 命令 | 功能 |
|------|------|
| `/save-doc` | 交互式归档 — 生成文档并自动放到正确目录 |
| `/detail-design` | 生成详细设计文档 — 包含概述/流程图/类图/接口/数据表/风险等 10 个章节 |

### 示例

```
你：/save-doc 帮我写电商平台用户模块登录功能的需求文档
Claude：已保存至 docs/电商平台/用户模块/登录功能/需求文档.md
       http://localhost:3000 可查看

你：/detail-design 给登录功能出详设
Claude：[生成包含流程图、类图、时序图、ER图、接口设计...的完整详设]
```

---

## API

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/tree` | 目录树 |
| GET | `/api/tree?path=...` | 子树 |
| GET | `/api/file?path=...` | 文件内容 |
| GET | `/api/search?q=...` | 全文搜索 |
| GET | `/api/stats` | 文档统计 |
| POST | `/api/save` | 保存文件 |
| POST | `/api/import` | 导入文件 |
| POST | `/api/import-from-path` | 从路径导入 |
| POST | `/api/generate` | 生成详设 |
| GET | `/api/watch` | SSE 文件监听 |

---

## 常见问题

**Q: 需要安装依赖吗？**
A: 不需要。零 npm 依赖，纯 Node.js 内置模块。

**Q: 支持哪些文件格式？**
A: `.md`（Markdown，GFM 渲染）和 `.txt`（纯文本）。

**Q: 如何迁移到其他电脑？**
A: 拷贝整个目录即可。目标机器只需要安装 Node.js（v18+）。

**Q: 能多人同时访问吗？**
A: 这是本地单用户工具。如需团队共享，建议搭配 Git 管理 `docs/` 目录。

---

## 技术栈

- **后端**: Node.js `http` + `fs` + `path`（零依赖）
- **前端**: HTML + CSS + jQuery + marked.js + Mermaid.js（CDN）
- **设计**: Notion 风格配色 + Font Awesome 图标
- **存储**: 纯文件系统，无需数据库
