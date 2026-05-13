/**
 * Script one-shot : génère assets/cities.dict.json depuis GeoAPI INSEE.
 * Usage : node scripts/build-cities.mjs
 * Requiert Node >= 18 (fetch natif).
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'assets', 'cities.dict.json');
const GEOAPI_URL =
  'https://geo.api.gouv.fr/communes?fields=nom,population,departement,region&format=json';

// Conditions de classification — ordre important : elles sont évaluées en séquence,
// la première condition vraie l'emporte.
const CONDITIONS = [
  { field: 'population', op: 'lt',  value: 2000,   class: 'Village' },
  { field: 'population', op: 'lt',  value: 10000,  class: 'Petite_Ville' },
  { field: 'population', op: 'lt',  value: 100000, class: 'Ville' },
  { field: 'population', op: 'lt',  value: 500000, class: 'Grande_Ville' },
  { field: 'population', op: 'gte', value: 500000, class: 'Métropole' },
];

function applyOp(entryValue, op, condValue) {
  switch (op) {
    case 'lt':  return entryValue <  condValue;
    case 'lte': return entryValue <= condValue;
    case 'gt':  return entryValue >  condValue;
    case 'gte': return entryValue >= condValue;
    case 'eq':  return entryValue === condValue;
    case 'neq': return entryValue !== condValue;
    case 'contains': return String(entryValue).includes(String(condValue));
    default: return false;
  }
}

function resolveClass(entry) {
  for (const cond of CONDITIONS) {
    const v = entry[cond.field];
    if (v != null && applyOp(v, cond.op, cond.value)) return cond.class;
  }
  return null;
}

async function main() {
  console.log('Téléchargement GeoAPI INSEE…');
  const res = await fetch(GEOAPI_URL);
  if (!res.ok) throw new Error(`GeoAPI HTTP ${res.status}`);

  /** @type {Array<{nom:string, population?:number, departement?:{code:string,nom:string}, region?:{code:string,nom:string}}>} */
  const communes = await res.json();
  console.log(`${communes.length} communes reçues.`);

  const entries = communes
    .filter((c) => c.population != null && c.population > 0)
    .map((c) => {
      const entry = {
        value: c.nom,
        type: 'place',
        population: c.population,
        departement: c.departement?.code ?? null,
        region: c.region?.code ?? null,
      };
      const resolved = resolveClass(entry);
      if (resolved) entry.sizeClass = resolved;
      return entry;
    });

  console.log(`${entries.length} entrées avec population.`);

  const dict = {
    schemaVersion: '1.1',
    dictionaryId: 'fr-communes',
    label: 'Communes françaises (GeoAPI INSEE)',
    type: 'place',
    language: 'fr',
    source: 'https://geo.api.gouv.fr/communes',
    license: 'Licence Ouverte v2.0 / Open Licence v2.0',
    author: 'Institut national de la statistique et des études économiques (INSEE)',
    doi: null,

    roles: {
      detection: true,
      replacement: true,
      classes: true,
    },

    configSchema: [
      {
        key: 'incrementScope',
        label: "Portée de l'incrémentation",
        type: 'enum',
        values: ['file', 'folder', 'vault'],
        default: 'file',
        recommended: 'file',
        description:
          "Définit dans quelle portée les index ({index}) sont uniques. 'file' est recommandé pour maximiser l'anonymisation.",
      },
      {
        key: 'replacementPattern',
        label: 'Format du pseudonyme généré',
        type: 'string',
        default: '{class}_{index}',
        description:
          'Variables disponibles : {class} (classe attribuée), {index} (numéro d\'incrémentation dans la portée).',
      },
      {
        key: 'caseSensitive',
        label: 'Sensible à la casse',
        type: 'boolean',
        values: [true, false],
        default: false,
        description: "Si false, 'paris' et 'Paris' sont détectés comme la même entité.",
      },
    ],

    config: {
      classificationMode: 'conditions',
      conditions: CONDITIONS,
      incrementScope: 'file',
      replacementPattern: '{class}_{index}',
      caseSensitive: false,
    },

    entries,
  };

  mkdirSync(join(__dirname, '..', 'assets'), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(dict), 'utf-8');
  console.log(`Dictionnaire écrit : ${OUT_PATH}`);

  // Statistiques par classe
  const stats = {};
  for (const e of entries) {
    const cls = e.sizeClass ?? '(sans classe)';
    stats[cls] = (stats[cls] ?? 0) + 1;
  }
  console.log('\nRépartition par classe :');
  for (const [cls, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cls.padEnd(15)} ${count}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
