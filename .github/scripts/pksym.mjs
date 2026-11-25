// Symboles d'extension Pokémon (Poképédia, « Symbole <Série> <Extension> JCC.png »), téléchargés dans data/sym/<id TCGdex>.png
// et index data/sym.json { "<id TCGdex>": 1 }. Rapprochement par le nom français de l'extension (TCGdex).
import { writeFile, mkdir } from 'node:fs/promises';
const UA = { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' };
const API = 'https://www.pokepedia.fr/api.php?format=json&';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = u => fetch(u, { headers: UA }).then(r => r.json());
const nm = s => String(s || '').toLowerCase().replace(/ᵉ/g, 'e').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// 1) Fichiers « Symbole_…_JCC.png »
const files = [];
let cont = '';
for (let k = 0; k < 20; k++){
  const j = await J(`${API}action=query&list=allimages&aiprefix=Symbole_&ailimit=500&aiprop=url|size${cont}`);
  files.push(...j.query.allimages.filter(i => /_JCC\.png$/i.test(i.name)));
  if (!j.continue) break;
  cont = `&aicontinue=${encodeURIComponent(j.continue.aicontinue)}`;
}
const F = files.map(f => ({ ...f, k: nm(f.name.replace(/^Symbole_/, '').replace(/_JCC\.png$/i, '')) }));
console.log('symboles Poképédia :', F.length);

// 2) Extensions TCGdex (français), hors TCG Pocket
const SERIES = { sv: 'ecarlateetviolet', swsh: 'epeeetbouclier', sm: 'soleiletlune', xy: 'xy', bw: 'noir&blanc', dp: 'diamant&perle', pl: 'platine',
  hgss: 'heartgoldsoulsilver', me: 'megaevolution', ex: 'ex', ecard: 'expedition', neo: 'neo', base: '' };
const MANUAL = { svp: 'promosv', mep: 'promome', basep: 'promowizards', '30th': '30eanniversaire',
  dp4: 'diamant&perleduelsausommet', hgss4: 'hstriomphe', pop7: 'popseries7',
  '2018sm-fr': "collectionmcdonald's2018(france)", '2019sm-fr': "collectionmcdonald's2019(france)",
  'tk-ex-p': 'exkitdresseur2posipi', 'tk-ex-m': 'exkitdresseur2negapi', 'tk-dp-l': 'diamant&perlekitdresseurlucario', 'tk-dp-m': 'diamant&perlekitdresseurmanaphy',
  'tk-bw-z': 'noir&blanckitdudresseurzoroark', 'tk-bw-e': 'noir&blanckitdudresseurminotaupe', 'tk-xy-p': 'xykitdudresseurpikachucatcheur',
  'tk-sm-l': 'soleiletlunekitdudresseurlougaroc', 'tk-sm-r': "soleiletlunekitdudresseurraichud'alola",
  sve: 'ecarlateetvioletenergiedebase', mee: 'megaevolutionenergiedebase' };
// Sous-extensions : symbole de l'extension principale
const PARENT = { swsh9tg: 'swsh9', swsh10tg: 'swsh10', swsh11tg: 'swsh11', swsh12tg: 'swsh12', 'swsh12.5gg': 'swsh12.5', 'swsh4.5sv': 'swsh4.5',
  sma: 'sm115', cel25cc: 'cel25', '30th-c': '30th', rc: 'bw11', exu: 'ex10' };
const sets = (await J('https://api.tcgdex.net/v2/fr/sets')).filter(s => !/^([AB]\d|P-A)/.test(s.id));
const out = {}, miss = [];
await mkdir('data/sym', { recursive: true });
for (const s of sets){
  const n = nm(s.name), pre = Object.entries(SERIES).find(([p]) => s.id.startsWith(p));
  const ser = pre ? nm(pre[1]) : '';
  let f = MANUAL[s.id] ? F.find(x => x.k === nm(MANUAL[s.id])) : null;
  f ||= F.find(x => x.k === n) || F.find(x => ser && x.k === ser + n)
    || F.filter(x => x.k.endsWith(n) && n.length >= 3).sort((a, b) => (b.k.startsWith(ser) ? 1 : 0) - (a.k.startsWith(ser) ? 1 : 0) || a.k.length - b.k.length)[0];
  if (!f){ miss.push(`${s.id} ${s.name}`); continue; }
  try {
    const r = await fetch(f.url, { headers: UA });
    if (!r.ok) throw new Error(r.status);
    await writeFile(`data/sym/${s.id}.png`, Buffer.from(await r.arrayBuffer()));
    out[s.id] = f.name;
  } catch { miss.push(`${s.id} ${s.name} (téléchargement)`); }
  await sleep(300);
}
for (const [c, p] of Object.entries(PARENT)) if (!out[c] && out[p]){
  await writeFile(`data/sym/${c}.png`, await (await import('node:fs/promises')).readFile(`data/sym/${p}.png`)); out[c] = out[p];
  const i = miss.findIndex(m => m.startsWith(c + ' ')); if (i >= 0) miss.splice(i, 1);
}
await writeFile('data/sym.json', JSON.stringify(out));
console.log(`Symboles : ${Object.keys(out).length} extensions sur ${sets.length} — sans symbole : ${miss.length}`);
console.log(JSON.stringify(miss));
