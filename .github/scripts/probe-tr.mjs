// Sonde : versions spéciales du catalogue TCGplayer Pokémon anglais (catégorie 3)
import { writeFile, mkdir } from 'node:fs/promises';
const UA = { headers: { 'User-Agent': 'WishlistCollectible/1.0 (github.com/mame75/wishlist-collectible)' } };
const J = u => fetch(u, UA).then(r => r.json());
const groups = (await J('https://tcgcsv.com/tcgplayer/3/groups')).results;
const suf = {}, samples = {}, sub = {};
const q = groups.slice();
await Promise.all(Array.from({ length: 6 }, async () => { while (q.length){ const g = q.shift();
  const p = await J(`https://tcgcsv.com/tcgplayer/3/${g.groupId}/products`).catch(() => ({ results: [] }));
  for (const x of p.results || []){
    const ex = Object.fromEntries((x.extendedData || []).map(e => [e.name, e.value]));
    if (!ex.Number) continue;
    const m = x.name.match(/\(([^)]+)\)\s*$/); if (!m) continue;
    const s = m[1].replace(/\d+/g, '#'); suf[s] = (suf[s] || 0) + 1;
    (samples[s] ||= []).length < 3 && samples[s].push(`${g.name} :: ${x.name} :: ${ex.Number} :: img${x.imageCount}`);
  }
  if (/Prismatic|151|Temporal Forces/.test(g.name)){
    const pr = await J(`https://tcgcsv.com/tcgplayer/3/${g.groupId}/prices`).catch(() => ({ results: [] }));
    for (const r of pr.results || []) sub[r.subTypeName] = (sub[r.subTypeName] || 0) + 1;
  }
}}));
const top = Object.entries(suf).sort((a, b) => b[1] - a[1]);
await mkdir('data/probe', { recursive: true });
await writeFile('data/probe/tcgpv.json', JSON.stringify({ groups: groups.length, sample_groups: groups.slice(0, 5).map(g => [g.groupId, g.name, g.abbreviation]), sub, top: top.slice(0, 150).map(([s, n]) => [s, n, samples[s]]) }, null, 1));
