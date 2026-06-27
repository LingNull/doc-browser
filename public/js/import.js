/**
 * import.js — 文档导入模块
 * 支持两种来源：浏览器目录选择器 (showDirectoryPicker) + 服务端路径输入
 */

const Import = {
  sourceFiles: [],       // Discovered files: [{ name, size, content?, selected }]
  targetDir: '',        // Current target directory path
  sourceMode: 'picker', // 'picker' | 'path'
  dirHandle: null,      // FileSystemDirectoryHandle (Tab A)
  pickingInProgress: false,

  // Detect File System Access API
  hasPickerAPI() {
    return typeof window.showDirectoryPicker === 'function';
  },

  // ===== Open / Close =====

  open() {
    this.reset();
    $('#import-modal').removeClass('hidden');

    // Auto-select tab based on API availability
    if (this.hasPickerAPI()) {
      this.switchTab('picker');
    } else {
      this.switchTab('path');
      // Hide picker tab since it won't work
      $('.modal-tab[data-tab="picker"]').hide();
    }

    // Pre-fill target from current tree selection
    if (App.state.currentDirPath) {
      this.setTarget(App.state.currentDirPath);
    }

    this.updateConfirmButton();
  },

  close() {
    $('#import-modal').addClass('hidden');
  },

  reset() {
    this.sourceFiles = [];
    this.targetDir = App.state.currentDirPath || '';
    this.sourceMode = 'picker';
    this.dirHandle = null;
    this.pickingInProgress = false;
    this.renderFileList();
    this.updateTargetDisplay();
    $('#picker-text').text('点击选择本地文件夹').parent().find('.picker-path').addClass('hidden');
    $('#path-input').val('');
    $('#import-target-tree').addClass('hidden');
  },

  // ===== Tab switching =====

  switchTab(tab) {
    this.sourceMode = tab;
    $('.modal-tab').removeClass('active');
    $(`.modal-tab[data-tab="${tab}"]`).addClass('active');
    $('.tab-panel').removeClass('active');
    $(`#tab-${tab}`).addClass('active');
  },

  // ===== Target directory =====

  setTarget(path) {
    this.targetDir = path;
    this.updateTargetDisplay();
    this.updateConfirmButton();
  },

  updateTargetDisplay() {
    const $display = $('#import-target-path');
    if (this.targetDir) {
      $display.text('docs/' + this.targetDir.replace(/^docs[\/\\]/, ''));
      $display.removeClass('import-target-none');
    } else {
      $display.text('(请先在左侧目录树中选择一个目录，或点击"更改"选择)');
      $display.addClass('import-target-none');
    }
  },

  // Render mini tree for target selection
  renderTargetTree() {
    const $container = $('#import-target-tree');
    if (!App.state.treeData || !App.state.treeData.children) {
      $container.html('<div class="import-file-empty">没有可用目录</div>');
      return;
    }

    const self = this;
    function buildDirNode(node, depth) {
      if (node.type !== 'directory') return '';
      const indent = depth * 16;
      const hasChildren = node.children && node.children.some(c => c.type === 'directory');
      const arrow = hasChildren ? '▶' : '  ';
      const icon = hasChildren ? '📁' : '📂';
      const isSelected = node.path === self.targetDir;

      let html = `<div class="tree-node-header" data-dir-path="${node.path}"
        style="padding-left:${indent + 8}px;${isSelected ? 'background:var(--color-primary-light);color:var(--color-primary);font-weight:600;' : ''}">
        <span class="arrow" style="width:16px;text-align:center;font-size:10px;">${arrow}</span>
        <span class="icon" style="width:18px;text-align:center;font-size:14px;">${icon}</span>
        <span class="name" style="font-size:13px;">${App.escapeHTML(node.name)}</span>
      </div>`;

      if (hasChildren) {
        html += '<div class="tree-children collapsed">';
        for (const child of node.children) {
          html += buildDirNode(child, depth + 1);
        }
        html += '</div>';
      }

      return html;
    }

    let html = '';
    // Include the root 'docs' as a target option
    if (App.state.treeData) {
      html += buildDirNode(App.state.treeData, 0);
    }

    $container.html(html);

    // Click handler for target selection
    $container.find('.tree-node-header').off('click').on('click', function () {
      const path = $(this).data('dir-path');
      self.setTarget(path);
      $container.find('.tree-node-header').css({
        background: '', color: '', 'font-weight': ''
      });
      $(this).css({
        background: 'var(--color-primary-light)',
        color: 'var(--color-primary)',
        'font-weight': '600'
      });
    });

    // Toggle expand/collapse
    $container.find('.arrow').off('click').on('click', function (e) {
      e.stopPropagation();
      const $arrow = $(this);
      const $children = $arrow.closest('.tree-node-header').next('.tree-children');
      if ($children.hasClass('collapsed')) {
        $children.removeClass('collapsed');
        $arrow.text('▼');
      } else {
        $children.addClass('collapsed');
        $arrow.text('▶');
      }
    });
  },

  // ===== Tab A: Directory Picker =====

  async pickDirectory() {
    if (this.pickingInProgress) return;
    if (!this.hasPickerAPI()) {
      App.toast('您的浏览器不支持目录选择器，请切换到"输入路径"标签', 'warning');
      return;
    }

    this.pickingInProgress = true;
    try {
      this.dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      const files = await this.scanDirectory(this.dirHandle, '');
      this.sourceFiles = files;
      this.renderFileList();
      this.updateConfirmButton();

      $('#picker-text').text('已选择文件夹');
      $('#picker-path').text(this.dirHandle.name).removeClass('hidden');
    } catch (err) {
      if (err.name !== 'AbortError') {
        App.toast('读取目录失败: ' + err.message, 'error');
      }
    } finally {
      this.pickingInProgress = false;
    }
  },

  // Recursively scan a FileSystemDirectoryHandle
  async scanDirectory(handle, prefix) {
    const results = [];
    try {
      const entries = handle.values();
      for await (const entry of entries) {
        if (entry.kind === 'directory') {
          const sub = await this.scanDirectory(entry, prefix + entry.name + '/');
          results.push(...sub);
        } else if (entry.kind === 'file') {
          const ext = '.' + entry.name.split('.').pop().toLowerCase();
          if (ext === '.md' || ext === '.txt') {
            try {
              const file = await entry.getFile();
              const content = await file.text();
              results.push({
                name: entry.name,
                size: file.size,
                content: content,
                selected: true,
              });
            } catch {
              // Skip files we can't read
            }
          }
        }
      }
    } catch {
      // Permission errors, etc.
    }
    return results;
  },

  // ===== Tab B: Path input =====

  async scanPath() {
    const sourcePath = $('#path-input').val().trim();
    if (!sourcePath) {
      App.toast('请输入目录路径', 'warning');
      return;
    }

    $('#path-scan-btn').prop('disabled', true).text('扫描中...');
    try {
      const result = await $.ajax({
        url: '/api/import-preview',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ sourcePath }),
      });

      if (!result.files || result.files.length === 0) {
        App.toast('该目录下没有 .md 或 .txt 文件', 'warning');
        this.sourceFiles = [];
      } else {
        this.sourceFiles = result.files.map(f => ({
          name: f.name,
          size: f.size,
          content: null, // Server will read
          selected: true,
        }));
        App.toast(`找到 ${result.files.length} 个文件`, 'info');
      }
      this.renderFileList();
      this.updateConfirmButton();
    } catch (err) {
      const msg = (err.responseJSON && err.responseJSON.error) || err.statusText || '扫描失败';
      App.toast(msg, 'error');
    } finally {
      $('#path-scan-btn').prop('disabled', false).text('🔍 扫描');
    }
  },

  // ===== File list rendering =====

  renderFileList() {
    const $list = $('#import-file-list');
    const $summary = $('#import-file-summary');
    const $empty = $('#import-file-empty');

    if (this.sourceFiles.length === 0) {
      $list.html('<div class="import-file-empty">请先选择来源目录</div>');
      $summary.addClass('hidden');
      return;
    }

    let html = '';
    for (let i = 0; i < this.sourceFiles.length; i++) {
      const f = this.sourceFiles[i];
      const checked = f.selected ? 'checked' : '';
      html += `
        <div class="import-file-item" data-index="${i}">
          <input type="checkbox" ${checked} data-index="${i}">
          <span class="file-name">📝 ${App.escapeHTML(f.name)}</span>
          <span class="file-size">${App.formatSize(f.size)}</span>
        </div>`;
    }
    $list.html(html);

    // Checkbox change handler
    const self = this;
    $list.find('input[type="checkbox"]').on('change', function () {
      const idx = parseInt($(this).data('index'));
      if (!isNaN(idx) && self.sourceFiles[idx]) {
        self.sourceFiles[idx].selected = this.checked;
        self.updateConfirmButton();
      }
    });

    const selectedCount = this.sourceFiles.filter(f => f.selected).length;
    $summary.text(`已选择 ${selectedCount}/${this.sourceFiles.length} 个文件`).removeClass('hidden');
  },

  // ===== Execute import =====

  async execute() {
    const selectedFiles = this.sourceFiles.filter(f => f.selected);
    if (selectedFiles.length === 0) {
      App.toast('请至少选择一个文件', 'warning');
      return;
    }
    if (!this.targetDir) {
      App.toast('请选择目标位置', 'warning');
      return;
    }

    const onConflict = $('input[name="onConflict"]:checked').val() || 'rename';
    const $btn = $('#import-confirm');
    $btn.prop('disabled', true).text('导入中...');

    try {
      let result;

      if (this.sourceMode === 'picker') {
        // Tab A: send file contents
        result = await $.ajax({
          url: '/api/import',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({
            targetDir: this.targetDir,
            files: selectedFiles.map(f => ({ name: f.name, content: f.content || '' })),
            onConflict,
          }),
        });
      } else {
        // Tab B: send source path
        result = await $.ajax({
          url: '/api/import-from-path',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({
            sourcePath: $('#path-input').val().trim(),
            targetDir: this.targetDir,
            onConflict,
          }),
        });
      }

      const imported = result.imported || [];
      const skipped = result.skipped || [];
      const errors = result.errors || [];

      if (errors.length > 0) {
        App.toast(`导入完成，${errors.length} 个文件失败`, 'warning');
      } else if (skipped.length > 0) {
        App.toast(`导入 ${imported.length} 个文件，跳过 ${skipped.length} 个`, 'info');
      } else {
        App.toast(`成功导入 ${imported.length} 个文件！`, 'success');
      }

      this.close();
      App.loadTree(); // Refresh tree
    } catch (err) {
      const msg = (err.responseJSON && err.responseJSON.error) || err.statusText || '导入失败';
      App.toast(msg, 'error');
    } finally {
      $btn.prop('disabled', false).text('📥 确认导入');
    }
  },

  // ===== Button state =====

  updateConfirmButton() {
    const hasFiles = this.sourceFiles.some(f => f.selected);
    const hasTarget = !!this.targetDir;
    $('#import-confirm').prop('disabled', !(hasFiles && hasTarget));
  },
};

// ===== Event bindings =====
$(document).ready(() => {
  // Open modal
  $('#btn-import').on('click', () => Import.open());

  // Close modal
  $('#import-close, #import-cancel').on('click', () => Import.close());

  // Click backdrop to close
  $('#import-modal').on('click', function (e) {
    if (e.target === this) Import.close();
  });

  // Tab switching
  $('.modal-tab').on('click', function () {
    Import.switchTab($(this).data('tab'));
  });

  // Tab A: pick directory
  $('#picker-area').on('click', () => Import.pickDirectory());

  // Tab B: scan path
  $('#path-scan-btn').on('click', () => Import.scanPath());
  $('#path-input').on('keydown', function (e) {
    if (e.key === 'Enter') Import.scanPath();
  });

  // Change target: show mini tree
  $('#import-change-target').on('click', () => {
    const $tree = $('#import-target-tree');
    if ($tree.hasClass('hidden')) {
      Import.renderTargetTree();
      $tree.removeClass('hidden');
    } else {
      $tree.addClass('hidden');
    }
  });

  // Confirm import
  $('#import-confirm').on('click', () => Import.execute());
});
