// Reconhecimento de alimento por foto — usa a API do Gemini (Google AI),
// chamada direto do navegador com uma chave que o PRÓPRIO usuário cria e
// cola no app (mesmo padrão do Google Agenda: credencial do Google restrita
// por domínio, guardada só em localStorage neste aparelho, nunca em
// window.storage — é preferência de dispositivo, não progresso).
//
// Diferença importante em relação ao Client ID do Google Agenda: uma chave
// de API do Gemini autoriza chamadas cobráveis (mesmo que dentro da faixa
// gratuita), então ela SÓ é seguro expor no app se for restrita por
// referenciador HTTP (HTTP referrer) no Google AI Studio/Cloud Console, ao
// domínio onde o app está publicado — isso é explicado no modal de config
// (#pdmGeminiConfigModal). Sem essa restrição, qualquer pessoa que inspecione
// o app no navegador poderia copiar a chave.
//
// Sem SDK: a API do Gemini é um REST simples (fetch direto), não precisa de
// script carregado sob demanda como o Firebase.

(function () {
  const KEY = 'mestre-gemini-api-key';
  // Modelo com suporte a visão + saída em JSON. Se a Google descontinuar
  // este nome de modelo no futuro, troque só esta constante.
  const MODEL = 'gemini-2.0-flash';

  function getApiKey() { return (localStorage.getItem(KEY) || '').trim(); }
  function setApiKey(key) { localStorage.setItem(KEY, (key || '').trim()); }
  function clearApiKey() { localStorage.removeItem(KEY); }
  function isConfigured() { return !!getApiKey(); }

  function dataUrlToBase64(dataUrl) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
    if (!m) throw new Error('invalid-image-data');
    return { mime: m[1], base64: m[2] };
  }

  const PROMPT = 'Você é um nutricionista analisando uma foto de comida. ' +
    'Identifique o alimento ou prato principal visível na foto e estime seus ' +
    'valores nutricionais. Responda SOMENTE com um JSON no formato exato: ' +
    '{"name": "nome do alimento em português", "estimatedGrams": número (porção ' +
    'visível na foto, em gramas), "kcal100": número (calorias por 100g), ' +
    '"protein100": número (proteína em g por 100g), "carbs100": número ' +
    '(carboidratos em g por 100g), "fat100": número (gordura em g por 100g)}. ' +
    'Use sua melhor estimativa com base em tabelas nutricionais conhecidas. ' +
    'Não inclua texto além do JSON.';

  // Retorna { name, estimatedGrams, kcal100, protein100, carbs100, fat100 } —
  // mesmo formato "por 100g + porção" das buscas por nome, pra reusar a
  // mesma tela de confirmação de porção na UI.
  async function recognizeFood(imageDataUrl) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('gemini-not-configured');
    const { mime, base64 } = dataUrlToBase64(imageDataUrl);
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);
    const body = {
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: base64 } }] }],
      generationConfig: { responseMimeType: 'application/json' },
    };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('gemini-api-' + res.status + ': ' + text.slice(0, 200));
    }
    const data = await res.json();
    const text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (!text) throw new Error('gemini-empty-response');
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { throw new Error('gemini-invalid-json'); }
    return {
      name: String(parsed.name || 'Alimento não identificado'),
      estimatedGrams: Math.round(Number(parsed.estimatedGrams) || 100),
      kcal100: Number(parsed.kcal100) || 0,
      protein100: Number(parsed.protein100) || 0,
      carbs100: Number(parsed.carbs100) || 0,
      fat100: Number(parsed.fat100) || 0,
    };
  }

  window.PdmDietAI = { getApiKey, setApiKey, clearApiKey, isConfigured, recognizeFood };
})();
