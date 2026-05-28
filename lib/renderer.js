// Renders parsed summary data into DOM elements for Shadow DOM

const TldrRenderer = {
  TYPE_COLORS: {
    JOB: { bg: '#064e3b', text: '#6ee7b7', label: '💼 JOB' },
    ARTICLE: { bg: '#1e3a5f', text: '#7dd3fc', label: '📰 ARTICLE' },
    PRODUCT: { bg: '#4a1d6e', text: '#c4b5fd', label: '🛍️ PRODUCT' },
    RESEARCH: { bg: '#713f12', text: '#fcd34d', label: '🔬 RESEARCH' },
    VIDEO: { bg: '#7f1d1d', text: '#fca5a5', label: '🎬 VIDEO' },
    OTHER: { bg: '#374151', text: '#d1d5db', label: '📄 OTHER' }
  },

  render(parsed) {
    const container = document.createElement('div');
    container.className = 'tldr-result';

    // Empty page state
    if (parsed.type === 'EMPTY_PAGE') {
      container.innerHTML = `<div class="tldr-empty">
        <span class="tldr-empty-icon">🫥</span>
        <span>Nothing to summarize here</span>
      </div>`;
      return container;
    }

    // Error state
    if (parsed.type === 'ERROR') {
      container.innerHTML = `<div class="tldr-error">
        <span class="tldr-error-icon">⚠️</span>
        <span>${parsed.error || 'Unexpected error'}</span>
      </div>`;
      return container;
    }

    const colors = this.TYPE_COLORS[parsed.type] || this.TYPE_COLORS.OTHER;

    // Type badge
    const badge = document.createElement('div');
    badge.className = 'tldr-badge';
    badge.style.cssText = `background:${colors.bg};color:${colors.text}`;
    badge.textContent = colors.label;
    container.appendChild(badge);

    // Fields
    if (parsed.fields?.length) {
      const fieldGroup = document.createElement('div');
      fieldGroup.className = 'tldr-fields';
      parsed.fields.forEach(({ label, value }) => {
        const row = document.createElement('div');
        row.className = 'tldr-field';
        row.innerHTML = `<span class="tldr-label">${this.esc(label)}</span><span class="tldr-value">${this.esc(value)}</span>`;
        fieldGroup.appendChild(row);
      });
      container.appendChild(fieldGroup);
    }

    // Bullet sections
    if (parsed.bullets?.length) {
      parsed.bullets.forEach(({ heading, items }) => {
        if (!items.length) return;
        const section = document.createElement('div');
        section.className = 'tldr-bullets';
        if (heading) {
          const h = document.createElement('div');
          h.className = 'tldr-bullet-heading';
          h.textContent = heading;
          section.appendChild(h);
        }
        const ul = document.createElement('ul');
        items.forEach(item => {
          const li = document.createElement('li');
          li.textContent = item;
          ul.appendChild(li);
        });
        section.appendChild(ul);
        container.appendChild(section);
      });
    }

    // Verdict
    if (parsed.verdict) {
      const v = document.createElement('div');
      v.className = 'tldr-verdict';
      v.innerHTML = `<span class="tldr-verdict-icon">⚡</span>${this.esc(parsed.verdict)}`;
      container.appendChild(v);
    }

    return container;
  },

  esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
};
