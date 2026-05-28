// Options page logic

const $ = id => document.getElementById(id);

const DEFAULTS = {
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  ollama: 'llama3.2',
  lmstudio: 'default'
};

// Load saved settings
chrome.storage.sync.get({
  provider: 'gemini', apiKey: '', model: '', ollamaUrl: 'http://localhost:11434'
}, (s) => {
  $('provider').value = s.provider;
  $('apikey').value = s.apiKey;
  $('model').value = s.model;
  $('model').placeholder = DEFAULTS[s.provider] || '';
  $('ollama-url').value = s.ollamaUrl;
  toggleOllama(s.provider);
});

// Provider change → show/hide Ollama fields, update model placeholder
$('provider').addEventListener('change', () => {
  const p = $('provider').value;
  toggleOllama(p);
  $('model').placeholder = DEFAULTS[p] || '';
});

function toggleOllama(provider) {
  const isLocal = provider === 'ollama' || provider === 'lmstudio';
  $('ollama-group').classList.toggle('hidden', !isLocal);
  $('apikey-group').classList.toggle('hidden', isLocal);
}

// Show/hide API key
$('toggle-key').addEventListener('click', () => {
  const input = $('apikey');
  input.type = input.type === 'password' ? 'text' : 'password';
});

// Save
$('save-btn').addEventListener('click', () => {
  chrome.storage.sync.set({
    provider: $('provider').value,
    apiKey: $('apikey').value,
    model: $('model').value,
    ollamaUrl: $('ollama-url').value || 'http://localhost:11434'
  }, () => showStatus('Saved ✓', 'success'));
});

// Test connection — sends a tiny prompt to verify API key works
$('test-btn').addEventListener('click', async () => {
  showStatus('Testing...', 'success');
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'SUMMARIZE_REQUEST',
      title: 'Test',
      url: 'https://test.com',
      text: 'This is a test page with some content about testing the connection.'
    });
    if (result.error) {
      showStatus(`Failed: ${result.error}`, 'error');
    } else {
      showStatus('Connection works! ✓', 'success');
    }
  } catch (e) {
    showStatus(`Error: ${e.message}`, 'error');
  }
});

function showStatus(msg, type) {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${type}`;
  setTimeout(() => el.className = 'status hidden', 4000);
}
