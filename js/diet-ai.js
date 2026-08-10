// IA (Gemini, Google AI) aplicada à Dieta de duas formas — reconhecimento
// por FOTO e estimativa por NOME (quando a busca por nome não acha nada na
// base local nem no Open Food Facts). As duas usam a mesma chave/config
// (#pdmGeminiConfigModal): credencial que o PRÓPRIO usuário cria e cola no
// app (mesmo padrão do Google Agenda: restrita por domínio, guardada só em
// localStorage neste aparelho, nunca em window.storage — é preferência de
// dispositivo, não progresso).
//
// Diferença importante em relação ao Client ID do Google Agenda: uma chave
// de API do Gemini autoriza chamadas cobráveis (mesmo que dentro da faixa
// gratuita), então ela SÓ é seguro expor no app se for restrita por
// referenciador HTTP (HTTP referrer) no Google AI Studio/Cloud Console, ao
// domínio onde o app está publicado — isso é explicado no modal de config.
// Sem essa restrição, qualquer pessoa que inspecione o app no navegador
// poderia copiar a chave.
//
// Sem SDK: a API do Gemini é um REST simples (fetch direto), não precisa de
// script carregado sob demanda como o Firebase.

(function () {
  const KEY = 'mestre-gemini-api-key';
  // Modelo com suporte a visão + texto + saída em JSON. Se a Google
  // descontinuar este nome de modelo no futuro, troque só esta constante.
  // Histórico: 'gemini-2.0-flash' devolvia 429 (sem cota gratuita pra chave
  // nova); 'gemini-2.5-flash' devolvia 404 ("no longer available to new
  // users" — a família 2.5 inteira será desligada em out/2026). Confirmado
  // via docs oficiais (ai.google.dev, agosto/2026): gemini-3.6-flash é o
  // modelo GA atual, elegível pro nível gratuito, com suporte a imagem.
  const MODEL = 'gemini-3.6-flash';

  function getApiKey() { return (localStorage.getItem(KEY) || '').trim(); }
  function setApiKey(key) { localStorage.setItem(KEY, (key || '').trim()); }
  function clearApiKey() { localStorage.removeItem(KEY); }
  function isConfigured() { return !!getApiKey(); }

  function dataUrlToBase64(dataUrl) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
    if (!m) throw new Error('invalid-image-data');
    return { mime: m[1], base64: m[2] };
  }

  // Chamada de baixo nível compartilhada pelas duas features (foto/texto) —
  // envia as `parts` do prompt, pede saída em JSON, valida e devolve o
  // objeto já no formato "por 100g + porção" que a UI usa pra confirmar a
  // porção antes de salvar (mesmo formato de PdmFoodSearch.searchByName).
  async function callGemini(parts) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('gemini-not-configured');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);
    const body = {
      contents: [{ parts }],
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

  const PHOTO_PROMPT = 'Você é um nutricionista analisando uma foto de comida. ' +
    'Identifique o alimento ou prato principal visível na foto e estime seus ' +
    'valores nutricionais. Responda SOMENTE com um JSON no formato exato: ' +
    '{"name": "nome do alimento em português", "estimatedGrams": número (porção ' +
    'visível na foto, em gramas), "kcal100": número (calorias por 100g), ' +
    '"protein100": número (proteína em g por 100g), "carbs100": número ' +
    '(carboidratos em g por 100g), "fat100": número (gordura em g por 100g)}. ' +
    'Use sua melhor estimativa com base em tabelas nutricionais conhecidas. ' +
    'Não inclua texto além do JSON.';

  // Retorna { name, estimatedGrams, kcal100, protein100, carbs100, fat100 }.
  async function recognizeFood(imageDataUrl) {
    const { mime, base64 } = dataUrlToBase64(imageDataUrl);
    return callGemini([{ text: PHOTO_PROMPT }, { inline_data: { mime_type: mime, data: base64 } }]);
  }

  // Fallback quando a busca por nome (base brasileira + Open Food Facts) não
  // acha nada: pede pra própria IA estimar os valores a partir só do nome
  // digitado, com o mesmo formato "por 100g + porção" das outras fontes.
  function textPrompt(query) {
    return 'Você é um nutricionista. Estime os valores nutricionais do alimento ' +
      'ou prato a seguir, usando tabelas nutricionais conhecidas (ex: TACO, USDA) ' +
      'como referência: "' + query + '". Responda SOMENTE com um JSON no formato ' +
      'exato: {"name": "nome padronizado do alimento em português", ' +
      '"estimatedGrams": número (porção típica de uma refeição, em gramas), ' +
      '"kcal100": número (calorias por 100g), "protein100": número (proteína em ' +
      'g por 100g), "carbs100": número (carboidratos em g por 100g), "fat100": ' +
      'número (gordura em g por 100g)}. Se o nome for vago ou não for um ' +
      'alimento reconhecível, faça sua melhor estimativa mesmo assim. Não ' +
      'inclua texto além do JSON.';
  }
  async function estimateFromName(query) {
    const q = (query || '').trim();
    if (!q) throw new Error('empty-query');
    return callGemini([{ text: textPrompt(q) }]);
  }

  window.PdmDietAI = { getApiKey, setApiKey, clearApiKey, isConfigured, recognizeFood, estimateFromName };
})();
