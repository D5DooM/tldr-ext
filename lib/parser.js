// Parses structured LLM output into a data object

const TldrParser = {
  // Type detection patterns
  TYPE_PATTERNS: {
    JOB: /^\*\*Role:\*\*/m,
    ARTICLE: /^\*\*Topic:\*\*/m,
    PRODUCT: /^\*\*Product:\*\*/m,
    RESEARCH: /^\*\*Title:\*\*.*\n\*\*Field:\*\*/m,
    VIDEO: /^\*\*Title:\*\*.*\n\*\*Creator:\*\*/m,
    OTHER: /^\*\*Page is about:\*\*/m
  },

  // Verdict-like field names per type
  VERDICT_FIELDS: [
    'Verdict', 'Bottom line', 'Worth it if', 'Read it if',
    'Watch it if', 'One-liner'
  ],

  parse(raw) {
    if (!raw || typeof raw !== 'string') return { type: 'ERROR', error: 'No response' };

    const trimmed = raw.trim();
    if (trimmed === 'EMPTY_PAGE') return { type: 'EMPTY_PAGE' };

    // Detect type
    let type = 'OTHER';
    for (const [t, pattern] of Object.entries(this.TYPE_PATTERNS)) {
      if (pattern.test(trimmed)) { type = t; break; }
    }

    const fields = [];
    const bullets = [];
    let verdict = '';
    let currentBulletGroup = null;

    const lines = trimmed.split('\n');

    for (const line of lines) {
      const l = line.trim();
      if (!l) { currentBulletGroup = null; continue; }

      // Field: **Label:** Value
      const fieldMatch = l.match(/^\*\*(.+?):\*\*\s*(.*)$/);
      if (fieldMatch && !l.startsWith('- ')) {
        const label = fieldMatch[1];
        const value = fieldMatch[2] || '';

        if (this.VERDICT_FIELDS.includes(label)) {
          verdict = value;
        } else if (!value && !l.startsWith('- ')) {
          // Section header like **Key points:**
          currentBulletGroup = { heading: label, items: [] };
          bullets.push(currentBulletGroup);
        } else {
          fields.push({ label, value });
        }
        continue;
      }

      // Bullet point
      const bulletMatch = l.match(/^-\s+(.+)$/);
      if (bulletMatch) {
        if (!currentBulletGroup) {
          currentBulletGroup = { heading: '', items: [] };
          bullets.push(currentBulletGroup);
        }
        currentBulletGroup.items.push(bulletMatch[1]);
        continue;
      }

      // Standalone verdict line (no bold markers)
      if (!verdict && lines.indexOf(line) === lines.length - 1) {
        verdict = l;
      }
    }

    return { type, fields, bullets, verdict };
  }
};
