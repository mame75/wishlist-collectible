// Construit data/tcgp/<PREFIXE>.json : « CODE|rareté[|EA] » → n° de produit TCGplayer (photo de la carte)
// Source : tcgcsv.com, copie publique quotidienne du catalogue TCGplayer (catégorie 2 = Yu-Gi-Oh!)
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
const BASE = 'https://tcgcsv.com/tcgplayer/2';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url){
  for (let i = 0; i < 4; i++){
    try { const r = await fetch(url, { headers: { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' } });
      if (r.ok) return r.json(); } catch {}
    await sleep(1500 * (i + 1));
  }
  throw new Error('échec ' + url);
}
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const groups = (await get(`${BASE}/groups`)).results;
const out = {};
const grpPre = {};   // extension TCGplayer → { sigle : nombre de cartes } (pour les visuels d'extension)
let done = 0;
const queue = groups.slice();
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length){
    const g = queue.shift();
    let res;
    try { res = (await get(`${BASE}/${g.groupId}/products`)).results || []; } catch { continue; }
    for (const p of res){
      const ex = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]));
      const code = String(ex.Number || '').trim().toUpperCase();
      { const pre = (code.match(/^([A-Z0-9]{2,6})-/) || [])[1]; if (pre){ const m = (grpPre[g.groupId] ||= {}); m[pre] = (m[pre] || 0) + 1; } }
      if (!/^[A-Z0-9]+-[A-Z]{0,2}\d+[A-Z]?$/.test(code) || !ex.Rarity || !p.imageCount) continue;
      const key = `${code}|${norm(ex.Rarity)}${/extended art/i.test(p.name) ? '|EA' : ''}`;
      const pre = code.split('-')[0];
      (out[pre] ||= {});
      if (!(key in out[pre])) out[pre][key] = p.productId;
    }
    if (++done % 100 === 0) console.log(done, '/', groups.length);
  }
}));
await mkdir('data/tcgp', { recursive: true });
let changed = 0;
for (const [pre, map] of Object.entries(out)){
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  const txt = JSON.stringify(sorted);
  const f = `data/tcgp/${pre}.json`;
  const old = await readFile(f, 'utf8').catch(() => null);
  if (old !== txt){ await writeFile(f, txt); changed++; }
}
console.log('extensions :', Object.keys(out).length, '— fichiers modifiés :', changed);
// Visuels d'extension Yu-Gi-Oh! : numéro d'extension TCGplayer par sigle (« MAMS ») et par nom ; l'image publique de Collectr est rangée sous ce numéro
{ const c = {}, best = {}, n = {};
  for (const g of groups){
    n[norm(g.name)] = g.groupId;
    const m = grpPre[g.groupId] || {}, top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3 && (!best[top[0]] || top[1] > best[top[0]])){ best[top[0]] = top[1]; c[top[0]] = g.groupId; }
  }
  await writeFile('data/ygogrp.json', JSON.stringify({ c, n }));
  console.log('visuels d\'extension Yu-Gi-Oh! : sigles', Object.keys(c).length, '· noms', Object.keys(n).length); }

