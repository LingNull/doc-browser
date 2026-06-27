const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DOCS_ROOT = path.join(__dirname, 'docs');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- MIME types ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------- Security: ensure a path stays inside root ----------
function safePath(root, target) {
  // Strip leading slashes — on Windows, path.resolve treats "/foo" as an
  // absolute path on the current drive rather than relative to `root`.
  const cleanTarget = target.replace(/^[\/\\]+/, '');
  const resolved = path.resolve(root, cleanTarget);
  const normalized = path.normalize(resolved);
  if (!normalized.startsWith(path.normalize(root) + path.sep) && normalized !== path.normalize(root)) {
    return null;
  }
  return normalized;
}

// ---------- Recursively build directory tree ----------
function buildTree(dirPath, relativePath) {
  const name = path.basename(dirPath);
  const node = {
    name,
    path: relativePath.replace(/\\/g, '/'),
    type: 'directory',
    children: [],
  };

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return node;
  }

  // Sort: directories first, then files; within each group,
  // newest first (by modification time descending)
  const getMtime = (entry) => {
    try { return fs.statSync(path.join(dirPath, entry.name)).mtimeMs; } catch { return 0; }
  };
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    // Both same type: sort by mtime descending (newest first)
    return getMtime(b) - getMtime(a);
  });

  for (const entry of entries) {
    // Skip hidden files/dirs and node_modules
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const childAbs = path.join(dirPath, entry.name);
    const childRel = path.join(relativePath, entry.name);

    if (entry.isDirectory()) {
      const child = buildTree(childAbs, childRel);
      node.children.push(child);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.md' || ext === '.txt') {
        let stats;
        try { stats = fs.statSync(childAbs); } catch { stats = { size: 0, mtime: new Date() }; }
        node.children.push({
          name: entry.name,
          path: childRel.replace(/\\/g, '/'),
          type: 'file',
          extension: ext,
          size: stats.size,
          mtime: stats.mtime.toISOString(),
        });
      }
    }
  }

  return node;
}

// ---------- Read JSON body from request ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---------- Send JSON response ----------
function sendJSON(res, statusCode, data) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(json);
}

// ---------- Extract headings from markdown content ----------
function extractHeadings(content) {
  const headings = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim() });
    }
  }
  return headings;
}

// ---------- Classify document by filename keywords ----------
function classifyDocument(filename) {
  const name = filename.toLowerCase();
  if (name.includes('需求') || name.includes('requirement')) return 'requirements';
  if (name.includes('计划') || name.includes('plan')) return 'plan';
  if (name.includes('审查') || name.includes('review')) return 'review';
  if (name.includes('测试') || name.includes('test')) return 'testing';
  if (name.includes('数据') || name.includes('database') || name.includes('db') || name.includes('表')) return 'database';
  if (name.includes('api') || name.includes('接口')) return 'api-design';
  if (name.includes('风险') || name.includes('risk')) return 'risks';
  if (name.includes('部署') || name.includes('deploy')) return 'deployment';
  if (name.includes('逻辑') || name.includes('实现') || name.includes('impl')) return 'implementation';
  if (name.includes('核心') || name.includes('core')) return 'core-logic';
  return 'general';
}

// ---------- Section definitions ----------
const DESIGN_SECTIONS = [
  { id: 'overview',       title: '概述',           icon: '📋' },
  { id: 'requirements',   title: '功能需求',       icon: '📝' },
  { id: 'flowchart',      title: '流程图',         icon: '🔀', hint: '支持 Mermaid 语法' },
  { id: 'implementation', title: '功能实现逻辑',   icon: '⚙️' },
  { id: 'core-logic',     title: '核心逻辑',       icon: '⭐' },
  { id: 'database',       title: '数据表结构',     icon: '🗄️' },
  { id: 'api-design',     title: '接口设计',       icon: '🔗' },
  { id: 'risks',          title: '风险评估',       icon: '⚠️' },
  { id: 'testing',        title: '测试方案',       icon: '✅' },
  { id: 'deployment',     title: '部署说明',       icon: '🚀' },
];

