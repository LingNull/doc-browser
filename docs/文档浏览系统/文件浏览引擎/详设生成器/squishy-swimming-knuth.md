# 导入本地文档功能

## Context

当前系统只能通过在 `docs/` 下手动创建目录和文件来添加文档。用户希望有一个按钮，能选择本地某个目录，自动把里面的 `.md`/`.txt` 文件导入到 `docs/` 的对应位置，或者直接打开查看。这是一个便捷的"文件导入"功能，避免手动搬运文件。

---

## 技术方案：A+B 混合

| 方案 | 机制 | 适用场景 |
|------|------|----------|
| **A: 浏览器目录选择器** | `window.showDirectoryPicker()` 弹出原生目录选择框，JS 读取文件内容，POST 到服务端保存 | Chromium 浏览器（Chrome/Edge），体验最好 |
| **B: 服务端路径输入** | 在弹窗中手动输入本地绝对路径，服务端直接读取并复制 | 所有浏览器，作为 fallback |

**为什么不"直接打开"（不复制）？**
现有所有 API（tree/file/generate/save）都基于 `docs/` 沙箱。挂载外部目录需要深度重构。复制到 `docs/` 后完全兼容现有功能。

---

## 新增/修改文件

| 操作 | 文件 | 用途 |
|------|------|------|
| **新增** | `public/js/import.js` | 导入模块：弹窗 UI、目录选择器、文件上传 |
| **修改** | `public/index.html` | Header 加导入按钮 + 弹窗 HTML |
| **修改** | `public/css/style.css` | 弹窗、标签页、文件列表样式 |
| **修改** | `server.js` | 新增 `POST /api/import` 和 `POST /api/import-from-path` |
| **修改** | `public/js/app.js` | 引入 import.js，绑定导入按钮 |

---

## UI 交互流程

### 触发
Header 右侧增加 **📥 导入文档** 按钮（始终可用，不依赖树选中状态）

### 弹窗布局

```
┌──────────────────────────────────────────────┐
│  📥 导入文档                         [✕ 关闭] │
├──────────────────────────────────────────────┤
│  [📁 选择文件夹]  |  [📝 输入路径]             │
├──────────────────────────────────────────────┤
│                                              │
│  来源: 📂 D:\my-docs\project-notes            │
│  ┌──────────────────────────────────────────┐ │
│  │ ☑ 需求文档.md                     2.0 KB │ │
│  │ ☑ 开发计划.md                     5.1 KB │ │
│  │ ☐ 测试报告.md                     1.8 KB │ │
│  └──────────────────────────────────────────┘ │
│  已选择 2/3 个文件                             │
│                                              │
│  目标位置:                                     │
│  📂 docs/文档浏览系统/文件浏览引擎/  [更改]      │
│                                              │
│  同名处理: ○ 重命名  ● 覆盖  ○ 跳过           │
├──────────────────────────────────────────────┤
│                         [取消]  [📥 确认导入]  │
└──────────────────────────────────────────────┘
```

### Tab A: 选择本地文件夹
1. 点击"选择文件夹"→ 调用 `showDirectoryPicker()`
2. 递归遍历目录，筛选 `.md`/`.txt` 文件
3. 列表展示，默认全选，可取消勾选

### Tab B: 手动输入路径
1. 文本输入框填写绝对路径（如 `D:\my-docs\project`）
2. 点击"扫描目录"→ `POST /api/import-preview` 获取文件列表
3. 列表展示，勾选确认

### 目标位置
- 如果用户在左侧树中已选中某个目录 → 自动预填
- 如果未选中 → 显示内联迷你树让用户点选
- 也可以手动输入新路径（自动创建目录链）

### 同名文件处理
- **覆盖**: 直接替换已有文件
- **重命名**: 自动加 `_1`, `_2` 后缀
- **跳过**: 保留已有文件不动

---

## 服务端 API

### `POST /api/import` (Tab A — 浏览器发送内容)

```json
// Request
{
  "targetDir": "docs/文档浏览系统/文件浏览引擎",
  "files": [
    { "name": "需求文档.md", "content": "# 需求\n..." },
    { "name": "开发计划.md", "content": "## 计划\n..." }
  ],
  "onConflict": "rename"
}

// Response
{
  "success": true,
  "imported": ["docs/文档浏览系统/文件浏览引擎/需求文档.md"],
  "skipped": [],
  "errors": []
}
```

### `POST /api/import-from-path` (Tab B — 服务端读本地路径)

```json
// Request
{
  "sourcePath": "D:\\my-docs\\project-notes",
  "targetDir": "docs/文档浏览系统/文件浏览引擎",
  "onConflict": "rename"
}
```

### `POST /api/import-preview` (Tab B — 预览)

```json
// Request
{ "sourcePath": "D:\\my-docs\\project-notes" }

// Response
{
  "files": [
    { "name": "需求文档.md", "size": 2048 },
    { "name": "开发计划.md", "size": 5120 }
  ]
}
```

---

## 实现步骤

### Step 1: 服务端 (`server.js`)
- 新增 `POST /api/import` — 接收文件列表 + 目标路径，写入 docs/
- 新增 `POST /api/import-from-path` — 接收源路径 + 目标路径，服务器端 `copyFileSync`
- 新增 `POST /api/import-preview` — 扫描源路径返回文件列表
- 复用已有的 `safePath`、`relPath`、`sendJSON` 函数
- 外部路径校验：验证路径存在、是目录、无空字节

### Step 2: 样式 (`public/css/style.css`)
- `.modal-overlay` — 全屏半透明遮罩
- `.modal` — 居中弹窗（max-width 600px, 圆角, 阴影）
- `.modal-tabs` — 标签页切换
- `.import-file-list` — 可滚动文件列表（复用 tree 的 hover 样式）
- `.import-target` — 目标路径面包屑

### Step 3: HTML (`public/index.html`)
- Header 增加 `<button id="btn-import">📥 导入文档</button>`
- 新增弹窗 HTML 块 `#import-modal`

### Step 4: 导入模块 (`public/js/import.js`)
- `Import` 对象，参考 `Generator` 模式
- `open()` / `close()` — 弹窗显隐
- `scanWithPicker(handle)` — 递归遍历 `FileSystemDirectoryHandle`
- `previewPath(path)` — 调用 import-preview API
- `execute()` — 收集选中文件，调用对应 API
- `renderTargetTree()` — 从 `App.state.treeData` 渲染迷你目标选择树

### Step 5: 接入 (`public/js/app.js`)
- `bindEvents()` 中绑定 `#btn-import` → `Import.open()`
- 页面加载时加载 `import.js`

---

## 边界情况

| 场景 | 处理 |
|------|------|
| 浏览器不支持 `showDirectoryPicker` | 自动显示 Tab B（路径输入） |
| 源目录为空 | 提示"所选目录中没有 .md 或 .txt 文件" |
| 目标未选 | 提示"请选择目标位置" |
| 文件名冲突 | 弹窗显示冲突列表，按 onConflict 策略处理 |
| 超大文件 (>5MB) | Tab A 弹警告，Tab B 服务端自然处理 |
| 源路径不存在（Tab B） | 服务端返回 400 + 错误信息 |
| 路径遍历攻击 | `safePath` 限制在 docs/ 内 |

---

## 验证方式

1. 启动 `node server.js`，Chrome 打开 `http://localhost:3000`
2. 点击"导入文档"→ 选择本地一个有 .md 文件的目录
3. 勾选/取消勾选文件，选择目标位置
4. 确认导入 → 目录树自动刷新 → 点击文件可正常阅读
5. Firefox 打开 → 验证自动切换到路径输入模式
6. 测试同名冲突处理