// ---- Pokémon japonais (catégorie TCGplayer « Pokemon Japan ») : index par nom anglais de la carte
// data/tcgpj/<1re lettre>.json : nom normalisé → [[n° produit, extension, numéro, rareté, photo ?], …]
// Sert à retrouver les éditions OCG des cartes sans numéro de Pokédex (Dresseurs, Objets, Énergies…)
const cats = (await get('https://tcgcsv.com/tcgplayer/categories')).results || [];
const jp = cats.find(c => /pok[eé]mon japan/i.test(c.name || c.displayName || ''));
if (jp){
  // « Pikachu - 216/SV-P », « Dragonite V - 049/071 » : le numéro n'appartient pas au nom
  const cleanName = s => String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*\[.*?\]\s*/g, ' ').trim().replace(/\s+-\s+[^-]*\d[^-]*$/, '').trim();
  const key = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const jgroups = (await get(`https://tcgcsv.com/tcgplayer/${jp.categoryId}/groups`)).results || [];
  const idx = {}, jg = {};   // jg : extension japonaise TCGplayer → cartes (pour le lien avec Cardmarket)
  const q = jgroups.slice();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (q.length){
      const g = q.shift();
      let res; try { res = (await get(`https://tcgcsv.com/tcgplayer/${jp.categoryId}/${g.groupId}/products`)).results || []; } catch { continue; }
      for (const p of res){
        const ex = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]));
        if (!ex.Number) continue;
        const k = key(cleanName(p.name)); if (!k) continue;
        const f = /[a-z]/.test(k[0]) ? k[0] : '0';
        // Numéro du nom (« Mew ex - 002/043 ») différent du champ Number (151/165) : réimpression d'un deck/coffret rangée dans l'extension du moment
        const nn = (p.name.match(/ - ([A-Z]*\d+\/[A-Z]*\d+)\s*$/) || [])[1], tot = s => parseInt(String(s).split('/')[1], 10), odd = nn && tot(nn) !== tot(ex.Number);   // total différent seulement (sinon simple faute de frappe)
        ((idx[f] ||= {})[k] ||= []).push([p.productId, odd ? `Deck ou coffret (${g.name})` : g.name, odd ? nn : String(ex.Number), ex.Rarity || '', p.imageCount > 0 ? 1 : 0, /mirror|reverse/i.test(p.name) ? 1 : 0, ...(odd ? [String(ex.Number).trim()] : [])]);
        if (!/mirror|reverse/i.test(p.name)) (jg[g.groupId] ||= []).push({ pid: p.productId, k, num: parseInt(String(ex.Number), 10) || 0 });   // versions miroir : même produit Cardmarket (prix reverse)
      }
    }
  }));
  await mkdir('data/tcgpj', { recursive: true });
  for (const [f, m] of Object.entries(idx)) await writeFile(`data/tcgpj/${f}.json`, JSON.stringify(m));
  console.log('Pokémon japonais :', jgroups.length, 'extensions');

  // ---- Lien avec Cardmarket : data/cmjp/<tranche>.json (n° de produit TCGplayer japonais → n° de produit Cardmarket)
  // Extension Cardmarket = celle qui partage le plus de cartes (même nom anglais) avec l'extension TCGplayer, à taille comparable ;
  // versions d'une même carte : rangées par numéro chez TCGplayer, par n° de produit chez Cardmarket (V1, V2…)
  const pl = ((await get('https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json')) || {}).products || [];
  const ck = s => key(String(s || '').replace(/\s*\[.*?\]\s*/g, ' '));
  const byExp = {}, expsOf = {};
  for (const p of pl){ const k = ck(p.name); if (!k) continue;
    ((byExp[p.idExpansion] ||= {})[k] ||= []).push(p.idProduct);
    (expsOf[k] ||= new Set()).add(p.idExpansion); }
  const out = {};
  let linked = 0;
  for (const cards of Object.values(jg)){
    const names = new Set(cards.map(c => c.k));
    const score = {};
    for (const k of names) for (const e of expsOf[k] || []) score[e] = (score[e] || 0) + 1;
    let best = null, bj = 0;
    for (const [e, n] of Object.entries(score)){ const size = Object.keys(byExp[e]).length;
      const j = n / (names.size + size - n); if (j > bj){ bj = j; best = e; } }
    if (!best || bj < 0.5) continue;
    for (const k of names){
      const tp = cards.filter(c => c.k === k).sort((a, b) => a.num - b.num || a.pid - b.pid);
      const cm = (byExp[best][k] || []).slice().sort((a, b) => a - b);
      if (!cm.length || tp.length !== cm.length) continue;
      tp.forEach((c, i) => { (out[Math.floor(c.pid / 20000)] ||= {})[c.pid] = cm[i]; linked++; });
    }
  }
  await mkdir('data/cmjp', { recursive: true });
  for (const [b, m] of Object.entries(out)) await writeFile(`data/cmjp/${b}.json`, JSON.stringify(m));
  console.log('cartes japonaises reliées à Cardmarket :', linked);
}

