// Service worker — toggle state, LLM calls, cache management

// Provider adapters (inlined — importScripts not reliable in MV3)
const PROVIDERS = {
  gemini: {
    name: 'Gemini',
    defaultModel: 'gemini-2.0-flash',
    async call(apiKey, model, systemPrompt, userPrompt) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
        })
      });
      if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    async call(apiKey, model, systemPrompt, userPrompt) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          temperature: 0.3, max_tokens: 1024
        })
      });
      if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }
  },
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    async call(apiKey, model, systemPrompt, userPrompt) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'x-api-key': apiKey,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-20250514', max_tokens: 1024,
          system: systemPrompt, messages: [{ role: 'user', content: userPrompt }]
        })
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.content?.[0]?.text || '';
    }
  },
  ollama: {
    name: 'Ollama',
    defaultModel: 'llama3.2',
    async call(apiKey, model, systemPrompt, userPrompt, baseUrl) {
      const url = `${baseUrl || 'http://localhost:11434'}/api/generate`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llama3.2', system: systemPrompt,
          prompt: userPrompt, stream: false, options: { temperature: 0.3 }
        })
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.response || '';
    }
  },
  lmstudio: {
    name: 'LM Studio',
    defaultModel: 'default',
    async call(apiKey, model, systemPrompt, userPrompt, baseUrl) {
      const url = `${baseUrl || 'http://localhost:1234'}/v1/chat/completions`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'default',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          temperature: 0.3, max_tokens: 1024
        })
      });
      if (!res.ok) throw new Error(`LM Studio ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }
  }
};

// System prompt from prompt.md
const SYSTEM_PROMPT = `You are a silent web page analyst built into a browser extension.
You read raw webpage text and return only structured, scannable information.
You never explain yourself. You never add filler. You only extract.

─────────────────────────────────────────
STEP 1 — DETECT PAGE TYPE
─────────────────────────────────────────
Read the content and classify the page as exactly one of:

  JOB        → job listing, internship, fellowship, apprenticeship
  ARTICLE    → blog post, news article, opinion piece, editorial
  PRODUCT    → e-commerce item, SaaS tool, app landing page
  RESEARCH   → academic paper, technical documentation, whitepaper
  VIDEO      → YouTube, Vimeo, or any video page
  OTHER      → anything that does not fit the above

─────────────────────────────────────────
STEP 2 — EXTRACT BY TYPE
─────────────────────────────────────────

── IF JOB ──────────────────────────────

**Role:** [exact job title from page]
**Company:** [company name]
**Location:** [city, country / Remote / Hybrid — pick what's stated]
**Stipend or Salary:** [exact figure or range — never estimate]
**Type:** [Internship / Full-time / Contract / Volunteer / Part-time]
**Deadline:** [application deadline or last date]

**What you'll do:**
- [duty 1 — max 45 words]
- [duty 2 — max 45 words]
- [duty 3 — max 45 words]
- [duty 4 — max 45 words]
(maximum 4 bullets. hard requirements only. no soft skills.)

**What they want:**
- [requirement 1 — max 45 words]
- [requirement 2 — max 45 words]
- [requirement 3 — max 45 words]
(maximum 3 bullets. only non-negotiable requirements.)

**Verdict:**
[One sentence. Who should apply and why. Be direct.]

── IF ARTICLE ──────────────────────────

**Topic:** [what the article is actually about in 6 words or less]
**Written by:** [author name or "Not mentioned"]
**Published:** [date or "Not mentioned"]

**Key points:**
- [point 1 — max 45 words]
- [point 2 — max 45 words]
- [point 3 — max 45 words]
- [point 4 — max 45 words]

**Bottom line:**
[One sentence. The single thing worth remembering from this article.]

── IF PRODUCT ──────────────────────────

**Product:** [product name]
**Price:** [exact price or "Not mentioned"]
**What it does:** [one line, plain English, no marketing language]

**Why you'd want it:**
- [benefit 1 — max 45 words]
- [benefit 2 — max 45 words]
- [benefit 3 — max 45 words]

**Worth it if:** [one sentence — describe the ideal buyer]

── IF RESEARCH ─────────────────────────

**Title:** [paper or doc title]
**Field:** [subject area in 3 words]
**Problem it solves:** [one plain-English sentence]

**Key findings:**
- [finding 1 — max 45 words]
- [finding 2 — max 45 words]
- [finding 3 — max 45 words]

**Read it if:** [one sentence — who benefits from this paper]

── IF VIDEO ────────────────────────────

**Title:** [video title]
**Creator:** [channel or creator name]
**Duration:** [runtime if visible, else "Not mentioned"]
**What it covers:** [one line, plain English]

**Main points:**
- [point 1 — max 45 words]
- [point 2 — max 45 words]
- [point 3 — max 45 words]

**Watch it if:** [one sentence — who gets the most value from this]

── IF OTHER ────────────────────────────

**Page is about:** [6 words max]

**Key points:**
- [point 1 — max 45 words]
- [point 2 — max 45 words]
- [point 3 — max 45 words]

**One-liner:** [single sentence summary]

─────────────────────────────────────────
STRICT RULES — never break these
─────────────────────────────────────────
1. If a field is not on the page → write "Not mentioned". Never guess.
2. Every bullet must be under 45 words. No exceptions.
3. Verdict / Bottom line / One-liner = exactly one sentence. No more.
4. Do not write any text before or after the formatted output.
5. Do not explain what you are doing.
6. Do not add headers like "Here is the TL;DR:" — start the output directly.
7. If the page has no meaningful content (login wall, blank page, 404) →
   respond with only: EMPTY_PAGE`;

// Toggle extension on/off on icon click
chrome.action.onClicked.addListener(async (tab) => {
  const { enabled } = await chrome.storage.local.get({ enabled: false });
  const newState = !enabled;
  await chrome.storage.local.set({ enabled: newState });

  // Update badge
  chrome.action.setBadgeText({ text: newState ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: newState ? '#22c55e' : '#6b7280' });

  // Notify active tab
  try {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE', enabled: newState });
  } catch (e) { /* tab may not have content script */ }

  // If turning on, trigger summarize on current tab
  if (newState) {
    try {
      chrome.tabs.sendMessage(tab.id, { type: 'SUMMARIZE' });
    } catch (e) {}
  }
});

// Restore badge on startup
chrome.runtime.onStartup.addListener(async () => {
  const { enabled } = await chrome.storage.local.get({ enabled: false });
  chrome.action.setBadgeText({ text: enabled ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#22c55e' : '#6b7280' });
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SUMMARIZE_REQUEST') {
    handleSummarize(msg).then(sendResponse).catch(err => {
      sendResponse({ error: err.message || 'Unknown error' });
    });
    return true; // async response
  }

  if (msg.type === 'GET_STATE') {
    chrome.storage.local.get({ enabled: false }).then(sendResponse);
    return true;
  }

  if (msg.type === 'CHECK_CACHE') {
    chrome.storage.local.get({ cache: {} }).then(({ cache }) => {
      sendResponse(cache[msg.url] || null);
    });
    return true;
  }

  if (msg.type === 'GET_HISTORY') {
    chrome.storage.local.get({ history: [] }).then(sendResponse);
    return true;
  }

  if (msg.type === 'CLEAR_HISTORY') {
    chrome.storage.local.set({ history: [], cache: {} }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'DELETE_HISTORY_ITEM') {
    deleteHistoryItem(msg.url).then(sendResponse);
    return true;
  }
});

async function handleSummarize({ title, url, text }) {
  // Check cache first
  const { cache } = await chrome.storage.local.get({ cache: {} });
  if (cache[url]) return cache[url];

  // Get provider settings
  const settings = await chrome.storage.sync.get({
    provider: 'gemini', apiKey: '', model: '', ollamaUrl: 'http://localhost:11434'
  });

  if (!settings.apiKey && settings.provider !== 'ollama' && settings.provider !== 'lmstudio') {
    return { error: 'No API key set. Right-click extension icon → Options.' };
  }

  const provider = PROVIDERS[settings.provider];
  if (!provider) return { error: `Unknown provider: ${settings.provider}` };

  const userPrompt = `Page title: ${title}\nURL: ${url}\n\n---\n${text}\n---`;

  try {
    const raw = await provider.call(
      settings.apiKey, settings.model, SYSTEM_PROMPT, userPrompt, settings.ollamaUrl
    );

    const result = { raw, url, title, timestamp: Date.now() };

    // Cache the result
    cache[url] = result;

    // Cap cache at 200 entries
    const keys = Object.keys(cache);
    if (keys.length > 200) {
      const oldest = keys.sort((a, b) => (cache[a].timestamp || 0) - (cache[b].timestamp || 0));
      delete cache[oldest[0]];
    }
    await chrome.storage.local.set({ cache });

    // Add to history
    const { history } = await chrome.storage.local.get({ history: [] });
    history.unshift({ url, title, timestamp: Date.now(), type: detectType(raw) });
    if (history.length > 200) history.pop();
    await chrome.storage.local.set({ history });

    return result;
  } catch (err) {
    return { error: err.message || 'API call failed' };
  }
}

function detectType(raw) {
  if (/^\*\*Role:\*\*/m.test(raw)) return 'JOB';
  if (/^\*\*Topic:\*\*/m.test(raw)) return 'ARTICLE';
  if (/^\*\*Product:\*\*/m.test(raw)) return 'PRODUCT';
  if (/^\*\*Field:\*\*/m.test(raw)) return 'RESEARCH';
  if (/^\*\*Creator:\*\*/m.test(raw)) return 'VIDEO';
  return 'OTHER';
}

async function deleteHistoryItem(url) {
  const { history, cache } = await chrome.storage.local.get({ history: [], cache: {} });
  const filtered = history.filter(h => h.url !== url);
  delete cache[url];
  await chrome.storage.local.set({ history: filtered, cache });
  return { ok: true };
}
