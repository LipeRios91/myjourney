// Busca de alimentos por nome — duas fontes combinadas:
//
// 1. Uma base própria de pratos/alimentos brasileiros comuns (BR_FOODS
//    abaixo), com valores por 100g baseados em tabelas de composição
//    nutricional (referência tipo TACO/USDA). Existe porque o Open Food
//    Facts sozinho é fraco pra comida caseira/genérica em português — ele é
//    montado principalmente por leitura de rótulo de produto industrializado,
//    então "ovos mexidos" ou "pão com manteiga" não aparecem lá, só marcas
//    embaladas em inglês. Essa base cobre exatamente o oposto: prato pronto,
//    caseiro, sem marca. Não precisa de rede — é local, instantâneo e nunca
//    falha.
// 2. Open Food Facts (world.openfoodfacts.org), sem chave/autenticação
//    nenhuma, pra cobrir produto industrializado/embalado com marca — onde
//    ele é forte de verdade.
//
// searchByName() busca nas duas, mostra a base local primeiro (mais
// relevante pra prato caseiro) e os resultados do Open Food Facts depois. Se
// a rede falhar, a busca local ainda funciona — só quem depende só de
// industrializado é afetado.

(function () {
  const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
  const FIELDS = 'product_name,product_name_pt,brands,nutriments,image_small_url';

  // Valores por 100g, base tipo TACO/USDA. name = como aparece no resultado.
  const BR_FOODS = [
    { name: 'Arroz branco cozido', kcal100: 128, protein100: 2.5, carbs100: 28.1, fat100: 0.2 },
    { name: 'Arroz integral cozido', kcal100: 124, protein100: 2.6, carbs100: 25.8, fat100: 1.0 },
    { name: 'Arroz com feijão', kcal100: 102, protein100: 3.6, carbs100: 20.8, fat100: 0.4 },
    { name: 'Feijão carioca cozido', kcal100: 76, protein100: 4.8, carbs100: 13.6, fat100: 0.5 },
    { name: 'Feijão preto cozido', kcal100: 77, protein100: 4.5, carbs100: 14.0, fat100: 0.5 },
    { name: 'Feijoada', kcal100: 143, protein100: 9.0, carbs100: 12.0, fat100: 6.5 },
    { name: 'Macarrão cozido', kcal100: 158, protein100: 5.8, carbs100: 30.9, fat100: 0.9 },
    { name: 'Lasanha à bolonhesa', kcal100: 170, protein100: 9.0, carbs100: 15.0, fat100: 8.0 },
    { name: 'Strogonoff de frango', kcal100: 180, protein100: 12.0, carbs100: 8.0, fat100: 11.0 },
    { name: 'Pão francês', kcal100: 300, protein100: 8.0, carbs100: 58.6, fat100: 3.1 },
    { name: 'Pão de forma branco', kcal100: 253, protein100: 7.9, carbs100: 50.6, fat100: 3.1 },
    { name: 'Pão de forma integral', kcal100: 253, protein100: 9.4, carbs100: 49.0, fat100: 3.3 },
    { name: 'Pão com manteiga', kcal100: 420, protein100: 6.0, carbs100: 42.0, fat100: 24.0 },
    { name: 'Pão de queijo', kcal100: 364, protein100: 8.0, carbs100: 34.0, fat100: 22.0 },
    { name: 'Torrada', kcal100: 407, protein100: 11.0, carbs100: 75.0, fat100: 6.0 },
    { name: 'Tapioca', kcal100: 130, protein100: 0.2, carbs100: 32.0, fat100: 0.1 },
    { name: 'Cuscuz nordestino cozido', kcal100: 112, protein100: 2.5, carbs100: 25.0, fat100: 0.2 },
    { name: 'Aveia em flocos', kcal100: 394, protein100: 13.9, carbs100: 66.6, fat100: 8.5 },
    { name: 'Granola', kcal100: 471, protein100: 10.0, carbs100: 64.0, fat100: 20.0 },
    { name: 'Batata inglesa cozida', kcal100: 52, protein100: 1.2, carbs100: 11.9, fat100: 0.1 },
    { name: 'Batata frita', kcal100: 267, protein100: 4.0, carbs100: 35.0, fat100: 14.0 },
    { name: 'Mandioca cozida', kcal100: 125, protein100: 0.6, carbs100: 30.0, fat100: 0.3 },
    { name: 'Farofa', kcal100: 411, protein100: 2.0, carbs100: 65.0, fat100: 15.0 },
    { name: 'Ovo cozido', kcal100: 155, protein100: 13.0, carbs100: 1.1, fat100: 11.0 },
    { name: 'Ovo frito', kcal100: 196, protein100: 13.6, carbs100: 0.8, fat100: 15.3 },
    { name: 'Ovos mexidos', kcal100: 168, protein100: 11.7, carbs100: 1.6, fat100: 12.9 },
    { name: 'Omelete', kcal100: 154, protein100: 10.8, carbs100: 1.9, fat100: 11.7 },
    { name: 'Panqueca', kcal100: 220, protein100: 7.0, carbs100: 28.0, fat100: 9.0 },
    { name: 'Peito de frango grelhado', kcal100: 165, protein100: 31.0, carbs100: 0, fat100: 3.6 },
    { name: 'Frango empanado frito', kcal100: 246, protein100: 16.0, carbs100: 14.0, fat100: 14.0 },
    { name: 'Coxinha', kcal100: 289, protein100: 10.0, carbs100: 25.0, fat100: 17.0 },
    { name: 'Carne bovina grelhada', kcal100: 219, protein100: 32.0, carbs100: 0, fat100: 9.0 },
    { name: 'Carne moída refogada', kcal100: 250, protein100: 26.0, carbs100: 0, fat100: 15.0 },
    { name: 'Hambúrguer', kcal100: 250, protein100: 13.0, carbs100: 25.0, fat100: 11.0 },
    { name: 'Peixe grelhado (tilápia)', kcal100: 128, protein100: 26.0, carbs100: 0, fat100: 2.7 },
    { name: 'Sushi (combinado)', kcal100: 150, protein100: 6.0, carbs100: 25.0, fat100: 3.0 },
    { name: 'Linguiça calabresa', kcal100: 320, protein100: 15.0, carbs100: 2.0, fat100: 28.0 },
    { name: 'Bacon frito', kcal100: 541, protein100: 37.0, carbs100: 1.4, fat100: 42.0 },
    { name: 'Presunto', kcal100: 145, protein100: 18.0, carbs100: 2.0, fat100: 7.0 },
    { name: 'Pastel frito (carne)', kcal100: 300, protein100: 9.0, carbs100: 28.0, fat100: 17.0 },
    { name: 'Pizza de mussarela (fatia)', kcal100: 266, protein100: 11.0, carbs100: 33.0, fat100: 10.0 },
    { name: 'Queijo mussarela', kcal100: 280, protein100: 22.0, carbs100: 3.0, fat100: 20.0 },
    { name: 'Queijo minas frescal', kcal100: 264, protein100: 17.4, carbs100: 3.0, fat100: 20.2 },
    { name: 'Requeijão', kcal100: 257, protein100: 9.6, carbs100: 3.0, fat100: 23.0 },
    { name: 'Iogurte natural integral', kcal100: 61, protein100: 3.5, carbs100: 4.7, fat100: 3.3 },
    { name: 'Leite integral', kcal100: 61, protein100: 3.2, carbs100: 4.7, fat100: 3.3 },
    { name: 'Vitamina de banana', kcal100: 90, protein100: 3.0, carbs100: 15.0, fat100: 2.0 },
    { name: 'Whey protein (pó)', kcal100: 380, protein100: 75.0, carbs100: 8.0, fat100: 5.0 },
    { name: 'Banana prata', kcal100: 98, protein100: 1.3, carbs100: 26.0, fat100: 0.1 },
    { name: 'Maçã', kcal100: 56, protein100: 0.3, carbs100: 15.2, fat100: 0 },
    { name: 'Mamão papaia', kcal100: 40, protein100: 0.5, carbs100: 10.4, fat100: 0.1 },
    { name: 'Laranja', kcal100: 37, protein100: 1.0, carbs100: 8.9, fat100: 0.1 },
    { name: 'Manga', kcal100: 64, protein100: 0.4, carbs100: 16.7, fat100: 0.2 },
    { name: 'Abacate', kcal100: 96, protein100: 1.2, carbs100: 6.0, fat100: 8.4 },
    { name: 'Açaí na tigela', kcal100: 247, protein100: 3.0, carbs100: 25.0, fat100: 15.0 },
    { name: 'Salada de frutas', kcal100: 55, protein100: 0.6, carbs100: 14.0, fat100: 0.2 },
    { name: 'Alface', kcal100: 15, protein100: 1.4, carbs100: 2.4, fat100: 0.2 },
    { name: 'Tomate', kcal100: 15, protein100: 1.1, carbs100: 3.1, fat100: 0.2 },
    { name: 'Brócolis cozido', kcal100: 25, protein100: 2.1, carbs100: 4.4, fat100: 0.3 },
    { name: 'Café com leite', kcal100: 42, protein100: 2.0, carbs100: 3.3, fat100: 2.0 },
    { name: 'Suco de laranja natural', kcal100: 40, protein100: 0.7, carbs100: 9.5, fat100: 0.1 },
    { name: 'Água de coco', kcal100: 22, protein100: 0.7, carbs100: 4.6, fat100: 0.2 },
    { name: 'Refrigerante', kcal100: 42, protein100: 0, carbs100: 10.5, fat100: 0 },
    { name: 'Bolo simples', kcal100: 340, protein100: 5.0, carbs100: 50.0, fat100: 13.0 },
    { name: 'Chocolate ao leite', kcal100: 540, protein100: 7.3, carbs100: 59.6, fat100: 30.0 },
    { name: 'Manteiga', kcal100: 717, protein100: 0.9, carbs100: 0.1, fat100: 81.0 },
    { name: 'Margarina', kcal100: 596, protein100: 0.2, carbs100: 0.5, fat100: 66.0 },
    { name: 'Mel', kcal100: 309, protein100: 0.4, carbs100: 84.0, fat100: 0 },
    { name: 'Açúcar refinado', kcal100: 387, protein100: 0, carbs100: 99.8, fat100: 0 },
  ];

  function stripAccents(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function normalize(s) { return stripAccents(s).toLowerCase().trim(); }

  // Cada palavra da busca precisa aparecer em algum lugar do nome — forgiving
  // o bastante pra "ovo mexido" achar "Ovos mexidos" (singular/plural) sem
  // exigir substring exata da frase inteira.
  function searchLocal(query) {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return BR_FOODS
      .filter((f) => {
        const n = normalize(f.name);
        return words.every((w) => n.indexOf(w) !== -1);
      })
      .map((f) => Object.assign({ brand: '' }, f));
  }

  function kcalFromNutriments(n) {
    if (!n) return 0;
    if (typeof n['energy-kcal_100g'] === 'number') return n['energy-kcal_100g'];
    if (typeof n.energy_100g === 'number') return n.energy_100g / 4.184; // kJ -> kcal
    return 0;
  }

  function normalizeProduct(p) {
    const n = p.nutriments || {};
    const name = (p.product_name_pt || p.product_name || '').trim();
    if (!name) return null;
    return {
      name: name,
      brand: (p.brands || '').split(',')[0].trim(),
      imageUrl: p.image_small_url || null,
      kcal100: Math.round(kcalFromNutriments(n) * 10) / 10,
      protein100: Math.round((n.proteins_100g || 0) * 10) / 10,
      carbs100: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
      fat100: Math.round((n.fat_100g || 0) * 10) / 10,
    };
  }

  async function searchOpenFoodFacts(query) {
    const url = SEARCH_URL + '?search_terms=' + encodeURIComponent(query) +
      '&json=1&page_size=15&fields=' + FIELDS;
    const res = await fetch(url);
    if (!res.ok) throw new Error('food-search-' + res.status);
    const data = await res.json();
    const products = Array.isArray(data.products) ? data.products : [];
    return products
      .map(normalizeProduct)
      .filter((p) => p && (p.kcal100 > 0 || p.protein100 > 0 || p.carbs100 > 0 || p.fat100 > 0));
  }

  // Retorna uma lista de alimentos com valores nutricionais POR 100g (base BR
  // primeiro, Open Food Facts depois). A UI deixa o usuário escolher a
  // porção (gramas) e calcula os totais na hora. Falha de rede no Open Food
  // Facts não derruba a busca — os resultados locais continuam voltando.
  async function searchByName(query) {
    const q = (query || '').trim();
    if (!q) return [];
    const local = searchLocal(q);
    let remote = [];
    try { remote = await searchOpenFoodFacts(q); } catch (e) { /* base local ainda funciona */ }
    return local.concat(remote);
  }

  window.PdmFoodSearch = { searchByName };
})();