// ---- Versions spéciales des cartes Pokémon (catalogue anglais, catégorie 3) : data/tcgpv/<id TCGdex de l'extension>.json
// { numéro : [[type, libellé, n° produit TCGplayer, photo ?], …] } — Holo Cosmos, tampons (Pokémon Day, avant-première, Staff, ligue…),
// motifs Poké Ball / Master Ball / Énergie, Cracked Ice… Les versions vendues dans un autre produit (« Pikachu - 051/162 (Cosmos Holo) »)
// sont rattachées à la carte de l'extension qui a le même nom et le même numéro.
{
  const P3 = 'https://tcgcsv.com/tcgplayer/3';
  const KINDS = [
    [/cosmos/i, 'cosmos', 'Holo Cosmos'], [/cracked ice/i, 'cracked', 'Holo Cracked Ice'],
    [/master ?ball/i, 'masterball', 'Reverse Master Ball'], [/^pok[eé] ?ball( pattern)?$/i, 'pokeball', 'Reverse Poké Ball'],
    [/energy symbol/i, 'energy', 'Reverse Énergie'],
    [/^(dusk|love|friend|quick|great|ultra|premier|heal|timer|nest|repeat|luxury|net|level|moon|fast|lure|heavy|dream|beast|safari|sport|park|dive|cherish) ball/i, 'ball', null],
    [/pok[eé]mon day/i, 'pday', 'Tampon Pokémon Day'], [/pre-?release/i, 'prerelease', 'Tampon avant-première'], [/\bstaff\b/i, 'staff', 'Tampon Staff'],
    [/pok[eé]mon center/i, 'pcenter', 'Pokémon Center'], [/holiday calendar/i, 'event', 'Calendrier de l\'Avent'],
    [/\d+(st|nd|rd|th) (celebration|anniversary)/i, 'event', null],
    [/league|championship|regional|worlds|\bgym\b|stamp/i, 'event', null]
  ];
  const kindOf = s => { for (const [re, k, l] of KINDS) if (re.test(s)) return [k, l || s.replace(/^#\d+\s*/, '')]; return null; };
  const nkey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const numKey = s => String(s || '').split('/')[0].trim().toLowerCase().replace(/^([a-z]*)0+(\d)/, '$1$2');
  const baseName = s => nkey(String(s).replace(/\s*\([^)]*\)/g, '').replace(/\s+-\s+.*$/, ''));
  // Extensions TCGdex (anglais) : sigle officiel et nom
  const tsets = await (await fetch('https://api.tcgdex.net/v2/en/sets')).json();
  const byAbbr = {}, byName = {};
  const tq = tsets.filter(s => !/^(A\d|B\d|P-A)/.test(s.id));
  await Promise.all(Array.from({ length: 6 }, async () => { while (tq.length){ const s = tq.shift();
    const d = await fetch(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(s.id)}`).then(r => r.json()).catch(() => null);
    const ab = d && d.abbreviation && d.abbreviation.official;
    if (ab && !byAbbr[ab.toUpperCase()]) byAbbr[ab.toUpperCase()] = s.id;
    byName[nkey(s.name)] ||= s.id; } }));
  const g3 = (await get(`${P3}/groups`)).results;
  const setOfGroup = g => byAbbr[String(g.abbreviation || '').toUpperCase()] || byName[nkey(String(g.name).replace(/^[A-Za-z0-9&.' ]+:\s*/, ''))] || byName[nkey(g.name)] || null;
  const base = {};   // « nom|numéro complet » → id TCGdex (cartes normales des extensions)
  const specials = [];
  const q3 = g3.slice();
  await Promise.all(Array.from({ length: 4 }, async () => { while (q3.length){ const g = q3.shift();
    if (/world championship|trainer kit/i.test(g.name)) continue;
    let res; try { res = (await get(`${P3}/${g.groupId}/products`)).results || []; } catch { continue; }
    const sid = setOfGroup(g);
    for (const p of res){
      const ex = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]));
      if (!ex.Number) continue;
      const suf = [...p.name.matchAll(/\(([^)]+)\)/g)].map(m => m[1]).filter(s => !/^#?\d+$/.test(s));
      const kinds = suf.map(kindOf).filter(Boolean);
      if (!kinds.length){ if (sid && !suf.length) base[`${baseName(p.name)}|${String(ex.Number).toLowerCase()}`] ||= sid; continue; }
      specials.push({ sid, name: baseName(p.name), num: String(ex.Number).toLowerCase(), nameNum: (p.name.match(/ - ([A-Z]*\d+\/[A-Z]*\d+)/i) || [])[1], kind: kinds[0], pid: p.productId, photo: p.imageCount > 0 ? 1 : 0 });
    }
  } }));
  const outv = {}; let linked = 0, lost = 0;
  for (const s of specials){
    const full = String(s.nameNum || s.num).toLowerCase();
    const sid = base[`${s.name}|${full}`] || (s.sid && base[`${s.name}|${s.num}`] === s.sid ? s.sid : null) || (!s.nameNum ? s.sid : null);
    if (!sid){ lost++; continue; }
    const k = numKey(full), list = ((outv[sid] ||= {})[k] ||= []);
    if (!list.some(x => x[2] === s.pid)){ list.push([s.kind[0], s.kind[1], s.pid, s.photo]); linked++; }
  }
  await rm('data/tcgpv', { recursive: true, force: true });
  await mkdir('data/tcgpv', { recursive: true });
  for (const [sid, m] of Object.entries(outv)) await writeFile(`data/tcgpv/${sid}.json`, JSON.stringify(m));
  await writeFile('data/tcgpv.json', JSON.stringify(Object.fromEntries(Object.keys(outv).map(k => [k, 1]))));
  console.log(`versions spéciales Pokémon : ${linked} rattachées, ${lost} sans carte d'origine, ${Object.keys(outv).length} extensions`);
}
