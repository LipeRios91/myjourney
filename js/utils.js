// Utilitários de data/formatação compartilhados por toda a aplicação.
// Carregado antes de qualquer outro módulo — funções ficam globais (sem <script type="module">).

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function monthISO() { return todayISO().slice(0, 7); }
function dayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function isoToDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dateToISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDaysISO(iso, n) {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + n);
  return dateToISO(d);
}
function weekdayOf(iso) { return isoToDate(iso).getDay(); }

const WEEKDAY_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatDateLabel(iso) {
  const today = todayISO();
  if (iso === today) return 'Hoje';
  if (iso === addDaysISO(today, 1)) return 'Amanhã';
  if (iso === addDaysISO(today, -1)) return 'Ontem';
  return isoToDate(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}
function formatDateFull(iso) {
  return isoToDate(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function clampPct(n) { return Math.max(0, Math.min(100, n)); }

// ---------------------------------------------------------------
// HELPERS DE MARKUP DE FORMULÁRIO — compartilhados por qualquer módulo de UI
// (js/habits-missions-ui.js, js/goals-ui.js, e futuros).
// ---------------------------------------------------------------
function field(label, inner) { return '<div class="pdm-field"><label>' + label + '</label>' + inner + '</div>'; }
function buildSegmented(options, activeVal, handlerName) {
  return '<div class="pdm-segmented">' + options.map(([val, label]) =>
    '<button type="button" class="' + (val === activeVal ? 'active' : '') + '" onclick="' + handlerName + '(\'' + val + '\')">' + label + '</button>'
  ).join('') + '</div>';
}
function statTile(value, label) { return '<div class="pdm-stat-tile"><b>' + value + '</b><span>' + label + '</span></div>'; }
function captureFormValues(ids) {
  const vals = {};
  ids.forEach((id) => { const el = document.getElementById(id); if (el) vals[id] = el.value; });
  return vals;
}
function restoreFormValues(ids, vals) {
  ids.forEach((id) => { const el = document.getElementById(id); if (el && vals[id] !== undefined) el.value = vals[id]; });
}
