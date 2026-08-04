// Tema — cor de destaque (accent) personalizável pelo usuário.
//
// O app inteiro usa um único token de cor (--gold, com as variações
// --gold-pale/--gold-dim) pra tudo que é interativo/de destaque: botões,
// nav ativa, barras de XP, badges, bordas. Esta camada deixa o usuário
// escolher qualquer cor (ou um preset) que substitui esse token globalmente
// via CSS custom properties, sem precisar tocar em cada componente.
//
// Não muda os tons de fundo (--void/--panel) nem o efeito decorativo de
// sombra dourado+azul dos títulos grandes (é a assinatura visual do app,
// ver CLAUDE.md) — só a cor de destaque funcional.
//
// É preferência de dispositivo, não progresso: "Zerar todo o progresso"
// não mexe nela (mesmo tratamento da foto de perfil).

(function () {
  const KEY = 'mestre-theme';
  const DEFAULT_HEX = '#D4AF37';

  const PRESETS = [
    { key: 'gold', name: 'Dourado', hex: '#D4AF37' },
    { key: 'blue', name: 'Azul', hex: '#5C7FE0' },
    { key: 'rose', name: 'Rosa', hex: '#C9515F' },
    { key: 'teal', name: 'Verde-água', hex: '#3FB88F' },
    { key: 'purple', name: 'Roxo', hex: '#8B6FD4' },
    { key: 'orange', name: 'Laranja', hex: '#D98A4A' },
  ];

  function clamp(n) { return Math.max(0, Math.min(255, n)); }
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : hexToRgb(DEFAULT_HEX);
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => clamp(Math.round(v)).toString(16).padStart(2, '0')).join('');
  }
  function mix(hex, targetHex, amount) {
    const c = hexToRgb(hex), t = hexToRgb(targetHex);
    return rgbToHex(c.r + (t.r - c.r) * amount, c.g + (t.g - c.g) * amount, c.b + (t.b - c.b) * amount);
  }
  // Deriva as variações pale (mais clara, pra texto sobre fundo escuro) e
  // dim (mais escura, pra estados sutis) a partir de uma única cor base —
  // mesma relação que --gold/--gold-pale/--gold-dim já tinham entre si.
  function deriveShades(hex) {
    return { accent: hex, pale: mix(hex, '#FFFFFF', 0.55), dim: mix(hex, '#000000', 0.42) };
  }

  function apply(hex) {
    const shades = deriveShades(hex);
    const root = document.documentElement;
    root.style.setProperty('--user-gold', shades.accent);
    root.style.setProperty('--user-gold-pale', shades.pale);
    root.style.setProperty('--user-gold-dim', shades.dim);
  }

  function getAccent() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const t = JSON.parse(raw);
        if (t.accent) return t.accent;
      }
    } catch (e) { /* usa o padrão */ }
    return DEFAULT_HEX;
  }

  function setAccent(hex) {
    localStorage.setItem(KEY, JSON.stringify({ accent: hex }));
    apply(hex);
  }

  function resetAccent() { setAccent(DEFAULT_HEX); }

  function init() { apply(getAccent()); }

  // ---------------------------------------------------------------
  // UI — painel "Aparência" na view Perfil (index.html)
  // ---------------------------------------------------------------
  function pdmRenderThemeSettings() {
    const input = document.getElementById('pdmThemeColorInput');
    const presetsEl = document.getElementById('pdmThemePresets');
    if (!input || !presetsEl) return;
    const current = getAccent();
    input.value = current;
    presetsEl.innerHTML = PRESETS.map((p) =>
      '<div class="pdm-color-swatch' + (p.hex.toLowerCase() === current.toLowerCase() ? ' active' : '') + '" style="background:' + p.hex + ';" title="' + p.name + '" onclick="pdmApplyThemeAccent(\'' + p.hex + '\')"></div>'
    ).join('');
  }

  function pdmApplyThemeAccent(hex) {
    setAccent(hex);
    pdmRenderThemeSettings();
    if (window.pdmToast) window.pdmToast('Cor do app atualizada.');
  }

  function pdmResetThemeAccent() {
    resetAccent();
    pdmRenderThemeSettings();
    if (window.pdmToast) window.pdmToast('Cor padrão restaurada.');
  }

  window.PdmTheme = {
    init, apply, getAccent, setAccent, resetAccent,
    getPresets: () => PRESETS.slice(),
    DEFAULT_HEX,
  };
  Object.assign(window, { pdmRenderThemeSettings, pdmApplyThemeAccent, pdmResetThemeAccent });
})();
