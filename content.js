/* Content script — floating popup injected into page */
(function () {
  if (window.__tldrInjected) return;
  window.__tldrInjected = true;

  let host, shadow, popup, isDragging = false, dragOffset = { x: 0, y: 0 };

  // Loading phrases for gen-Z animation
  const LOADING_PHRASES = [
    'reading the vibes...', 'scanning for tea ☕', 'cooking the summary 🍳',
    'no cap analyzing...', 'lowkey extracting...', 'speed-running this page...',
    'its giving... processing', 'slay-nalyzing content 💅', 'main character decoding...',
    'rent-free in my CPU...'
  ];

  function init() {
    // Create Shadow DOM host
    host = document.createElement('div');
    host.id = 'tldr-ext-root';
    shadow = host.attachShadow({ mode: 'closed' });

    // Inject styles into shadow
    const style = document.createElement('style');
    style.textContent = getStyles();
    shadow.appendChild(style);

    // Build popup shell
    popup = document.createElement('div');
    popup.className = 'tldr-popup';
    popup.innerHTML = `
      <div class="tldr-header" id="tldr-drag-handle">
        <div class="tldr-title">
          <span class="tldr-logo">⚡</span>
          <span>TL;DR</span>
        </div>
        <div class="tldr-actions">
          <button class="tldr-btn tldr-copy-md" title="Copy raw Markdown">📝</button>
          <button class="tldr-btn tldr-copy" title="Copy text">📋</button>
          <button class="tldr-btn tldr-minimize" title="Minimize">_</button>
          <button class="tldr-btn tldr-close" title="Close">✕</button>
        </div>
      </div>
      <div class="tldr-body">
        <div class="tldr-loading">
          <div class="tldr-loading-bar"></div>
          <div class="tldr-loading-text">${LOADING_PHRASES[0]}</div>
        </div>
      </div>
    `;

    shadow.appendChild(popup);
    document.body.appendChild(host);

    // Adaptive colors
    const colors = TldrColors.extract();
    TldrColors.applyToHost(popup, colors);

    // Dragging
    const handle = shadow.querySelector('#tldr-drag-handle');
    handle.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);

    // Close button
    shadow.querySelector('.tldr-close').addEventListener('click', () => {
      popup.classList.add('tldr-hiding');
      setTimeout(() => host.remove(), 300);
    });

    // Minimize button
    shadow.querySelector('.tldr-minimize').addEventListener('click', () => {
      popup.classList.toggle('tldr-minimized');
    });

    // Copy formatted (markdown) button
    shadow.querySelector('.tldr-copy-md').addEventListener('click', () => {
      const text = host.__lastRaw || '';
      navigator.clipboard.writeText(text).then(() => {
        const btn = shadow.querySelector('.tldr-copy-md');
        btn.textContent = '✓';
        setTimeout(() => btn.textContent = '📝', 1500);
      });
    });

    // Copy text button
    shadow.querySelector('.tldr-copy').addEventListener('click', () => {
      const body = shadow.querySelector('.tldr-body');
      const text = body.innerText || body.textContent;
      navigator.clipboard.writeText(text).then(() => {
        const btn = shadow.querySelector('.tldr-copy');
        btn.textContent = '✓';
        setTimeout(() => btn.textContent = '📋', 1500);
      });
    });

    // Start loading animation
    animateLoading();
  }

  // Loading text cycling animation
  function animateLoading() {
    const textEl = shadow?.querySelector('.tldr-loading-text');
    if (!textEl) return;
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % LOADING_PHRASES.length;
      textEl.style.opacity = '0';
      setTimeout(() => {
        textEl.textContent = LOADING_PHRASES[i];
        textEl.style.opacity = '1';
      }, 150);
    }, 1800);
    // Store for cleanup
    host.__loadingInterval = interval;
  }

  function showResult(raw) {
    if (host.__loadingInterval) clearInterval(host.__loadingInterval);
    const body = shadow.querySelector('.tldr-body');
    body.innerHTML = '';

    if (raw.error) {
      body.innerHTML = `<div class="tldr-error"><span class="tldr-error-icon">⚠️</span>${escHtml(raw.error)}</div>`;
      return;
    }

    const rawText = raw.raw || raw;
    host.__lastRaw = rawText;
    const parsed = TldrParser.parse(rawText);
    const rendered = TldrRenderer.render(parsed);
    body.appendChild(rendered);
    popup.classList.add('tldr-loaded');
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Drag handlers
  function startDrag(e) {
    isDragging = true;
    const rect = popup.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    popup.style.transition = 'none';
    e.preventDefault();
  }

  function onDrag(e) {
    if (!isDragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.x));
    const y = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffset.y));
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
    popup.style.right = 'auto';
  }

  function stopDrag() {
    isDragging = false;
    popup.style.transition = '';
  }

  // Trigger summarization
  async function summarize() {
    const pageData = TldrExtractor.extract();
    if (!pageData.text || pageData.text.length < 50) {
      showResult({ raw: 'EMPTY_PAGE' });
      return;
    }

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'SUMMARIZE_REQUEST',
        ...pageData
      });
      showResult(result);
    } catch (err) {
      showResult({ error: err.message || 'Failed to connect' });
    }
  }

  // Check if we should auto-run
  async function checkAndRun() {
    try {
      const { enabled } = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (!enabled) return;

      // Check cache first
      const cached = await chrome.runtime.sendMessage({ type: 'CHECK_CACHE', url: location.href });
      init();
      if (cached) {
        showResult(cached);
      } else {
        summarize();
      }
    } catch (e) { /* extension context invalidated */ }
  }

  // Listen for toggle messages
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE') {
      if (!msg.enabled && host) {
        popup.classList.add('tldr-hiding');
        setTimeout(() => host?.remove(), 300);
      }
    }
    if (msg.type === 'SUMMARIZE') {
      if (!host || !document.contains(host)) {
        init();
        summarize();
      }
    }
  });

  // Auto-run on page load
  checkAndRun();

  // Scoped styles (inside Shadow DOM)
  function getStyles() {
    return `
      :host { all: initial; }

      .tldr-popup {
        position: fixed;
        top: 16px;
        right: 16px;
        width: 360px;
        max-height: 520px;
        background: var(--tldr-bg, rgba(15, 15, 20, 0.92));
        color: var(--tldr-text, #e4e4e7);
        border: 1px solid var(--tldr-border, rgba(255,255,255,0.1));
        border-radius: 16px;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
        font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
        font-size: 13px;
        z-index: 2147483647;
        overflow: hidden;
        animation: tldr-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        flex-direction: column;
        resize: both;
        min-width: 280px;
        min-height: 120px;
        max-width: 90vw;
        max-height: 90vh;
        pointer-events: auto;
      }

      .tldr-popup.tldr-minimized {
        height: auto !important;
        width: 300px !important;
        resize: none;
      }

      .tldr-popup.tldr-minimized .tldr-body {
        display: none;
      }

      .tldr-popup.tldr-hiding {
        animation: tldr-slide-out 0.3s cubic-bezier(0.7, 0, 0.84, 0) forwards;
      }

      @keyframes tldr-slide-in {
        from { opacity: 0; transform: translateY(-20px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes tldr-slide-out {
        to { opacity: 0; transform: translateY(-20px) scale(0.95); }
      }

      .tldr-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        cursor: grab;
        border-bottom: 1px solid var(--tldr-border, rgba(255,255,255,0.08));
        user-select: none;
        background: linear-gradient(135deg, rgba(255,255,255,0.03), transparent);
      }

      .tldr-header:active { cursor: grabbing; }

      .tldr-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 15px;
        letter-spacing: -0.3px;
      }

      .tldr-logo {
        font-size: 18px;
        filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.5));
      }

      .tldr-actions { display: flex; gap: 4px; }

      .tldr-btn {
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 8px;
        font-size: 14px;
        opacity: 0.6;
        transition: all 0.2s;
      }

      .tldr-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }

      .tldr-body {
        padding: 16px;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
      }

      .tldr-body::-webkit-scrollbar { width: 4px; }
      .tldr-body::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.15);
        border-radius: 4px;
      }

      /* Loading animation */
      .tldr-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 32px 16px;
      }

      .tldr-loading-bar {
        width: 100%;
        height: 3px;
        border-radius: 3px;
        background: linear-gradient(90deg, transparent, var(--tldr-accent, #a78bfa), #22d3ee, var(--tldr-accent, #f472b6), transparent);
        background-size: 200% 100%;
        animation: tldr-gradient-shift 1.5s ease infinite, tldr-pulse 2s ease-in-out infinite;
      }

      @keyframes tldr-gradient-shift {
        0% { background-position: 100% 0; }
        100% { background-position: -100% 0; }
      }

      @keyframes tldr-pulse {
        0%, 100% { opacity: 0.6; transform: scaleX(0.9); }
        50% { opacity: 1; transform: scaleX(1); }
      }

      .tldr-loading-text {
        font-size: 13px;
        opacity: 0.7;
        font-style: italic;
        transition: opacity 0.15s;
        letter-spacing: 0.3px;
      }

      /* Result card styles */
      .tldr-result { display: flex; flex-direction: column; gap: 12px; }

      .tldr-badge {
        display: inline-flex;
        align-self: flex-start;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.8px;
        text-transform: uppercase;
      }

      .tldr-fields { display: flex; flex-direction: column; gap: 6px; }

      .tldr-field {
        display: flex;
        gap: 8px;
        line-height: 1.5;
      }

      .tldr-label {
        font-weight: 600;
        opacity: 0.7;
        white-space: nowrap;
        min-width: fit-content;
        font-size: 12px;
      }

      .tldr-value { font-weight: 400; }

      .tldr-bullets { display: flex; flex-direction: column; gap: 4px; }

      .tldr-bullet-heading {
        font-weight: 600;
        font-size: 12px;
        opacity: 0.6;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 2px;
      }

      .tldr-bullets ul {
        margin: 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .tldr-bullets li {
        line-height: 1.45;
        opacity: 0.9;
      }

      .tldr-bullets li::marker { color: var(--tldr-accent, #a78bfa); }

      .tldr-verdict {
        margin-top: 4px;
        padding: 10px 14px;
        background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
        border: 1px solid var(--tldr-border, rgba(255,255,255,0.08));
        border-radius: 10px;
        font-weight: 500;
        line-height: 1.5;
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }

      .tldr-verdict-icon {
        font-size: 14px;
        flex-shrink: 0;
        filter: drop-shadow(0 0 4px rgba(250, 204, 21, 0.5));
      }

      .tldr-empty, .tldr-error {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 20px;
        opacity: 0.7;
        font-style: italic;
      }

      .tldr-empty-icon, .tldr-error-icon { font-size: 24px; }

      .tldr-loaded .tldr-result {
        animation: tldr-fade-in 0.3s ease;
      }

      @keyframes tldr-fade-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
  }
})();
