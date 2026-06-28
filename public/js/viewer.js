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

      // Render Mermaid diagrams（异步，存储 Promise 供 saveEdit 等待）
      this._mermaidReady = this.renderMermaid();
    } catch (err) {
      App.$viewerContent.html(`<p class="error">Markdown 渲染失败: ${App.escapeHTML(err.message)}</p>`);
    }
  },

  // Render Mermaid code blocks (返回 Promise，等图表全部渲染完)
  renderMermaid() {
    if (typeof mermaid === 'undefined') {
      console.warn('[Mermaid] mermaid 全局未定义，跳过渲染');
      return Promise.resolve();
    }
    let found = 0;
    const nodes = [];
    App.$viewerContent.find('pre code').each(function () {
      const $code = $(this);
      const text = $code.text().trim();
      if (!text.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline)/)) return;

      found++;
      const $pre = $code.parent();
      const $mermaid = $(document.createElement('pre'));
      $mermaid.addClass('mermaid').text(text).attr('data-mermaid-source', text);
      $pre.replaceWith($mermaid);
      nodes.push($mermaid[0]);
    });
    if (found > 0) {
      console.log('[Mermaid] 检测到 ' + found + ' 个图表');
      const self = this;
      return mermaid.run({ nodes: nodes }).then(() => {
        console.log('[Mermaid] run() 完成');
        nodes.forEach(function (node) { self._addMermaidEdit(node); });
      }).catch((err) => {
        console.warn('[Mermaid] run() 失败', err);
      });
    }
    return Promise.resolve();
  },

  // 为单个 Mermaid 图表添加编辑按钮
  _addMermaidEdit(preEl) {
    const $pre = $(preEl);
    // 包裹容器
    const $wrap = $(document.createElement('div'));
    $wrap.addClass('mermaid-wrap');
    $pre.before($wrap);
    $wrap.append($pre);

    // 编辑按钮
    const $btn = $('<button class="btn btn-xs mermaid-edit-btn" title="编辑此图"><i class="fa-solid fa-pen-to-square"></i></button>');
    $wrap.append($btn);

    $btn.on('click', function () {
      if ($pre.hasClass('editing')) {
        // 保存：取新源码，用 mermaid.render 重新渲染
        const newSource = $pre.find('textarea').val().trim();
        const oldSource = $pre.attr('data-mermaid-source') || '';

        // 持久化：替换文件内容中的旧源码 → 新源码，写入磁盘
        if (newSource !== oldSource && Viewer.currentFile) {
          Viewer.currentFile.content = Viewer.currentFile.content.replace(oldSource, newSource);
          $('#viewer-editor').val(Viewer.currentFile.content);
          $.ajax({
            url: '/api/save',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ path: Viewer.currentFile.path, content: Viewer.currentFile.content }),
          });
        }

        $pre.attr('data-mermaid-source', newSource);
        $pre.removeClass('editing').addClass('mermaid').empty();
        $btn.html('<i class="fa-solid fa-pen-to-square"></i>').attr('title', '编辑此图');

        const id = 'mermaid-' + Math.random().toString(36).substring(2, 8);
        mermaid.render(id, newSource).then(function (result) {
          $pre.html(result.svg);
        }).catch(function (err) {
          console.warn('[Mermaid] 重新渲染失败', err);
          $pre.text(newSource); // 回退显示源码
        });
      } else {
        // 进入编辑：显示 textarea
        const source = $pre.attr('data-mermaid-source') || '';
        $pre.addClass('editing').removeClass('mermaid').empty();
        const $ta = $(document.createElement('textarea'));
        $ta.val(source).addClass('mermaid-editor').attr('spellcheck', 'false');
        $pre.append($ta);
        $ta.focus();
        $btn.html('<i class="fa-solid fa-check"></i>').attr('title', '保存并渲染');
      }
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
    // 保存滚动比例（0~1），适应预览→编辑的高度变化
    const $content = $('.content');
    const maxScroll = $content[0].scrollHeight - $content.height();
    this._scrollRatio = maxScroll > 0 ? $content.scrollTop() / maxScroll : 0;

    this.updateUIForEdit();
    const $editor = $('#viewer-editor');
    $editor.val(this.currentFile.content).removeClass('hidden');
    App.$viewerContent.addClass('hidden');
    $('#viewer').addClass('editing');
    App.setStatus('编辑中...');

    // 等布局后按比例滚动 textarea 到对应源码位置
    requestAnimationFrame(() => {
      const ta = $editor[0];
      const taMax = ta.scrollHeight - ta.clientHeight;
      ta.scrollTop = this._scrollRatio * Math.max(0, taMax);
      ta.focus({ preventScroll: true });
    });
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
      $('#viewer').removeClass('editing');
      App.$viewerContent.removeClass('hidden');

      // Re-render
      if (this.currentFile.extension === '.md') {
        this.renderMarkdown(newContent);
      } else {
        this.renderText(newContent);
      }

      // 等 Mermaid 图表全部渲染完再按比例恢复滚动位置
      const ratio = this._scrollRatio || 0;
      (this._mermaidReady || Promise.resolve()).then(() => {
        requestAnimationFrame(() => {
          const $c = $('.content');
          const max = $c[0].scrollHeight - $c.height();
          $c.scrollTop(ratio * Math.max(0, max));
        });
      });

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
    $('#viewer').removeClass('editing');
    App.$viewerContent.removeClass('hidden');
    // 按比例恢复预览滚动位置
    const $c = $('.content');
    const max = $c[0].scrollHeight - $c.height();
    $c.scrollTop((this._scrollRatio || 0) * Math.max(0, max));
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
