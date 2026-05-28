// Extracts dominant colors from the page for adaptive theming

const TldrColors = {
  extract() {
    const samples = [];

    // Sample bg color from body and key elements
    const targets = [document.body, document.querySelector('main'),
      document.querySelector('article'), document.querySelector('header')];

    targets.forEach(el => {
      if (!el) return;
      const style = getComputedStyle(el);
      if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        samples.push(this.parseColor(style.backgroundColor));
      }
    });

    // Sample text color
    const textEl = document.querySelector('p, h1, h2') || document.body;
    const textColor = getComputedStyle(textEl).color;

    // Determine if page is dark or light
    const pageBg = samples[0] || { r: 255, g: 255, b: 255 };
    const brightness = (pageBg.r * 299 + pageBg.g * 587 + pageBg.b * 114) / 1000;
    const isDark = brightness < 128;

    // Generate adaptive palette
    if (isDark) {
      return {
        bg: this.rgbShift(pageBg, 20, 0.85),     // slightly lighter, semi-transparent
        text: this.lighten(pageBg, 180),
        accent: this.saturate(pageBg, 40, 60),
        border: this.rgbShift(pageBg, 40, 0.3),
        isDark: true
      };
    } else {
      return {
        bg: this.rgbShift(pageBg, -20, 0.9),     // slightly darker tint
        text: this.darken(pageBg, 180),
        accent: this.saturate(pageBg, -30, 50),
        border: this.rgbShift(pageBg, -30, 0.2),
        isDark: false
      };
    }
  },

  parseColor(str) {
    const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3] } : { r: 128, g: 128, b: 128 };
  },

  rgbShift({ r, g, b }, amount, alpha) {
    const clamp = v => Math.max(0, Math.min(255, v + amount));
    return `rgba(${clamp(r)}, ${clamp(g)}, ${clamp(b)}, ${alpha})`;
  },

  lighten({ r, g, b }, amount) {
    const clamp = v => Math.min(255, v + amount);
    return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
  },

  darken({ r, g, b }, amount) {
    const clamp = v => Math.max(0, v - amount);
    return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
  },

  saturate({ r, g, b }, hueShift, boost) {
    // Simple accent: boost the most prominent channel
    const max = Math.max(r, g, b);
    return `rgb(${r === max ? Math.min(255, r + boost) : r}, ${g === max ? Math.min(255, g + boost) : g}, ${b === max ? Math.min(255, b + boost) : b})`;
  },

  applyToHost(host, colors) {
    host.style.setProperty('--tldr-bg', colors.bg);
    host.style.setProperty('--tldr-text', colors.text);
    host.style.setProperty('--tldr-accent', colors.accent);
    host.style.setProperty('--tldr-border', colors.border);
    host.style.setProperty('--tldr-dark', colors.isDark ? '1' : '0');
  }
};
