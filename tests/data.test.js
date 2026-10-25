import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const c=JSON.parse(fs.readFileSync(new URL('../data/catalog.json',import.meta.url)));
test('catalog has unique extended IDs and explicit types',()=>{assert.equal(new Set(c.objects.map(o=>o.noradId)).size,c.objects.length);assert.ok(c.objects.every(o=>o.noradId>9999));});
test('[low, high) altitude semantics are representable',()=>{const rows=c.objects.filter(o=>o.perigeeKm!=null&&o.perigeeKm>=500&&o.perigeeKm<800);assert.deepEqual(rows.map(x=>x.name),['STARLINK-2000','IRIDIUM 33 DEB','HUBBLE SPACE TELESCOPE','ENVISAT']);});
test('unknown values remain null',()=>{const o=c.objects.find(x=>x.noradId===46920);assert.equal(o.inclination,null);assert.equal(o.launch,null);});
