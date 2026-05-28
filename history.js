// History page logic

const TYPE_LABELS = {
  JOB: '💼 JOB', ARTICLE: '📰 ARTICLE', PRODUCT: '🛍️ PRODUCT',
  RESEARCH: '🔬 RESEARCH', VIDEO: '🎬 VIDEO', OTHER: '📄 OTHER'
};

let allHistory = [];
let allCache = {};

// Load data
async function loadHistory() {
  const { history } = await chrome.runtime.sendMessage({ type: 'GET_HISTORY' });
  const { cache } = await chrome.storage.local.get({ cache: {} });
  allHistory = history || [];
  allCache = cache || {};
  renderList();
}

function renderList() {
  const search = document.getElementById('search').value.toLowerCase();
  const typeFilter = document.getElementById('type-filter').value;
  const list = document.getElementById('history-list');

  const filtered = allHistory.filter(item => {
    if (typeFilter && item.type !== typeFilter) return false;
    if (search && !item.title.toLowerCase().includes(search) && !item.url.toLowerCase().includes(search)) return false;
    return true;
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">${allHistory.length ? 'No matches found' : 'No summaries yet. Browse some pages with TL;DR enabled!'}</div>`;
    return;
  }

  list.innerHTML = '';
  filtered.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.style.animationDelay = `${i * 0.05}s`;

    const time = new Date(item.timestamp).toLocaleString();
    const type = item.type || 'OTHER';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-info">
          <div class="card-title">${esc(item.title || 'Untitled')}</div>
          <div class="card-url">${esc(item.url)}</div>
        </div>
        <div class="card-meta">
          <span class="card-badge badge-${type}">${TYPE_LABELS[type] || type}</span>
          <span class="card-time">${time}</span>
          <button class="card-delete" data-url="${esc(item.url)}" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="card-body"></div>
    `;

    // Toggle expand
    card.querySelector('.card-header').addEventListener('click', (e) => {
      if (e.target.closest('.card-delete')) return;
      const body = card.querySelector('.card-body');
      const isOpen = body.classList.toggle('open');
      if (isOpen && !body.dataset.loaded) {
        const cached = allCache[item.url];
        if (cached?.raw) {
          const parsed = TldrParser.parse(cached.raw);
          body.appendChild(TldrRenderer.render(parsed));
        } else {
          body.innerHTML = '<div class="empty-state">Summary not in cache</div>';
        }
        body.dataset.loaded = 'true';
      }
    });

    // Delete
    card.querySelector('.card-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = e.currentTarget.dataset.url;
      await chrome.runtime.sendMessage({ type: 'DELETE_HISTORY_ITEM', url });
      allHistory = allHistory.filter(h => h.url !== url);
      delete allCache[url];
      renderList();
    });

    list.appendChild(card);
  });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// Search & filter
document.getElementById('search').addEventListener('input', renderList);
document.getElementById('type-filter').addEventListener('change', renderList);

// Clear all
document.getElementById('clear-all').addEventListener('click', async () => {
  if (!confirm('Delete all history?')) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
  allHistory = [];
  allCache = {};
  renderList();
});

loadHistory();
