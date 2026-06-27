/**
 * viewer.js — 文件阅读器 + 在线编辑
 * 加载文件、渲染 Markdown / 显示 TXT、编辑模式、Mermaid 渲染
 */
const Viewer = {
  editing: false,
  currentFile: null, // { path, content, extension }

  // Load and display a file
  async load(filePath) {
    App.setStatus('加载文件中...');
    try {
      const data = await $.getJSON(`/api/file?path=${encodeURIComponent(filePath)}`);

      this.currentFile = {
        path: data.path,
        content: data.content,
        extension: data.extension,
      };
      this.editing = false;
      this.updateUIForView();

      App.$viewerTitle.text(data.name);
      App.$viewerMeta.text(
        `大小: ${App.formatSize(data.size)} | 修改时间: ${App.formatDate(data.mtime)}`
      );
      App.updateBreadcrumb(data.path);

      const ext = data.extension || '';
      if (ext === '.md') {
        this.renderMarkdown(data.content);
      } else {
        this.renderText(data.content);
      }

      App.setStatus('就绪');
    } catch (err) {
      const xhr = err && err.responseJSON;
      const msg = (xhr && xhr.error) || err.statusText || '无法加载文件';
      App.$viewerContent.html(`<p class="error" style="color:var(--color-error);padding:20px;">❌ ${App.escapeHTML(msg)}</p>`);
      App.setStatus('加载失败');
      App.toast(msg, 'error');
    }
  },

  // Render markdown
  renderMarkdown(content) {
    try {
      if (typeof marked.setOptions === 'function') {
        marked.setOptions({ gfm: true, breaks: false });
      }
      const html = typeof marked.parse === 'function'
        ? marked.parse(content)
        : marked(content);
      App.$viewerContent.html(html);

      // Add "Copy" buttons to code blocks
      App.$viewerContent.find('pre').each(function () {
        const $pre = $(this);
        const $btn = $('<button class="btn btn-sm" style="position:absolute;top:6px;right:6px;font-size:11px;"><i class="fa-solid fa-copy"></i> 复制</button>');
        $pre.css('position', 'relative');
        $btn.on('click', () => {
          const code = $pre.find('code').text() || $pre.text();
          navigator.clipboard.writeText(code).then(() => {
            $btn.html('<i class="fa-solid fa-check"></i> 已复制');
            setTimeout(() => $btn.html('<i class="fa-solid fa-copy"></i> 复制'), 2000);
          }).catch(() => { App.toast('复制失败', 'error'); });
        });
        $pre.append($btn);
      });

      // Render Mermaid diagrams
      this.renderMermaid();
    } catch (err) {
      App.$viewerContent.html(`<p class="error">Markdown 渲染失败: ${App.escapeHTML(err.message)}</p>`);
    }
  },

  // Render Mermaid code blocks
  renderMermaid() {
    if (typeof mermaid === 'undefined') return;
    App.$viewerContent.find('pre code').each(function () {
      const $code = $(this);
      const text = $code.text().trim();
      if (!text.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline)/)) return;

      const $pre = $code.parent();
      const id = 'mermaid-' + Math.random().toString(36).substring(2, 8);
      $pre.after(`<div class="mermaid-container" id="${id}"></div>`);
      $pre.hide();

      try {
        mermaid.render(id, text).then(({ svg }) => {
          $('#' + id).html(svg);
        }).catch(() => { $pre.show(); $('#' + id).remove(); });
      } catch { $pre.show(); }
    });
  },

  // Render plain text
  renderText(content) {
    const escaped = App.escapeHTML(content);
    App.$viewerContent.html(`<pre style="white-space:pre-wrap;font-family:var(--font-mono);font-size:13px;line-height:1.6;">${escaped}</pre>`);
  },

  // ===== Edit mode =====

  toggleEdit() {
    if (!this.currentFile) return;
    if (this.editing) {
      this.cancelEdit();
    } else {
      this.startEdit();
    }
  },

  startEdit() {
    this.editing = true;
    this.updateUIForEdit();
    $('#viewer-editor').val(this.currentFile.content).removeClass('hidden').focus();
    App.$viewerContent.addClass('hidden');
    App.setStatus('编辑中...');
  },

  async saveEdit() {
    if (!this.editing || !this.currentFile) return;
    const newContent = $('#viewer-editor').val();

    App.setStatus('保存中...');
    try {
      await $.ajax({
        url: '/api/save',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ path: this.currentFile.path, content: newContent }),
      });

      this.currentFile.content = newContent;
      this.editing = false;
      this.updateUIForView();
      $('#viewer-editor').addClass('hidden');
      App.$viewerContent.removeClass('hidden');

      // Re-render
      if (this.currentFile.extension === '.md') {
        this.renderMarkdown(newContent);
      } else {
        this.renderText(newContent);
      }

      App.toast('保存成功', 'success');
      App.setStatus('就绪');
    } catch (err) {
      App.toast('保存失败', 'error');
      App.setStatus('保存失败');
    }
  },

  cancelEdit() {
    this.editing = false;
    this.updateUIForView();
    $('#viewer-editor').addClass('hidden');
    App.$viewerContent.removeClass('hidden');
    App.setStatus('就绪');
  },

  updateUIForView() {
    $('#btn-edit').html('<i class="fa-solid fa-pen-to-square"></i> 编辑').removeClass('hidden');
    $('#btn-save-edit, #btn-cancel-edit').addClass('hidden');
  },

  updateUIForEdit() {
    $('#btn-edit').addClass('hidden');
    $('#btn-save-edit, #btn-cancel-edit').removeClass('hidden');
  },
};

// Edit button bindings
$(document).ready(() => {
  $('#btn-edit').on('click', () => Viewer.toggleEdit());
  $('#btn-save-edit').on('click', () => Viewer.saveEdit());
  $('#btn-cancel-edit').on('click', () => Viewer.cancelEdit());
});