// ---------- Generate design doc ----------
function generateDesignDoc(dirPath) {
  const files = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.md' || ext === '.txt') {
          const filePath = path.join(dirPath, entry.name);
          const content = fs.readFileSync(filePath, 'utf-8');
          files.push({
            name: entry.name,
            path: filePath,
            content,
            type: classifyDocument(entry.name),
          });
        }
      }
    }
  } catch {
    return { sections: [], sourceFiles: [] };
  }

  if (files.length === 0) {
    return { sections: [], sourceFiles: [] };
  }

  // Map files to sections
  const sectionContent = {};
  for (const sec of DESIGN_SECTIONS) {
    sectionContent[sec.id] = '';
  }

  const generalContent = [];

  for (const file of files) {
    // Remove extension for display
    const displayName = file.name.replace(/\.(md|txt)$/i, '');

    if (file.type === 'general') {
      generalContent.push(`### ${displayName}\n\n${file.content}`);
    } else {
      let targetSection = file.type;
      // Map plan/review types
      if (file.type === 'plan') targetSection = 'implementation';
      if (file.type === 'review') targetSection = 'core-logic';
      targetSection = targetSection || 'implementation';

      if (DESIGN_SECTIONS.find(s => s.id === targetSection)) {
        if (sectionContent[targetSection]) {
          sectionContent[targetSection] += '\n\n---\n\n';
        }
        sectionContent[targetSection] += `### ${displayName}\n\n${file.content}`;
      } else {
        generalContent.push(`### ${displayName}\n\n${file.content}`);
      }
    }
  }

  // Build sections array
  const sections = DESIGN_SECTIONS.map(sec => ({
    ...sec,
    content: sectionContent[sec.id] || '',
    source: files.filter(f => {
      let target = f.type;
      if (f.type === 'plan') target = 'implementation';
      if (f.type === 'review') target = 'core-logic';
      return target === sec.id;
    }).map(f => f.name),
  }));

  // If there's unmatched general content, append to overview
  if (generalContent.length > 0) {
    const overviewIdx = sections.findIndex(s => s.id === 'overview');
    if (overviewIdx >= 0) {
      if (sections[overviewIdx].content) {
        sections[overviewIdx].content += '\n\n---\n\n';
      }
      sections[overviewIdx].content += generalContent.join('\n\n---\n\n');
    }
  }

  const sourceFiles = files.map(f => f.name);

  return { sections, sourceFiles };
}

// ---------- Assemble final markdown ----------
function assembleMarkdown(sections, dirName) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  let md = `# ${dirName} — 详细设计文档\n\n`;
  md += `> 📅 生成时间：${now}\n`;
  md += `> 📂 文档目录：${dirName}\n\n`;
  md += `---\n\n`;

  for (const sec of sections) {
    md += `## ${sec.title}\n\n`;
    if (sec.content) {
      md += sec.content.trim() + '\n\n';
    } else {
      md += `> 💡 ${sec.hint || '待补充'}\n\n`;
    }
  }

  return md;
}

// ---------- Strip "docs/" prefix from API paths ----------
// The tree returns paths like "docs/项目/模块/功能", but DOCS_ROOT already
// points to the docs directory. Strip the leading "docs/" to avoid double-prefix.
function relPath(target) {
  return target.replace(/^docs[\/\\]/, '').replace(/^[\/\\]+/, '');
}

