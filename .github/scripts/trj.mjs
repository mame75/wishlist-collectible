// Visuels des cartes japonaises sans photo chez TCGplayer, d'après le catalogue de TCG Republic (boutique japonaise).
// Pour chaque extension japonaise concernée, on lit la liste de ses cartes chez TCG Republic (nom anglais, numéro, image)
// et on ne garde une image que si le nom anglais ET le numéro correspondent à la carte du catalogue TCGplayer.
// Sortie : data/trj.json  { "<extension TCGplayer>|<n°>": [image, nom TCG Republic, symbole de rareté, id produit] }
import { readFile, readdir, writeFile } from 'node:fs/promises';

const UA = { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' };
const BASE = 'https://tcgrepublic.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url){
  for (let k = 0; k < 3; k++){
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.text(); } catch {}
    await sleep(3000 * (k + 1));
  }
  return null;
}
const key = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const words = s => String(s || '').toLowerCase().replace(/&amp;/g, '&').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter(w => w && !['the', 'of', 'and', 'a', 'to', 'pack', 'expansion', 'pokemon', 'card', 'game', 'ex'].includes(w));
const codeOf = s => { const m = String(s).match(/^\[([^\]]+)\]/) || String(s).match(/^([A-Za-z0-9+-]+):\s/); return m ? m[1].toLowerCase() : null; };
const num = s => parseInt(String(s).split('/')[0], 10);

// 1) Cartes japonaises TCGplayer sans photo, par extension
const need = {};   // extension → Map(numéro → [noms anglais])
for (const f of await readdir('data/tcgpj')){
  const idx = JSON.parse(await readFile(`data/tcgpj/${f}`, 'utf8'));
  for (const [k, list] of Object.entries(idx)) for (const [pid, set, n, rar, photo, mirror] of list){
    if (photo) continue;
    ((need[set] ||= {})[n] ||= new Set()).add(k);
  }
}
console.log('extensions sans photo :', Object.keys(need).length);

// 2) Extensions de TCG Republic (catégorie Pokémon)
const cat = await get(`${BASE}/category/category_page_35.html`);
if (!cat){ console.log('TCG Republic injoignable'); process.exit(0); }
const subs = [...new Map([...cat.matchAll(/href="\/category\/subcategory_page_(\d+)\.html"[^>]*>([\s\S]{0,300}?)<\/a>/g)]
  .map(m => [m[1], m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()]).filter(([, n]) => n)).entries()]
  .map(([id, name]) => ({ id, name, code: codeOf(name), w: new Set(words(name)) }));
console.log('extensions TCG Republic :', subs.length);

// Rapprochement : même sigle (« L1: … » ↔ « [L1] … »), sinon tous les mots de l'extension TCGplayer présents chez TCG Republic
function matchSet(tp){
  const c = codeOf(tp), w = words(tp.replace(/^[A-Za-z0-9+-]+:\s/, ''));
  if (c){ const m = subs.filter(s => s.code === c); if (m.length === 1) return m[0];
    if (m.length > 1){ const best = m.map(s => [s, w.filter(x => s.w.has(x)).length]).sort((a, b) => b[1] - a[1])[0]; if (best[1] > 0) return best[0]; } }
  if (!w.length) return null;
  const cand = subs.map(s => [s, w.filter(x => s.w.has(x)).length / w.length, s.w.size]).filter(x => x[1] === 1).sort((a, b) => a[2] - b[2]);
  return cand.length ? cand[0][0] : null;
}

// 3) Liste des cartes de chaque extension rapprochée (toutes les pages), en douceur (1 page par seconde)
const out = {}, log = [];
for (const [set, cards] of Object.entries(need)){
  const s = matchSet(set);
  log.push([set, s ? s.name : null]);
  if (!s) continue;
  const items = [];
  for (let p = 1; p <= 40; p++){
    const html = await get(`${BASE}/category/subcategory_page_${s.id}.html${p > 1 ? `?p=${p}&` : ''}`);
    await sleep(1000);
    if (!html) break;
    const found = [...html.matchAll(/href="\/product\/product_page_(\d+)\.html"[\s\S]{0,600}?<img alt="([^"]*)" src="(\/media\/binary\/[^"]+?)(?:\.l2_thumbnail\.jpg)?"/g)];
    if (!found.length) break;
    let fresh = 0;
    for (const [, pid, alt, img] of found){
      if (items.some(x => x.pid === pid)) continue;
      fresh++;
      const m = alt.match(/^(.*?)\s+(\d{1,3}\/\d{1,3})\s*(\S*)$/);
      if (m) items.push({ pid, name: m[1].replace(/&amp;/g, '&'), n: m[2], rar: m[3], img });
    }
    if (!fresh || !html.includes(`?p=${p + 1}`)) break;
  }
  // Vérification : même numéro ET même nom anglais que la carte TCGplayer
  for (const [n, names] of Object.entries(cards)){
    const hit = items.find(x => num(x.n) === num(n) && (!String(n).includes('/') || !x.n.includes('/') || parseInt(x.n.split('/')[1], 10) === parseInt(String(n).split('/')[1], 10))
      && [...names].some(k => key(x.name) === k || key(x.name.replace(/\s*\(.*?\)\s*/g, ' ')) === k));
    if (hit) out[`${set}|${n}`] = [hit.img, hit.name, hit.rar, hit.pid];
  }
}
await writeFile('data/trj.json', JSON.stringify(out));
console.log('cartes avec visuel :', Object.keys(out).length);
console.log(JSON.stringify(log));
