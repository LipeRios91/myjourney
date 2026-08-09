// Busca de alimentos por nome — usa a API pública do Open Food Facts
// (world.openfoodfacts.org). Sem chave/autenticação nenhuma: é uma base
// aberta e colaborativa, chamada direto do navegador, mesmo modelo "sem
// backend próprio" do resto do app (só que aqui nem credencial o usuário
// precisa colar — a API é totalmente anônima).
//
// Cobertura: forte pra alimentos industrializados/embalados (a maior parte
// do banco vem de leitura de rótulo/código de barras); mais fraca pra
// pratos caseiros/genéricos ("arroz com feijão", por exemplo) — nesses
// casos o usuário sempre pode cair pro modo Manual.

(function () {
  const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
  const FIELDS = 'product_name,product_name_pt,brands,nutriments,image_small_url';

  function kcalFromNutriments(n) {
    if (!n) return 0;
    if (typeof n['energy-kcal_100g'] === 'number') return n['energy-kcal_100g'];
    if (typeof n['energy-kcal_serving'] === 'number' && n['energy-kcal_100g'] === undefined) return n['energy-kcal_100g'] || 0;
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

  // Retorna uma lista de alimentos com valores nutricionais POR 100g. A UI
  // deixa o usuário escolher a porção (gramas) e calcula os totais na hora.
  async function searchByName(query) {
    const q = (query || '').trim();
    if (!q) return [];
    const url = SEARCH_URL + '?search_terms=' + encodeURIComponent(q) +
      '&json=1&page_size=15&fields=' + FIELDS;
    const res = await fetch(url);
    if (!res.ok) throw new Error('food-search-' + res.status);
    const data = await res.json();
    const products = Array.isArray(data.products) ? data.products : [];
    return products
      .map(normalizeProduct)
      .filter((p) => p && (p.kcal100 > 0 || p.protein100 > 0 || p.carbs100 > 0 || p.fat100 > 0));
  }

  window.PdmFoodSearch = { searchByName };
})();
