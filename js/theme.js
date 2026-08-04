// Tema — modo (escuro/claro) e cor de destaque (accent), personalizáveis
// pelo usuário.
//
// O app inteiro usa um punhado de tokens de cor (--void/--panel pro fundo,
// --gold/--gold-pale/--gold-dim pro destaque) reaproveitados em tudo que é
// interativo: botões, nav ativa, barras de XP, badges, bordas. Esta camada
// deixa o usuário trocar tanto o modo (escuro navy, o padrão histórico do
// app, ou claro com tons pastel) quanto a cor de destaque dentro de cada
// modo — sem precisar tocar em cada componente.
//
// Cada modo guarda sua própria cor de destaque (trocar de modo não perde a
// escolha feita no outro) e tem seus próprios presets/padrão, porque uma
// cor que funciona bem sobre navy escuro não necessariamente funciona bem
// sobre um fundo claro (e vice-versa) — ver deriveShades() abaixo.
//
// Não muda o efeito decorativo de sombra dourado+azul dos títulos grandes
// (é a assinatura visual do app, ver CLAUDE.md) — isso fica igual nos dois
// modos.
//
// É preferência de dispositivo, não progresso: "Zerar todo o progresso"
// não mexe nela (mesmo tratamento da foto de perfil).

(function () {
  const KEY = 'mestre-theme';
  const DEFAULT_HEX_DARK = '#D4AF37';
  const DEFAULT_HEX_LIGHT = '#D9639D';

  const PRESETS_DARK = [
    { key: 'gold', name: 'Dourado', hex: '#D4AF37' },
    { key: 'blue', name: 'Azul', hex: '#5C7FE0' },
    { key: 'rose', name: 'Rosa', hex: '#C9515F' },
    { key: 'teal', name: 'Verde-água', hex: '#3FB88F' },
    { key: 'purple', name: 'Roxo', hex: '#8B6FD4' },
    { key: 'orange', name: 'Laranja', hex: '#D98A4A' },
  ];
  const PRESETS_LIGHT = [
    { key: 'rose', name: 'Rosa', hex: '#D9639D' },
    { key: 'lilac', name: 'Lilás', hex: '#A88BD9' },
    { key: 'peach', name: 'Pêssego', hex: '#E8996B' },
    { key: 'mint', name: 'Menta', hex: '#3FA98A' },
    { key: 'sky', name: 'Céu', hex: '#6690D9' },
    { key: 'coral', name: 'Coral', hex: '#DC6D6D' },
  ];

  function clamp(n) { return Math.max(0, Math.min(255, n)); }
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : hexToRgb(DEFAULT_HEX_DARK);
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => clamp(Math.round(v)).toString(16).padStart(2, '0')).join('');
  }
  function mix(hex, targetHex, amount) {
    const c = hexToRgb(hex), t = hexToRgb(targetHex);
    return rgbToHex(c.r + (t.r - c.r) * amount, c.g + (t.g - c.g) * amount, c.b + (t.b - c.b) * amount);
  }
  // No modo escuro, "pale" é mais clara que a base (pra texto pop sobre
  // fundo escuro) e "dim" é mais escura (discreta). No modo claro essa
  // relação se inverte — "pale" continua sendo o tom usado como texto de
  // destaque, só que agora precisa ser mais ESCURO que a base pra ler bem
  // sobre um fundo claro; "dim" (bordas/traços sutis) fica mais claro.
  function deriveShades(hex, mode) {
    if (mode === 'light') {
      return { accent: hex, pale: mix(hex, '#000000', 0.35), dim: mix(hex, '#FFFFFF', 0.55) };
    }
    return { accent: hex, pale: mix(hex, '#FFFFFF', 0.55), dim: mix(hex, '#000000', 0.42) };
  }

  function readStore() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeStore(obj) { localStorage.setItem(KEY, JSON.stringify(obj)); }

  function getMode() { return readStore().mode === 'light' ? 'light' : 'dark'; }

  function getAccent(mode) {
    mode = mode || getMode();
    const s = readStore();
    const stored = mode === 'light' ? s.accentLight : s.accentDark;
    if (stored) return stored;
    return mode === 'light' ? DEFAULT_HEX_LIGHT : DEFAULT_HEX_DARK;
  }

  function apply(hex, mode) {
    mode = mode || getMode();
    const shades = deriveShades(hex, mode);
    const root = document.documentElement;
    root.style.setProperty('--user-gold', shades.accent);
    root.style.setProperty('--user-gold-pale', shades.pale);
    root.style.setProperty('--user-gold-dim', shades.dim);
    const pdmRoot = document.getElementById('pdmRoot');
    if (pdmRoot) {
      if (mode === 'light') pdmRoot.setAttribute('data-theme', 'light');
      else pdmRoot.removeAttribute('data-theme');
    }
  }

  function setAccent(hex) {
    const mode = getMode();
    const s = readStore();
    if (mode === 'light') s.accentLight = hex; else s.accentDark = hex;
    writeStore(s);
    apply(hex, mode);
  }

  function setMode(mode) {
    mode = mode === 'light' ? 'light' : 'dark';
    const s = readStore();
    s.mode = mode;
    writeStore(s);
    apply(getAccent(mode), mode);
  }

  function resetAccent() {
    const mode = getMode();
    const s = readStore();
    if (mode === 'light') delete s.accentLight; else delete s.accentDark;
    writeStore(s);
    apply(getAccent(mode), mode);
  }

  function init() {
    const mode = getMode();
    apply(getAccent(mode), mode);
  }

  // ---------------------------------------------------------------
  // UI — painel "Aparência" na view Perfil (index.html)
  // ---------------------------------------------------------------
  function pdmRenderThemeSettings() {
    const input = document.getElementById('pdmThemeColorInput');
    const presetsEl = document.getElementById('pdmThemePresets');
    const modeEscuroBtn = document.getElementById('pdmThemeModeEscuro');
    const modeClaroBtn = document.getElementById('pdmThemeModeClaro');
    if (!input || !presetsEl) return;
    const mode = getMode();
    const current = getAccent(mode);
    input.value = current;
    presetsEl.innerHTML = (mode === 'light' ? PRESETS_LIGHT : PRESETS_DARK).map((p) =>
      '<div class="pdm-color-swatch' + (p.hex.toLowerCase() === current.toLowerCase() ? ' active' : '') + '" style="background:' + p.hex + ';" title="' + p.name + '" onclick="pdmApplyThemeAccent(\'' + p.hex + '\')"></div>'
    ).join('');
    if (modeEscuroBtn) modeEscuroBtn.classList.toggle('active', mode === 'dark');
    if (modeClaroBtn) modeClaroBtn.classList.toggle('active', mode === 'light');
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

  function pdmSetThemeMode(mode) {
    setMode(mode);
    pdmRenderThemeSettings();
    if (window.pdmToast) window.pdmToast(mode === 'light' ? 'Modo claro ativado.' : 'Modo escuro ativado.');
  }

  window.PdmTheme = {
    init, apply, getMode, setMode, getAccent, setAccent, resetAccent,
    getPresets: (mode) => (mode === 'light' ? PRESETS_LIGHT : PRESETS_DARK).slice(),
    DEFAULT_HEX_DARK, DEFAULT_HEX_LIGHT,
  };
  Object.assign(window, { pdmRenderThemeSettings, pdmApplyThemeAccent, pdmResetThemeAccent, pdmSetThemeMode });
})();