// ---------- HTTP Server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const method = req.method.toUpperCase();
  const pathname = url.pathname;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // ---- API: GET /api/tree ----
    if (method === 'GET' && pathname === '/api/tree') {
      const targetPath = relPath(url.searchParams.get('path') || '');

      let absPath = DOCS_ROOT;
      if (targetPath) {
        absPath = safePath(DOCS_ROOT, targetPath);
        if (!absPath) return sendJSON(res, 403, { error: '路径访问被拒绝' });
      }

      // Ensure docs directory exists
      if (!fs.existsSync(DOCS_ROOT)) {
        fs.mkdirSync(DOCS_ROOT, { recursive: true });
      }

      const tree = buildTree(absPath, targetPath || 'docs');
      return sendJSON(res, 200, tree);
    }

    // ---- API: GET /api/file ----
    if (method === 'GET' && pathname === '/api/file') {
      const filePath = url.searchParams.get('path') || '';
      if (!filePath) return sendJSON(res, 400, { error: '缺少 path 参数' });

      const absPath = safePath(DOCS_ROOT, relPath(filePath));
      if (!absPath) return sendJSON(res, 403, { error: '路径访问被拒绝' });

      if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) {
        return sendJSON(res, 404, { error: '文件不存在' });
      }

      const content = fs.readFileSync(absPath, 'utf-8');
      const stats = fs.statSync(absPath);
      const ext = path.extname(absPath).toLowerCase();

      return sendJSON(res, 200, {
        name: path.basename(absPath),
        path: filePath,
        content,
        extension: ext,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
      });
    }

    // ---- API: POST /api/generate ----
    if (method === 'POST' && pathname === '/api/generate') {
      const body = await readBody(req);
      const targetPath = body.path || '';

      if (!targetPath) return sendJSON(res, 400, { error: '缺少 path 参数' });

      const absPath = safePath(DOCS_ROOT, relPath(targetPath));
      if (!absPath) return sendJSON(res, 403, { error: '路径访问被拒绝' });

      if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
        return sendJSON(res, 404, { error: '目录不存在' });
      }

      const { sections, sourceFiles } = generateDesignDoc(absPath);

      if (sections.length === 0) {
        return sendJSON(res, 200, {
          success: false,
          message: '此目录下没有可用的文档文件',
          markdown: '',
          sections: [],
          sourceFiles: [],
        });
      }

      const dirName = path.basename(absPath);
      const markdown = assembleMarkdown(sections, dirName);

      return sendJSON(res, 200, {
        success: true,
        markdown,
        sections,
        sourceFiles,
        dirName,
      });
    }

    // ---- API: POST /api/save ----
    if (method === 'POST' && pathname === '/api/save') {
      const body = await readBody(req);
      const filePath = body.path || '';
      const content = body.content || '';

      if (!filePath) return sendJSON(res, 400, { error: '缺少 path 参数' });

      const absPath = safePath(DOCS_ROOT, relPath(filePath));
      if (!absPath) return sendJSON(res, 403, { error: '路径访问被拒绝' });

      // Ensure parent directory exists
      const parentDir = path.dirname(absPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(absPath, content, 'utf-8');

      return sendJSON(res, 200, {
        success: true,
        message: '保存成功',
        path: filePath,
      });
    }

    // ---- API: POST /api/import (browser sends file contents) ----
    if (method === 'POST' && pathname === '/api/import') {
      const body = await readBody(req);
      const targetDir = body.targetDir || '';
      const files = body.files || [];
      const onConflict = body.onConflict || 'rename';

      if (!targetDir) return sendJSON(res, 400, { error: '缺少 targetDir 参数' });
      if (!Array.isArray(files) || files.length === 0) {
        return sendJSON(res, 400, { error: '缺少 files 参数或为空' });
      }

      const absTarget = safePath(DOCS_ROOT, relPath(targetDir));
      if (!absTarget) return sendJSON(res, 403, { error: '目标路径访问被拒绝' });

      // Ensure target directory exists
      if (!fs.existsSync(absTarget)) {
        fs.mkdirSync(absTarget, { recursive: true });
      }

      const imported = [];
      const skipped = [];
      const errors = [];

      for (const file of files) {
        // Sanitize filename: strip path separators, reject dangerous names
        let name = (file.name || '').replace(/^[\/\\]+/, '');
        name = path.basename(name); // Strip any directory components
        if (!name || name.startsWith('.') || name.includes('..')) {
          errors.push({ name: file.name || '(unknown)', error: '文件名不安全' });
          continue;
        }

        const content = file.content || '';
        const destPath = path.join(absTarget, name);

        // Handle conflicts
        if (fs.existsSync(destPath)) {
          if (onConflict === 'skip') {
            skipped.push(name);
            continue;
          }
          if (onConflict === 'rename') {
            const ext = path.extname(name);
            const base = path.basename(name, ext);
            let counter = 1;
            let newName, newPath;
            do {
              newName = `${base}_${counter}${ext}`;
              newPath = path.join(absTarget, newName);
              counter++;
            } while (fs.existsSync(newPath) && counter < 100);
            name = newName;
          }
          // 'overwrite' falls through
        }

        try {
          fs.writeFileSync(path.join(absTarget, name), content, 'utf-8');
          imported.push(name);
        } catch (err) {
          errors.push({ name, error: err.message });
        }
      }

      return sendJSON(res, 200, { success: true, imported, skipped, errors });
    }

    // ---- API: POST /api/import-from-path (server reads local path) ----
    if (method === 'POST' && pathname === '/api/import-from-path') {
      const body = await readBody(req);
      const sourcePath = body.sourcePath || '';
      const targetDir = body.targetDir || '';
      const onConflict = body.onConflict || 'rename';

      if (!sourcePath) return sendJSON(res, 400, { error: '缺少 sourcePath 参数' });
      if (!targetDir) return sendJSON(res, 400, { error: '缺少 targetDir 参数' });

      // Validate source path
      const absSource = path.resolve(sourcePath);
      if (!fs.existsSync(absSource)) return sendJSON(res, 400, { error: '源路径不存在' });
      if (!fs.statSync(absSource).isDirectory()) return sendJSON(res, 400, { error: '源路径不是目录' });

      const absTarget = safePath(DOCS_ROOT, relPath(targetDir));
      if (!absTarget) return sendJSON(res, 403, { error: '目标路径访问被拒绝' });

      if (!fs.existsSync(absTarget)) {
        fs.mkdirSync(absTarget, { recursive: true });
      }

      // Collect .md/.txt files recursively from source
      function collectFiles(dir) {
        const results = [];
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              results.push(...collectFiles(full));
            } else {
              const ext = path.extname(entry.name).toLowerCase();
              if (ext === '.md' || ext === '.txt') {
                results.push({ name: entry.name, path: full });
              }
            }
          }
        } catch {}
        return results;
      }

      const sourceFiles = collectFiles(absSource);
      const imported = [];
      const skipped = [];
      const errors = [];

      for (const file of sourceFiles) {
        const destPath = path.join(absTarget, file.name);

        if (fs.existsSync(destPath)) {
          if (onConflict === 'skip') { skipped.push(file.name); continue; }
          if (onConflict === 'rename') {
            const ext = path.extname(file.name);
            const base = path.basename(file.name, ext);
            let counter = 1;
            let newName;
            do {
              newName = `${base}_${counter}${ext}`;
              counter++;
            } while (fs.existsSync(path.join(absTarget, newName)) && counter < 100);
            try {
              fs.copyFileSync(file.path, path.join(absTarget, newName));
              imported.push(newName);
            } catch (err) {
              errors.push({ name: file.name, error: err.message });
            }
            continue;
          }
        }

        try {
          fs.copyFileSync(file.path, destPath);
          imported.push(file.name);
        } catch (err) {
          errors.push({ name: file.name, error: err.message });
        }
      }

      return sendJSON(res, 200, { success: true, imported, skipped, errors });
    }

    // ---- API: POST /api/import-preview (scan local path) ----
    if (method === 'POST' && pathname === '/api/import-preview') {
      const body = await readBody(req);
      const sourcePath = body.sourcePath || '';

      if (!sourcePath) return sendJSON(res, 400, { error: '缺少 sourcePath 参数' });

      const absSource = path.resolve(sourcePath);
      if (!fs.existsSync(absSource)) return sendJSON(res, 400, { error: '源路径不存在' });
      if (!fs.statSync(absSource).isDirectory()) return sendJSON(res, 400, { error: '源路径不是目录' });

      function collectFiles(dir) {
        const results = [];
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              results.push(...collectFiles(full));
            } else {
              const ext = path.extname(entry.name).toLowerCase();
              if (ext === '.md' || ext === '.txt') {
                try {
                  const stats = fs.statSync(full);
                  results.push({ name: entry.name, size: stats.size });
                } catch {
                  results.push({ name: entry.name, size: 0 });
                }
              }
            }
          }
        } catch {}
        return results;
      }

      const files = collectFiles(absSource);
      return sendJSON(res, 200, { success: true, files, sourcePath: absSource });
    }

    // ---- API: GET /api/search (full-text search) ----
    if (method === 'GET' && pathname === '/api/search') {
      const query = (url.searchParams.get('q') || '').trim();
      if (!query || query.length < 1) return sendJSON(res, 200, { results: [] });

      const results = [];
      const lowerQ = query.toLowerCase();

      function searchDir(dir) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              searchDir(full);
            } else {
              const ext = path.extname(entry.name).toLowerCase();
              if (ext === '.md' || ext === '.txt') {
                try {
                  const content = fs.readFileSync(full, 'utf-8');
                  const lines = content.split('\n');
                  for (let i = 0; i < lines.length; i++) {
                    if (lines[i].toLowerCase().includes(lowerQ)) {
                      const rel = path.relative(DOCS_ROOT, full).replace(/\\/g, '/');
                      const ctxStart = Math.max(0, i - 1);
                      const ctxEnd = Math.min(lines.length - 1, i + 1);
                      const context = lines.slice(ctxStart, ctxEnd + 1)
                        .map((l, j) => `${ctxStart + j + 1}: ${l}`).join('\n');
                      results.push({
                        path: 'docs/' + rel,
                        name: entry.name,
                        line: i + 1,
                        context: context.substring(0, 300),
                      });
                      break; // One match per file is enough
                    }
                  }
                } catch {}
              }
            }
          }
        } catch {}
      }

      searchDir(DOCS_ROOT);
      // Limit results
      results.splice(50);
      return sendJSON(res, 200, { results, query });
    }

    // ---- API: GET /api/stats ----
    if (method === 'GET' && pathname === '/api/stats') {
      let totalFiles = 0;
      let totalSize = 0;
      const projects = new Set();
      const modules = new Set();
      const recentFiles = [];

      function scanDir(dir, depth) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              const rel = path.relative(DOCS_ROOT, full).replace(/\\/g, '/');
              const parts = rel.split('/');
              if (parts.length === 1) projects.add(parts[0]);
              if (parts.length === 2) modules.add(rel);
              scanDir(full, depth + 1);
            } else {
              const ext = path.extname(entry.name).toLowerCase();
              if (ext === '.md' || ext === '.txt') {
                totalFiles++;
                try {
                  const stats = fs.statSync(full);
                  totalSize += stats.size;
                  recentFiles.push({
                    name: entry.name,
                    path: 'docs/' + path.relative(DOCS_ROOT, full).replace(/\\/g, '/'),
                    size: stats.size,
                    mtime: stats.mtime.toISOString(),
                  });
                } catch {}
              }
            }
          }
        } catch {}
      }

      scanDir(DOCS_ROOT, 0);

      // Sort recent files by mtime descending, take top 8
      recentFiles.sort((a, b) => (b.mtime || '').localeCompare(a.mtime || ''));
      const recent = recentFiles.slice(0, 8);

      return sendJSON(res, 200, {
        totalFiles,
        totalSize,
        projectCount: projects.size,
        moduleCount: modules.size,
        recentFiles: recent,
      });
    }

    // ---- API: GET /api/watch (SSE for file changes) ----
    if (method === 'GET' && pathname === '/api/watch') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('data: {"connected":true}\n\n');

      // Add client to watcher list
      const clientId = Date.now();
      sseClients.set(clientId, res);

      req.on('close', () => {
        sseClients.delete(clientId);
      });
      return;
    }
    let staticPath = pathname;
    if (staticPath === '/' || staticPath === '') staticPath = '/index.html';

    const absStaticPath = safePath(PUBLIC_DIR, staticPath);
    if (!absStaticPath || !fs.existsSync(absStaticPath) || fs.statSync(absStaticPath).isDirectory()) {
      return sendJSON(res, 404, { error: '页面未找到' });
    }

    const ext = path.extname(absStaticPath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const fileContent = fs.readFileSync(absStaticPath);

    res.writeHead(200, { 'Content-Type': mime });
    res.end(fileContent);

  } catch (err) {
    console.error('Server error:', err);
    if (!res.headersSent) {
      sendJSON(res, 500, { error: err.message || '服务器内部错误' });
    }
  }
});

// ---------- SSE clients for file watch ----------
const sseClients = new Map();

// ---------- File watcher ----------
let watchTimeout;
function broadcastChange() {
  clearTimeout(watchTimeout);
  watchTimeout = setTimeout(() => {
    const msg = 'data: {"changed":true}\n\n';
    for (const [id, res] of sseClients) {
      try { res.write(msg); } catch { sseClients.delete(id); }
    }
  }, 500); // 500ms debounce
}

// Ensure docs directory exists
if (!fs.existsSync(DOCS_ROOT)) {
  fs.mkdirSync(DOCS_ROOT, { recursive: true });
}

// Start watching docs/
try {
  fs.watch(DOCS_ROOT, { recursive: true }, (eventType, filename) => {
    if (filename && !filename.startsWith('.') && /\.(md|txt)$/i.test(filename)) {
      broadcastChange();
    }
  });
} catch {}

server.listen(PORT, () => {
  console.log(`\n📚 文档浏览系统已启动`);
  console.log(`   浏览器打开: http://localhost:${PORT}`);
  console.log(`   文档根目录: ${DOCS_ROOT}`);
  console.log(`   按 Ctrl+C 停止服务\n`);
});
