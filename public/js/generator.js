/**
 * generator.js — 详细设计文档生成器
 * 编辑/预览模式切换、章节管理、保存
 */
const Generator = {
  currentSections: [],
  currentDirPath: '',
  currentDirName: '',
  mode: 'edit', // 'edit' | 'preview'
  generatedMarkdown: '',

  // Open generator for a directory
  async open(dirPath, dirName) {
    this.currentDirPath = dirPath;
    this.currentDirName = dirName;
    App.showGenerator();
    App.$genTitle.text(`📝 详细设计文档 — ${dirName}`);
    App.$genBody.html('<div class="loading" style="text-align:center;padding:40px;">正在生成文档框架...</div>');
    App.$genPreview.addClass('hidden');
    App.$genBody.removeClass('hidden');
    App.setStatus('生成详设中...');

    try {
      const result = await $.ajax({
        url: '/api/generate',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ path: dirPath }),
      });

      if (!result.success && result.message) {
        App.$genBody.html(`<div class="generator-empty">⚠️ ${App.escapeHTML(result.message)}</div>`);
        App.setStatus('生成失败');
        return;
      }

      this.currentSections = result.sections || [];
      this.generatedMarkdown = result.markdown || '';
      this.renderEditMode();
      this.setMode('edit');
      App.setStatus('就绪');
    } catch (err) {
      const xhr = err && err.responseJSON;
      const msg = (xhr && xhr.error) || err.statusText || '生成失败';
      App.$genBody.html(`<div class="generator-empty">❌ ${App.escapeHTML(msg)}</div>`);
      App.setStatus('生成失败');
      App.toast(msg, 'error');
    }
  },

  // Render edit mode: section cards with textareas
  renderEditMode() {
    let html = '';
    for (let i = 0; i < this.currentSections.length; i++) {
      const sec = this.currentSections[i];
      const hasContent = sec.content && sec.content.trim();
      const sourceInfo = sec.source && sec.source.length > 0
        ? `📎 来源: ${sec.source.join(', ')}`
        : '';

      html += `
        <div class="generator-section">
          <div class="generator-section-header">
            <span class="section-icon">${sec.icon || '📄'}</span>
            <span>${sec.title}</span>
            ${sec.hint ? `<span class="section-hint">💡 ${sec.hint}</span>` : ''}
          </div>
          <div class="generator-section-content">
            <textarea data-section-id="${sec.id}" rows="5"
              placeholder="${hasContent ? '' : '待补充...'}">${App.escapeHTML(sec.content)}</textarea>
            ${sourceInfo ? `<div class="source-info">${App.escapeHTML(sourceInfo)}</div>` : ''}
          </div>
        </div>`;
    }

    App.$genBody.html(html);
  },

  // Render preview mode
  renderPreview() {
    // Collect current textarea values into sections
    App.$genBody.find('textarea').each((_, el) => {
      const $el = $(el);
      const id = $el.data('section-id');
      const section = this.currentSections.find(s => s.id === id);
      if (section) {
        section.content = $el.val();
      }
    });

    // Regenerate markdown
    this.generatedMarkdown = this.assembleMarkdown();

    try {
      const html = typeof marked.parse === 'function'
        ? marked.parse(this.generatedMarkdown)
        : marked(this.generatedMarkdown);
      App.$genPreview.html(html);
    } catch (err) {
      App.$genPreview.html(`<p class="error">渲染失败: ${App.escapeHTML(err.message)}</p>`);
    }
  },

  // Assemble markdown from current section states
  assembleMarkdown() {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    let md = `# ${this.currentDirName} — 详细设计文档\n\n`;
    md += `> 📅 生成时间：${now}\n`;
    md += `> 📂 文档目录：${this.currentDirName}\n\n`;
    md += `---\n\n`;

    for (const sec of this.currentSections) {
      md += `## ${sec.title}\n\n`;
      if (sec.content && sec.content.trim()) {
        md += sec.content.trim() + '\n\n';
      } else {
        md += `> 💡 ${sec.hint || '待补充'}\n\n`;
      }
    }

    return md;
  },

  // Set mode: 'edit' or 'preview'
  setMode(mode) {
    this.mode = mode;
    const $editBtn = $('#gen-edit-btn');
    const $previewBtn = $('#gen-preview-btn');

    if (mode === 'edit') {
      App.$genBody.removeClass('hidden');
      App.$genPreview.addClass('hidden');
      $editBtn.addClass('btn-primary');
      $previewBtn.removeClass('btn-primary');
    } else {
      this.renderPreview();
      App.$genBody.addClass('hidden');
      App.$genPreview.removeClass('hidden');
      $previewBtn.addClass('btn-primary');
      $editBtn.removeClass('btn-primary');
    }
  },

  // Save the generated document
  async save() {
    // Sync content from textareas
    App.$genBody.find('textarea').each((_, el) => {
      const $el = $(el);
      const id = $el.data('section-id');
      const section = this.currentSections.find(s => s.id === id);
      if (section) {
        section.content = $el.val();
      }
    });

    this.generatedMarkdown = this.assembleMarkdown();

    const savePath = this.currentDirPath + '/详细设计文档.md';

    App.setStatus('保存中...');
    try {
      const result = await $.ajax({
        url: '/api/save',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          path: savePath,
          content: this.generatedMarkdown,
        }),
      });

      if (result.success) {
        App.toast('详细设计文档保存成功！', 'success');
        App.setStatus('已保存');
        // Refresh tree to show new file
        App.loadTree();
      }
    } catch (err) {
      const xhr = err && err.responseJSON;
      const msg = (xhr && xhr.error) || err.statusText || '保存失败';
      App.toast(msg, 'error');
      App.setStatus('保存失败');
    }
  },
};

// Wire up generator buttons
$(document).ready(() => {
  $('#gen-edit-btn').on('click', () => Generator.setMode('edit'));
  $('#gen-preview-btn').on('click', () => Generator.setMode('preview'));
  $('#gen-save-btn').on('click', () => Generator.save());
});
