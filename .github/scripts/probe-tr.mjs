// Logos des blocs Pokémon (séries TCGdex), rognés à leurs bords visibles : data/serie/<id>.png + data/serie.json
import { writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
const J = u => fetch(u).then(r => r.json());
await mkdir('data/serie', { recursive: true });
const list = (await J('https://api.tcgdex.net/v2/fr/series')).filter(s => s.id !== 'tcgp');
const ok = {};
for (const s of list){
  const d = await J(`https://api.tcgdex.net/v2/fr/series/${s.id}`).catch(() => null);
  if (!d || !d.logo) continue;
  const r = await fetch(d.logo + '.png'); if (!r.ok) continue;
  await writeFile(`data/serie/${s.id}.png`, Buffer.from(await r.arrayBuffer())); ok[s.id] = 1;
}
execSync('pip install --quiet pillow && python3 .github/scripts/trim.py', { stdio: 'inherit' });
await writeFile('data/serie.json', JSON.stringify(ok));
