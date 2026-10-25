import fs from 'node:fs';
const dataUrl = new URL('../data/catalog-real.json', import.meta.url);
const c=JSON.parse(fs.readFileSync(fs.existsSync(dataUrl) ? dataUrl : new URL('../data/catalog.json', import.meta.url)));
const ids=c.objects.map(o=>o.noradId);if(new Set(ids).size!==ids.length)throw Error('duplicate NORAD IDs');
for(const o of c.objects){if(!Number.isInteger(o.noradId)||o.noradId<1)throw Error('invalid catalog ID');if(!['PAYLOAD','DEBRIS','ROCKET BODY','UNKNOWN'].includes(o.objectType))throw Error('unknown object type');}
console.log(`Validated ${c.objects.length} records, ${new Set(ids).size} unique IDs, snapshot ${c.datasetId}`);
