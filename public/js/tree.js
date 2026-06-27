/**
 * tree.js — 目录树组件
 * 渲染递归树、展开/折叠、搜索、右键菜单
 */
const Tree = {
  // Render tree from data (skip root "docs" level)
  render(data) {
    App.$tree.empty();
    if (!data || !data.children || data.children.length === 0) {
      this.showEmpty();
      return;
    }
    // Render project nodes directly, skip the "docs" wrapper
    const $fragment = $(document.createDocumentFragment());
    for (const child of data.children) {
      const $node = this.buildNode(child, 0);
      $fragment.append($node);
      // Auto-expand first level (project)
      $node.find('> .tree-children').removeClass('collapsed');
    }
    App.$tree.append($fragment);
  },

  // Recursively build tree nodes
  buildNode(node, depth) {
    const $wrapper = $('<div class="tree-node">');
    const $header = $('<div class="tree-node-header">');
    const isDir = node.type === 'directory';
    const hasChildren = isDir && node.children && node.children.length > 0;

    // Arrow
    const $arrow = $('<span class="arrow">');
    if (isDir && hasChildren) {
      $arrow.html('<i class="fa-solid fa-chevron-right"></i>').addClass('expanded');
    } else if (isDir) {
      $arrow.css('visibility', 'hidden');
    } else {
      $arrow.css('visibility', 'hidden');
    }
    $header.append($arrow);

    // Mark directory nodes (for sticky CSS)
    if (isDir) {
      $header.addClass('is-dir');
    }

    // Icon
    const $icon = $('<span class="icon">');
    if (isDir) {
      $icon.html('<i class="fa-solid fa-folder"></i>');
    } else {
      const ext = node.extension || '';
      $icon.html(ext === '.md'
        ? '<i class="fa-solid fa-file-lines"></i>'
        : '<i class="fa-solid fa-file"></i>');
    }
    $header.append($icon);

    // Name
    const $name = $('<span class="name">').text(node.name);
    $header.append($name);

    // Badge for files
    if (!isDir && node.size !== undefined) {
      const $badge = $('<span class="badge">').text(App.formatSize(node.size));
      $header.append($badge);
    }

    // Copy path button (appears on hover)
    const $copyBtn = $('<span class="tree-copy-btn" title="复制路径">').html('<i class="fa-solid fa-copy"></i>');
    $copyBtn.on('click', (e) => {
      e.stopPropagation();
      const path = node.path;
      navigator.clipboard.writeText(path).then(() => {
        $copyBtn.html('<i class="fa-solid fa-check"></i>');
        setTimeout(() => $copyBtn.html('<i class="fa-solid fa-copy"></i>'), 1500);
      }).catch(() => {
        App.toast('复制失败', 'error');
      });
    });
    $header.append($copyBtn);

    // Store data
    $header.data('node', node);

    // Click handler
    $header.on('click', (e) => {
      e.stopPropagation();
      if (isDir) {
        this.toggleNode($wrapper, $arrow, $header, node);
      } else {
        this.selectNode($header, node);
      }
    });

    // Right-click (context menu)
    if (isDir) {
      $header.on('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        App.state.currentDirPath = node.path;
        App.state.currentDirName = node.name;
        App.selectDirectory(node.path, node.name);
        this.selectNode($header, node);
        // Show context menu
        const menu = App.$contextMenu;
        menu.css({ left: e.clientX + 'px', top: e.clientY + 'px' });
        menu.removeClass('hidden');
      });
    }

    $wrapper.append($header);

    // Children
    if (isDir && hasChildren) {
      const $children = $('<div class="tree-children">');
      for (const child of node.children) {
        $children.append(this.buildNode(child, depth + 1));
      }
      $wrapper.append($children);
    }

    return $wrapper;
  },

  // Toggle expand/collapse
  toggleNode($wrapper, $arrow, $header, node) {
    const $children = $wrapper.find('> .tree-children');
    const $icon = $header.find('.icon');
    if ($children.length === 0) {
      // No children, just select the directory
      App.selectDirectory(node.path, node.name);
      this.selectNode($header, node);
      return;
    }
    if ($children.hasClass('collapsed')) {
      $children.removeClass('collapsed');
      $arrow.addClass('expanded');
      $icon.html('<i class="fa-solid fa-folder-open"></i>');
    } else {
      $children.addClass('collapsed');
      $arrow.removeClass('expanded');
      $icon.html('<i class="fa-solid fa-folder"></i>');
    }
    App.selectDirectory(node.path, node.name);
    this.selectNode($header, node);
  },

  // Select a node (highlight)
  selectNode($header, node) {
    // Remove previous selection
    if (App.state.selectedNodeEl) {
      App.state.selectedNodeEl.removeClass('active');
    }
    $header.addClass('active');
    App.state.selectedNodeEl = $header;

    if (node.type === 'file') {
      App.openFile(node.path);
    }
  },

  // Collapse all nodes
  collapseAll() {
    App.$tree.find('.tree-children').addClass('collapsed');
    App.$tree.find('.arrow').removeClass('expanded');
    App.$tree.find('.tree-node-header.is-dir .icon').html('<i class="fa-solid fa-folder"></i>');
  },

  // Expand all nodes
  expandAll() {
    App.$tree.find('.tree-children').removeClass('collapsed');
    App.$tree.find('.arrow').addClass('expanded');
    App.$tree.find('.tree-node-header.is-dir .icon').html('<i class="fa-solid fa-folder-open"></i>');
  },

  // Search/filter
  filter(query) {
    if (!query || query.trim() === '') {
      // Show all
      App.$tree.find('.tree-node').show();
      App.$tree.find('.tree-node-header').removeClass('highlight');
      return;
    }

    const lower = query.toLowerCase();
    App.$tree.find('.tree-node-header').each(function () {
      const $header = $(this);
      const node = $header.data('node');
      const name = (node && node.name ? node.name : '').toLowerCase();

      if (name.includes(lower)) {
        // Show this node and expand parents
        $header.closest('.tree-node').show();
        $header.closest('.tree-children').removeClass('collapsed');
        $header.closest('.tree-children').siblings('.tree-node-header').find('.arrow').addClass('expanded');
        $header.addClass('highlight');

        // Show ancestors
        let $parent = $header.closest('.tree-node').parent().closest('.tree-node');
        while ($parent.length) {
          $parent.show();
          $parent.find('> .tree-children').removeClass('collapsed');
          $parent.find('> .tree-node-header .arrow').addClass('expanded');
          $parent = $parent.parent().closest('.tree-node');
        }
      } else {
        $header.closest('.tree-node').hide();
        $header.removeClass('highlight');
      }
    });
  },

  // Show loading
  showLoading() {
    App.$tree.html('<div class="loading">加载目录中...</div>');
  },

  // Show error
  showError(msg) {
    App.$tree.html(`<div class="empty"><span class="empty-icon">⚠️</span>${App.escapeHTML(msg)}</div>`);
  },

  // Show empty state
  showEmpty() {
    App.$tree.html(`
      <div class="empty">
        <span class="empty-icon">📂</span>
        <p>还没有文档</p>
        <p style="font-size:12px;margin-top:8px;">
          请在 <code>docs/</code> 目录下<br>
          按 <strong>项目/模块/功能</strong> 创建文件夹<br>
          并放入 <code>.md</code> 或 <code>.txt</code> 文件
        </p>
      </div>
    `);
  },
};
