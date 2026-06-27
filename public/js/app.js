/**
 * app.js — 全局状态管理 & 事件总线
 */
const App = {
  // Global state
  state: {
    treeData: null,          // Full directory tree
    currentFilePath: null,   // Currently viewed file path
    currentDirPath: null,    // Currently selected directory path
    currentDirName: null,    // Currently selected directory name
    selectedNodeEl: null,    // Currently selected tree node element
    mode: 'welcome',         // 'welcome' | 'viewer'
  },

  // Initialize on DOM ready
  init() {
    this.cacheDOM();
    this.bindEvents();
    this.initTheme();
    this.loadTree();
  },

  cacheDOM() {
    this.$tree = $('#tree-container');
    this.$content = $('#content');
    this.$welcome = $('#welcome');
    this.$viewer = $('#viewer');
    this.$viewerTitle = $('#viewer-title');
    this.$viewerMeta = $('#viewer-meta');
    this.$viewerContent = $('#viewer-content');
    this.$breadcrumb = $('#breadcrumb');
    this.$btnCollapseAll = $('#btn-collapse-all');
    this.$contextMenu = $('#context-menu');
    this.$searchInput = $('#tree-search');
    this.$footerStatus = $('#footer-status');
    this.$btnTheme = $('#btn-theme');
  },

  // Dark mode toggle
  initTheme() {
    // Check saved preference or system preference
    const saved = localStorage.getItem('doc-browser-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;
    this.setTheme(isDark);
  },

  setTheme(isDark) {
    const $icon = this.$btnTheme.find('i');
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      $icon.removeClass('fa-moon').addClass('fa-sun');
      this.$btnTheme.attr('title', '切换浅色模式');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      $icon.removeClass('fa-sun').addClass('fa-moon');
      this.$btnTheme.attr('title', '切换暗色模式');
    }
    localStorage.setItem('doc-browser-theme', isDark ? 'dark' : 'light');
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    this.setTheme(current !== 'dark');
  },

  // Sidebar show/hide
  toggleSidebar() {
    const $sidebar = $('#sidebar');
    const $btn = this.$btnToggleSidebar;
    const $icon = $btn.find('i');
    if ($sidebar.hasClass('collapsed')) {
      $sidebar.removeClass('collapsed');
      $btn.removeClass('btn-toggle-active');
      $icon.removeClass('fa-angles-right').addClass('fa-angles-left');
      $btn.attr('title', '隐藏文件树');
    } else {
      $sidebar.addClass('collapsed');
      $btn.addClass('btn-toggle-active');
      $icon.removeClass('fa-angles-left').addClass('fa-angles-right');
      $btn.attr('title', '显示文件树');
    }
  },

  // Fullscreen toggle
  toggleFullscreen() {
    const $icon = this.$btnFullscreen.find('i');
    if (document.fullscreenElement) {
      document.exitFullscreen();
      $icon.removeClass('fa-compress').addClass('fa-expand');
      this.$btnFullscreen.attr('title', '全屏');
    } else {
      document.documentElement.requestFullscreen();
      $icon.removeClass('fa-expand').addClass('fa-compress');
      this.$btnFullscreen.attr('title', '退出全屏');
    }
  },

  bindEvents() {
    // Collapse all
    this.$btnCollapseAll.on('click', () => {
      Tree.collapseAll();
    });

    // Theme toggle
    this.$btnTheme.on('click', () => {
      this.toggleTheme();
    });

    // Sidebar toggle
    this.$btnToggleSidebar = $('#btn-toggle-sidebar');
    this.$sidebar = $('#sidebar');
    this.$btnToggleSidebar.on('click', () => {
      this.toggleSidebar();
    });

    // Refresh tree
    this.$btnRefreshTree = $('#btn-refresh-tree');
    this.$btnRefreshTree.on('click', () => {
      this.loadTree();
    });

    // Expand all
    this.$btnExpandAll = $('#btn-expand-all');
    this.$btnExpandAll.on('click', () => {
      Tree.expandAll();
    });

    // Fullscreen toggle
    this.$btnFullscreen = $('#btn-fullscreen');
    this.$btnFullscreen.on('click', () => {
      this.toggleFullscreen();
    });
    // Update icon when exiting fullscreen via ESC
    $(document).on('fullscreenchange', () => {
      const $icon = this.$btnFullscreen.find('i');
      if (document.fullscreenElement) {
        $icon.removeClass('fa-expand').addClass('fa-compress');
        this.$btnFullscreen.attr('title', '退出全屏');
      } else {
        $icon.removeClass('fa-compress').addClass('fa-expand');
        this.$btnFullscreen.attr('title', '全屏');
      }
    });

    // Keyboard shortcuts
    $(document).on('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'p') { e.preventDefault(); $('#tree-search').focus(); return; }
      if (ctrl && e.shiftKey && e.key === 'F') { e.preventDefault(); this.setSearchMode('fulltext'); $('#tree-search').focus(); return; }
      if (ctrl && e.key === 'b') { e.preventDefault(); this.toggleSidebar(); return; }
      if (ctrl && e.key === 'e') { e.preventDefault(); Viewer.toggleEdit(); return; }
      if (ctrl && e.key === 's') { e.preventDefault(); if (Viewer.editing) Viewer.saveEdit(); return; }
      if (e.key === 'F11') { e.preventDefault(); this.toggleFullscreen(); return; }
    });

    // Search mode toggle
    this.searchMode = 'filename';
    this.$btnSearchMode = $('#btn-search-mode');
    this.$btnSearchMode.on('click', () => {
      this.setSearchMode(this.searchMode === 'filename' ? 'fulltext' : 'filename');
    });

    // Search input: filename filter or fulltext search
    this.$searchInput.on('input', () => {
      const val = this.$searchInput.val();
      if (this.searchMode === 'filename') {
        Tree.filter(val);
      } else if (this.searchMode === 'fulltext' && val.trim().length >= 2) {
        this.doFulltextSearch(val.trim());
      } else if (this.searchMode === 'fulltext' && val.trim().length === 0) {
        $('#search-results').addClass('hidden');
      }
    });

    // SSE for file watch
    this.connectSSE();

    // Load stats
    this.loadStats();

    // Context menu
    $(document).on('click', () => {
      this.$contextMenu.addClass('hidden');
    });

    this.$contextMenu.on('click', '.context-menu-item', (e) => {
      const action = $(e.currentTarget).data('action');
      this.$contextMenu.addClass('hidden');
      if (action === 'refresh') {
        this.loadTree();
      }
    });

    // Search
    let searchTimeout;
    this.$searchInput.on('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        Tree.filter(this.$searchInput.val());
      }, 200);
    });

    // Sidebar resize
    this.initResize();
  },

  // Sidebar resize handle
  initResize() {
    const $sidebar = $('#sidebar');
    const $handle = $('#sidebar-resize');
    let startX, startWidth;

    $handle.on('mousedown', (e) => {
      startX = e.clientX;
      startWidth = $sidebar.width();
      $(document).on('mousemove.resize-sidebar', (e2) => {
        const newWidth = Math.max(180, Math.min(500, startWidth + e2.clientX - startX));
        $sidebar.css('width', newWidth + 'px');
      });
      $(document).on('mouseup.resize-sidebar', () => {
        $(document).off('.resize-sidebar');
      });
      e.preventDefault();
    });
  },

  // Load directory tree
  async loadTree() {
    this.setStatus('加载目录中...');
    Tree.showLoading();
    try {
      const data = await $.getJSON('/api/tree');
      this.state.treeData = data;
      Tree.render(data);
      this.setStatus('就绪');
    } catch (err) {
      Tree.showError('加载目录失败: ' + (err.statusText || err.message || '无法连接服务器'));
      this.setStatus('加载失败');
    }
  },

  // Open a file
  openFile(filePath) {
    this.state.currentFilePath = filePath;
    this.state.mode = 'viewer';
    this.$welcome.addClass('hidden');
    this.$viewer.removeClass('hidden');
    Viewer.load(filePath);
  },

  // Select a directory
  selectDirectory(dirPath, dirName) {
    this.state.currentDirPath = dirPath;
    this.state.currentDirName = dirName;
    this.state.currentFilePath = null;
    this.updateBreadcrumb(dirPath);
  },

  // Update breadcrumb
  updateBreadcrumb(filePath) {
    if (!filePath) {
      this.$breadcrumb.html('');
      return;
    }
    const parts = filePath.replace(/\\/g, '/').split('/');
    // Remove 'docs/' prefix
    const displayParts = parts.slice(parts[0] === 'docs' ? 1 : 0);
    let html = '';
    for (let i = 0; i < displayParts.length; i++) {
      if (i > 0) html += '<span class="breadcrumb-sep">/</span>';
      html += `<span class="breadcrumb-item">${this.escapeHTML(displayParts[i])}</span>`;
    }
    this.$breadcrumb.html(html);
  },

  // Set footer status
  setStatus(msg) {
    this.$footerStatus.text(msg);
  },

  // Show toast notification
  toast(msg, type = 'info') {
    const $toast = $(`<div class="toast toast-${type}">${this.escapeHTML(msg)}</div>`);
    $('#toast-container').append($toast);
    setTimeout(() => {
      $toast.fadeOut(300, () => $toast.remove());
    }, 3500);
  },

  // Search mode toggle
  setSearchMode(mode) {
    this.searchMode = mode;
    const $btn = this.$btnSearchMode;
    const $input = this.$searchInput;
    if (mode === 'fulltext') {
      $btn.html('<i class="fa-solid fa-magnifying-glass"></i>');
      $btn.attr('title', '当前: 全文搜索 (点击切换)');
      $input.attr('placeholder', '全文搜索 (至少2个字符)...');
      $btn.addClass('btn-primary');
    } else {
      $btn.html('<i class="fa-solid fa-font"></i>');
      $btn.attr('title', '当前: 文件名过滤 (点击切换)');
      $input.attr('placeholder', '搜索文件...');
      $btn.removeClass('btn-primary');
      $('#search-results').addClass('hidden');
    }
  },

  // Full-text search
  async doFulltextSearch(query) {
    if (query.length < 2) { $('#search-results').addClass('hidden'); return; }
    try {
      const data = await $.getJSON(`/api/search?q=${encodeURIComponent(query)}`);
      const $container = $('#search-results');
      if (!data.results || data.results.length === 0) {
        $container.html('<div class="search-empty">未找到匹配结果</div>').removeClass('hidden');
        return;
      }
      let html = '';
      for (const r of data.results) {
        html += `<div class="search-result-item" data-path="${App.escapeHTML(r.path)}">
          <div class="sr-file">${App.escapeHTML(r.name)}</div>
          <div class="sr-path">${App.escapeHTML(r.path)} (第${r.line}行)</div>
          <div class="sr-context">${App.escapeHTML(r.context)}</div>
        </div>`;
      }
      $container.html(html).removeClass('hidden');
      // Click to open file
      $container.find('.search-result-item').on('click', function () {
        const fp = $(this).data('path');
        App.openFile(fp);
        $('#search-results').addClass('hidden');
        App.$searchInput.val('');
      });
    } catch { /* ignore */ }
  },

  // SSE: auto-refresh on file changes
  connectSSE() {
    try {
      const es = new EventSource('/api/watch');
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.changed) {
            this.loadTree();
            this.loadStats();
          }
        } catch {}
      };
      es.onerror = () => { /* will auto-reconnect */ };
    } catch {}
  },

  // Load stats for dashboard
  async loadStats() {
    try {
      const data = await $.getJSON('/api/stats');
      $('#stat-files').text(data.totalFiles);
      $('#stat-projects').text(data.projectCount);
      $('#stat-modules').text(data.moduleCount);
      $('#stat-size').text(this.formatSize(data.totalSize));

      if (data.recentFiles && data.recentFiles.length > 0) {
        let html = '';
        for (const f of data.recentFiles) {
          html += `<div class="recent-item" data-path="${this.escapeHTML(f.path)}">
            <i class="fa-solid fa-file-lines" style="color:var(--steel);"></i>
            <span class="ri-name">${this.escapeHTML(f.name)}</span>
            <span class="ri-path">${this.escapeHTML(f.path.replace(/^docs\//, ''))}</span>
            <span class="ri-time">${this.formatDate(f.mtime)}</span>
          </div>`;
        }
        $('#recent-list').html(html);
        // Click to open
        $('#recent-list').find('.recent-item').on('click', function () {
          const fp = $(this).data('path');
          App.openFile(fp);
        });
      }
    } catch {}
  },

  // Utility: escape HTML
  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // Utility: format file size
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  // Utility: format date
  formatDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleString('zh-CN');
  },
};

// Boot on DOM ready
$(document).ready(() => App.init());
