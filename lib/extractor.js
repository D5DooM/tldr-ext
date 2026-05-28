// Smart content extraction — strips noise, keeps article body

const TldrExtractor = {
  // Selectors to remove before extraction
  NOISE_SELECTORS: [
    'nav', 'footer', 'header', 'aside', '[role="navigation"]', '[role="banner"]',
    '[role="contentinfo"]', '.nav', '.navbar', '.footer', '.sidebar', '.ad', '.ads',
    '.advertisement', '[class*="cookie"]', '[class*="popup"]', '[class*="modal"]',
    '[class*="newsletter"]', '[class*="subscribe"]', 'script', 'style', 'noscript',
    'iframe', 'svg', 'form', '[aria-hidden="true"]'
  ],

  // Priority selectors for main content
  CONTENT_SELECTORS: [
    'article', '[role="main"]', 'main', '.post-content', '.article-content',
    '.entry-content', '.content', '#content', '.post-body', '.story-body'
  ],

  extract() {
    const title = document.title || '';
    const url = location.href;

    // Clone body so we don't mutate the actual page
    const clone = document.body.cloneNode(true);

    // Remove noise elements
    this.NOISE_SELECTORS.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    // Try priority content selectors
    let text = '';
    for (const sel of this.CONTENT_SELECTORS) {
      const el = clone.querySelector(sel);
      if (el && el.innerText.trim().length > 200) {
        text = el.innerText;
        break;
      }
    }

    // Fallback: find largest text-dense div
    if (!text) {
      let best = null, bestLen = 0;
      clone.querySelectorAll('div, section').forEach(el => {
        const len = el.innerText?.trim().length || 0;
        if (len > bestLen) { bestLen = len; best = el; }
      });
      text = best?.innerText || clone.innerText || '';
    }

    // Clean and truncate
    text = text.replace(/\s+/g, ' ').trim().slice(0, 6000);

    return { title, url, text };
  }
};
