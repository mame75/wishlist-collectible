// Prix Cardmarket des impressions Yu-Gi-Oh! (guide des prix publié chaque jour par Cardmarket)
// data/cmy/<PRÉFIXE>.json : « CODE|rareté[|EA] » → [moyenne 7 j, moyenne 30 j, plus bas, tendance] (€)
// Cardmarket ne nomme pas les raretés dans ses fichiers : chaque produit est relié à une impression par
//  - la carte (nom anglais) et l'extension (déduite des cartes qu'elle contient, via YGOPRODeck) ;
//  - une seule impression de la carte dans l'extension → correspondance exacte ;
//  - plusieurs versions → appariées par ordre de prix avec les prix TCGplayer de chaque impression (data/tcgpx).
import { writeFile, readFile, mkdir, rm, readdir } from 'node:fs/promises';
const UA = { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' };
const get = async u => { for (let i = 0; i < 4; i++){ try { const r = await fetch(u, { headers: UA }); if (r.ok) return await r.json(); } catch {} await new Promise(r => setTimeout(r, 2000 * (i + 1))); } throw new Error('échec ' + u); };
const CM = 'https://downloads.s3.cardmarket.com/productCatalog';
const [prods, guide, ygo] = await Promise.all([
  get(`${CM}/productList/products_singles_3.json`), get(`${CM}/priceGuide/price_guide_3.json`),
  get('https://db.ygoprodeck.com/api/v7/cardinfo.php')]);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const price = Object.fromEntries(guide.priceGuides.map(p => [p.idProduct, p]));
// Impressions YGOPRODeck par carte (nom normalisé) : [{ set, code, rarity }]
const printsOf = {};
for (const c of ygo.data || []) printsOf[norm(c.name)] = (c.card_sets || []).filter(s => !/^(new|reprint)$/i.test(s.set_rarity || ''))
  .map(s => ({ set: s.set_name, code: String(s.set_code).toUpperCase(), rarity: s.set_rarity }));
// Extension Cardmarket → nom d'extension YGOPRODeck (majorité des cartes qu'elle contient)
const byExp = {};
for (const p of prods.products) (byExp[p.idExpansion] ||= []).push(p);
const expName = {};
for (const [id, list] of Object.entries(byExp)){
  const tally = {};
  for (const p of list) new Set((printsOf[norm(p.name)] || []).map(x => x.set)).forEach(s => { tally[s] = (tally[s] || 0) + 1; });
  const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= Math.max(2, list.length * 0.5)) expName[id] = best[0];
}
// Prix TCGplayer par impression (pour départager les versions)
const tp = {};
for (const f of await readdir('data/tcgpx').catch(() => [])){
  const m = JSON.parse(await readFile('data/tcgpx/' + f, 'utf8').catch(() => '{}'));
  for (const [k, v] of Object.entries(m)) tp[k] = v[0];
}
const out = {}, stats = { products: prods.products.length, expansions: Object.keys(byExp).length, mappedExp: Object.keys(expName).length, exact: 0, paired: 0, skipped: 0 };
const put = (code, key, p) => { const g = price[p.idProduct]; if (!g) return;
  const pre = code.split('-')[0]; (out[pre] ||= {})[key] = [g.avg7 ?? null, g.avg30 ?? null, g.low ?? null, g.trend ?? null, p.idProduct]; };
for (const [id, list] of Object.entries(byExp)){
  const set = expName[id]; if (!set) { stats.skipped += list.length; continue; }
  const groups = {};
  for (const p of list) (groups[norm(p.name)] ||= []).push(p);
  for (const [n, ps] of Object.entries(groups)){
    const prints = (printsOf[n] || []).filter(x => x.set === set);
    // Un même code peut exister en version normale et illustration étendue chez TCGplayer : on en tient compte
    const tpKeys = prints.flatMap(x => Object.keys(tp).filter(k => k.startsWith(x.code + '|') && k.split('|')[1] === norm(x.rarity)).map(k => ({ ...x, key: k, usd: tp[k] })));
    if (ps.length === 1 && prints.length === 1){ put(prints[0].code, `${prints[0].code}|${norm(prints[0].rarity)}`, ps[0]); stats.exact++; continue; }
    const cands = tpKeys.length === ps.length ? tpKeys : null;
    if (/pharaohsservant|kuribohmultiply/.test(n)) (stats.debug ||= []).push({ n, set, products: ps.map(p => [p.idProduct, (price[p.idProduct] || {}).trend]), prints, tpKeys: tpKeys.map(x => [x.key, x.usd]) });
    if (!cands){ stats.skipped += ps.length; continue; }
    const byCm = [...ps].sort((a, b) => ((price[b.idProduct] || {}).trend || 0) - ((price[a.idProduct] || {}).trend || 0));
    const byTp = [...cands].sort((a, b) => b.usd - a.usd);
    byCm.forEach((p, i) => put(byTp[i].code, byTp[i].key, p)); stats.paired += ps.length;
  }
}
await rm('data/cmy', { recursive: true, force: true });
await mkdir('data/cmy', { recursive: true });
for (const [pre, m] of Object.entries(out)) await writeFile(`data/cmy/${pre}.json`, JSON.stringify(m));
await mkdir('data/probe', { recursive: true });
await writeFile('data/probe/cmy-stats.json', JSON.stringify({ ...stats, sample0: out.MAMO && Object.fromEntries(Object.entries(out.MAMO).filter(([k]) => /EN00[12]\|/.test(k))) }, null, 1));
console.log(stats);
