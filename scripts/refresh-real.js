import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const orbitalGroups = ['active', 'cosmos-2251-debris', 'fengyun-1c-debris', 'iridium-33-debris', 'last-30-days'];
const orbitalUrls = orbitalGroups.map((group) => `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`);
const satcatUrl = 'https://celestrak.org/pub/satcat.csv';
const launchUrl = 'https://celestrak.org/satcat/launch-boxscore.php';
const execFileAsync = promisify(execFile);
async function download(url) {
  const {stdout} = await execFileAsync('curl', ['-L', '--fail', '--max-time', '90', '-A', 'OrbitBrief/0.1 (MGT-409 educational local demo)', url], {maxBuffer: 128 * 1024 * 1024});
  return stdout;
}

function parseCsvLine(line) {
  const result = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { result.push(value); value = ''; }
    else value += char;
  }
  result.push(value);
  return result;
}
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function objectType(raw) { return {PAY:'PAYLOAD', 'R/B':'ROCKET BODY', DEB:'DEBRIS', UNK:'UNKNOWN'}[raw] || 'UNKNOWN'; }
function status(raw) { return ({'+':'OPERATIONAL', P:'PARTIALLY OPERATIONAL', B:'BACKUP/STANDBY', S:'SPARE', X:'EXTENDED MISSION', D:'DECAYED', '-':'NON-OPERATIONAL'})[raw] || 'UNKNOWN'; }
function purposeTags(name) {
  const upper = name.toUpperCase();
  const tags = [];
  if (/STARLINK|ONEWEB|IRIDIUM|GLOBALSTAR|INTELSAT|INMARSAT|SES |EUTELSAT|TELESAT|KUIPER|COMM/.test(upper)) tags.push('communications');
  if (/GPS|NAVSTAR|GALILEO|GLONASS|BEIDOU/.test(upper)) tags.push('navigation');
  if (/NOAA|GOES|METEOR|FENGYUN|WEATHER/.test(upper)) tags.push('weather');
  if (/LANDSAT|SENTINEL|EARTH|RESOURCES|RADARSAT|OCEANSAT|YAOGAN/.test(upper)) tags.push('earth-observation');
  if (/ISS|ZARYA|TIANHE|CSS|HUBBLE|ASTRO|SCIENCE|X-RAY/.test(upper)) tags.push('science');
  return tags.length ? tags : ['unknown'];
}

const orbitalFiles = process.env.ORBITBRIEF_OMM_FILES?.split(',').filter(Boolean);
const orbitalPayloads = orbitalFiles ? await Promise.all(orbitalFiles.map((file) => fs.readFile(file, 'utf8'))) : await Promise.all(orbitalUrls.map((url) => download(url)));
const satcatText = process.env.ORBITBRIEF_SATCAT_FILE ? await fs.readFile(process.env.ORBITBRIEF_SATCAT_FILE, 'utf8') : await download(satcatUrl);
const ommById = new Map();
for (const payload of orbitalPayloads) for (const record of JSON.parse(payload)) ommById.set(Number(record.NORAD_CAT_ID), record);
const omm = [...ommById.values()];
const lines = satcatText.split(/\r?\n/).filter(Boolean);
const headers = parseCsvLine(lines[0]);
const index = Object.fromEntries(headers.map((header, position) => [header, position]));
const metadata = new Map();
for (const line of lines.slice(1)) {
  const row = parseCsvLine(line);
  const id = Number(row[index.NORAD_CAT_ID]);
  if (Number.isInteger(id)) metadata.set(id, Object.fromEntries(headers.map((header, position) => [header, row[position] || ''])));
}

const objects = omm.map((record) => {
  const noradId = Number(record.NORAD_CAT_ID);
  const meta = metadata.get(noradId) || {};
  const tags = purposeTags(record.OBJECT_NAME);
  const meanMotion = number(record.MEAN_MOTION);
  return {
    noradId, name:record.OBJECT_NAME, objectType:objectType(meta.OBJECT_TYPE), rawObjectType:meta.OBJECT_TYPE || null,
    status:status(meta.OPS_STATUS_CODE), rawStatus:meta.OPS_STATUS_CODE || null, purpose:tags,
    purposeProvenance:tags[0] === 'unknown' ? 'unmapped' : 'name-curated heuristic', constellation:null,
    country:meta.OWNER || null, intlDes:record.OBJECT_ID || null, launchDate:meta.LAUNCH_DATE || null,
    epoch:record.EPOCH, inclination:number(record.INCLINATION), period:number(meta.PERIOD) || (meanMotion ? 1440 / meanMotion : null),
    eccentricity:number(record.ECCENTRICITY), perigeeKm:number(meta.PERIGEE), apogeeKm:number(meta.APOGEE), meanMotion,
    raan:number(record.RA_OF_ASC_NODE), argPerigee:number(record.ARG_OF_PERICENTER), meanAnomaly:number(record.MEAN_ANOMALY),
    launch:meta.LAUNCH_SITE || meta.LAUNCH_DATE ? {id:record.OBJECT_ID?.split(/[A-Z]/)[0] || null, site:meta.LAUNCH_SITE || null, provider:null, vehicle:null, outcome:null} : null,
    omm:record
  };
}).filter((object) => Number.isInteger(object.noradId) && object.noradId > 0);

const epochs = objects.map((object) => object.epoch).sort();
const retrievedAt = new Date().toISOString();
const output = {
  datasetId:`celestrak-groups-${retrievedAt.slice(0, 10)}`, retrievedAt, source:{publisher:'CelesTrak', urls:orbitalUrls, metadataUrl:satcatUrl, launchUrl, licenseNote:'Refresh and redistribution remain subject to CelesTrak usage policy.'}, simulationTime:retrievedAt,
  coverage:{mode:'real-documented-groups', metadataRecords:metadata.size, orbitalRecords:omm.length, joinedRecords:objects.filter((object) => metadata.has(object.noradId)).length, validEarthOrbiting:objects.length, renderedRecords:objects.length, excludedRecords:omm.length - objects.length, complete:false, groups:orbitalGroups, note:'CelesTrak documents named groups; no GROUP=all endpoint was available during this refresh.'},
  validation:{duplicateIds:objects.length - new Set(objects.map((object) => object.noradId)).size, epochRange:{earliest:epochs[0], latest:epochs.at(-1)}, ommFormat:'CelesTrak JSON OMM-compatible records'}, objects
};
await fs.writeFile(path.join(root, 'data/catalog-real.json'), JSON.stringify(output));
await fs.writeFile(path.join(root, 'data/real-snapshot-provenance.json'), JSON.stringify({retrievedAt, orbitalUrls, satcatUrl, launchUrl, orbitalCount:omm.length, metadataCount:metadata.size}, null, 2));
console.log(`Wrote ${objects.length} real CelesTrak grouped objects to data/catalog-real.json`);
console.log(`Joined metadata: ${output.coverage.joinedRecords}; epoch range: ${epochs[0]} to ${epochs.at(-1)}`);
