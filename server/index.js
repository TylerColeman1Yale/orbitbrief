import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {json2satrec, propagate, gstime, eciToGeodetic} from 'satellite.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv(path.join(root, '.env'));
loadEnv(path.resolve(root, '../.env'));
loadEnv(path.resolve(root, '../../../.env'));
const realCatalogPath = path.join(root, 'data/catalog-real.json');
const catalogPath = process.env.ORBITBRIEF_DATA_FILE ? path.resolve(process.env.ORBITBRIEF_DATA_FILE) : (fs.existsSync(realCatalogPath) ? realCatalogPath : path.join(root, 'data/catalog.json'));
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const publicDir = path.join(root, 'client');
const send = (res, data, status = 200, type = 'application/json') => {
  res.writeHead(status, {'content-type': type, 'cache-control': 'no-store, no-cache, must-revalidate'});
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
};
const evidence = () => [{sourceId:'snapshot', url:catalog.source.url || catalog.source.urls?.[0], publisher:catalog.source.publisher, retrievedAt:catalog.retrievedAt, datasetId:catalog.datasetId}];
const orbitGroup = (object) => object.perigeeKm == null ? 'unknown' : object.period > 1000 ? 'MEO/GEO' : object.perigeeKm < 2000 ? 'LEO' : 'other';
const satrecCache = new Map();
const position = (object, at) => {
  if (object.omm) {
    try {
      let satrec = satrecCache.get(object.noradId);
      if (!satrec) { satrec = json2satrec(object.omm); satrecCache.set(object.noradId, satrec); }
      const date = new Date(at);
      const propagated = propagate(satrec, date);
      if (propagated.position && typeof propagated.position.x === 'number') {
        const geodetic = eciToGeodetic(propagated.position, gstime(date));
        return {x:propagated.position.x, y:propagated.position.y, z:propagated.position.z, altitudeKm:Math.round(geodetic.height), latitude:geodetic.latitude * 180 / Math.PI, longitude:geodetic.longitude * 180 / Math.PI};
      }
    } catch { /* Fall through to the demo-compatible path for malformed records. */ }
  }
  if (object.perigeeKm == null || object.apogeeKm == null) return null;
  const minutes = (Date.parse(at) - Date.parse(catalog.simulationTime)) / 60000;
  const angle = ((object.meanAnomaly || 0) + minutes * (object.meanMotion || 0) * 6) * Math.PI / 180;
  const radius = (object.perigeeKm + object.apogeeKm) / 2 + 6371;
  const inclination = (object.inclination || 0) * Math.PI / 180;
  return {x:radius * Math.cos(angle), y:radius * Math.sin(angle) * Math.cos(inclination), z:radius * Math.sin(angle) * Math.sin(inclination), altitudeKm:Math.round(radius - 6371), latitude:Math.round(Math.asin(Math.sin(angle) * Math.sin(inclination)) * 180 / Math.PI), longitude:Math.round(((angle * 180 / Math.PI + 540) % 360) - 180)};
};
function filtered(query) {
  let objects = catalog.objects;
  if (query.type && query.type !== 'all') objects = objects.filter((object) => object.objectType === query.type);
  if (query.purpose && query.purpose !== 'all') objects = objects.filter((object) => object.purpose.includes(query.purpose));
  if (query.search) { const search = query.search.toLowerCase(); objects = objects.filter((object) => String(object.noradId).includes(search) || object.name.toLowerCase().includes(search)); }
  if (query.min) objects = objects.filter((object) => position(object, query.time || catalog.simulationTime)?.altitudeKm >= Number(query.min));
  if (query.max) objects = objects.filter((object) => position(object, query.time || catalog.simulationTime)?.altitudeKm < Number(query.max));
  return objects;
}
function count(query) {
  const objects = filtered(query);
  const breakdown = Object.fromEntries(['PAYLOAD','DEBRIS','ROCKET BODY','UNKNOWN'].map((type) => [type, objects.filter((object) => object.objectType === type).length]));
  return {data:{count:objects.length, breakdown, matchedIds:objects.map((object) => object.noradId), simulationTime:query.time || catalog.simulationTime}, evidence:evidence(), definition:'Instantaneous modeled altitude with [low, high) boundaries.', coverage:{matched:objects.length, eligible:catalog.objects.length, excluded:catalog.objects.length - objects.length, complete:false}, warnings:['Coverage is a demo subset.']};
}
const regionBoxes = {
  'north america': {label:'North America', minLat:7, maxLat:83, minLon:-170, maxLon:-50},
  'south america': {label:'South America', minLat:-56, maxLat:13, minLon:-82, maxLon:-34},
  europe: {label:'Europe', minLat:35, maxLat:72, minLon:-25, maxLon:45},
  africa: {label:'Africa', minLat:-35, maxLat:37, minLon:-18, maxLon:52},
  asia: {label:'Asia', minLat:1, maxLat:78, minLon:25, maxLon:180},
  australia: {label:'Australia/Oceania', minLat:-50, maxLat:0, minLon:110, maxLon:180},
  oceania: {label:'Australia/Oceania', minLat:-50, maxLat:0, minLon:110, maxLon:180},
  antarctica: {label:'Antarctica', minLat:-90, maxLat:-60, minLon:-180, maxLon:180}
};
function questionTime(text) {
  const match = text.match(/(20\d{2}-\d{2}-\d{2})(?:[t ](\d{2}):(\d{2}))?/i);
  if (!match) return catalog.simulationTime;
  return new Date(`${match[1]}T${match[2] || '00'}:${match[3] || '00'}:00Z`).toISOString();
}
function regionFromQuestion(text) {
  const continent = Object.keys(regionBoxes).find((name) => text.includes(name));
  if (continent) return {type:'box', ...regionBoxes[continent]};
  const point = text.match(/(?:lat(?:itude)?\s*|\()(-?\d+(?:\.\d+)?)\s*(?:,|\s+lon(?:gitude)?\s*)(-?\d+(?:\.\d+)?)/i);
  if (point) return {type:'point', label:`${point[1]}° latitude, ${point[2]}° longitude`, latitude:Number(point[1]), longitude:Number(point[2]), radius:10};
  return null;
}
function regionCount(query) {
  const objects = filtered({purpose:query.purpose});
  const matches = objects.filter((object) => {
    const positionAtTime = position(object, query.time);
    if (!positionAtTime) return false;
    if (query.region.type === 'point') {
      const latitudeDistance = positionAtTime.latitude - query.region.latitude;
      const longitudeDistance = Math.abs(((positionAtTime.longitude - query.region.longitude + 540) % 360) - 180);
      return Math.hypot(latitudeDistance, longitudeDistance) <= query.region.radius;
    }
    return positionAtTime.latitude >= query.region.minLat && positionAtTime.latitude <= query.region.maxLat && positionAtTime.longitude >= query.region.minLon && positionAtTime.longitude <= query.region.maxLon;
  });
  return {data:{count:matches.length, matchedIds:matches.map((object) => object.noradId), region:query.region.label, simulationTime:query.time, purpose:query.purpose}, evidence:evidence(), definition:query.region.type === 'box' ? 'Objects whose propagated sub-satellite point falls inside an educational continent bounding box.' : 'Objects whose propagated sub-satellite point falls within an approximate 10-degree latitude/longitude box around the requested point.', coverage:{matched:matches.length, eligible:objects.length, excluded:objects.length - matches.length, complete:false}, warnings:['A point over a continent is a geographic snapshot query, not a visibility or ground-station coverage calculation.']};
}
function datasetSummary() {
  const breakdown = Object.fromEntries(['PAYLOAD','DEBRIS','ROCKET BODY','UNKNOWN'].map((type) => [type, catalog.objects.filter((object) => object.objectType === type).length]));
  const purposes = Object.fromEntries(['science','weather','communications','navigation','earth-observation'].map((purpose) => [purpose, catalog.objects.filter((object) => object.purpose.includes(purpose)).length]));
  return {datasetId:catalog.datasetId, simulationTime:catalog.simulationTime, coverage:catalog.coverage, breakdown, purposes};
}
const facts = {
  removal: 'Prevention and mitigation include passivation, post-mission disposal, controlled deorbiting, and design-for-demise. Active removal requires rendezvous, capture, ownership coordination, and mission-specific engineering.',
  collision: 'The 2009 Iridium 33/Cosmos 2251 collision was accidental. This compact event list is curated and nonexhaustive; overlapping dots or crossed trails do not detect collisions.',
  removalCost: 'There is no single source-backed price for removing “space debris.” A useful planning estimate is mission-specific: a small inspection or technology-demonstration mission may be in the tens of millions of dollars, while a dedicated capture-and-deorbit mission can reach the hundreds of millions. Those figures are an order-of-magnitude discussion aid, not a quote or a number calculated from this catalog. The cost depends on target mass, orbit, rendezvous difficulty, capture method, launch, insurance, and disposal requirements.',
  removalWorth: 'It can be worth removing selected debris, but not every tracked object should automatically be captured. The strongest case is a large, high-risk object in a crowded orbit where removal lowers long-term collision risk more than the mission costs and risks. Prevention, passivation, and post-mission disposal are usually cheaper than active removal. This is a strategic tradeoff, not a yes/no conclusion from the OrbitBrief catalog; the snapshot does not contain mission cost, collision-risk, ownership, or capture-feasibility data.'
};
const typeAnswer = 'The catalog separates objects into four physical types: Payloads are spacecraft or mission objects; Debris are cataloged fragments and other classified debris; Rocket bodies are launch stages or boosters remaining in orbit; Unknown objects have no reliable source classification. Operational status is a separate dimension, so a payload can be non-operational without becoming debris.';
const datasetLabel = () => catalog.coverage?.mode?.startsWith('real-') ? 'the real CelesTrak snapshot' : 'the pinned demo snapshot';
const collisionRiskAnswer = 'This prototype cannot calculate a trustworthy chance of collision. Two dots overlapping, crossing trails, or sharing an altitude band is not a conjunction assessment. A real collision probability needs precise state vectors, covariance or uncertainty, relative miss distance, time of closest approach, and a validated probability-of-collision method. OrbitBrief can explain documented collision events and visualize modeled objects, but it does not predict collisions.';
const purposeDescriptions = {
  science: 'Science-purpose tags cover research and technology missions identified by the catalog metadata or object-name heuristic.',
  weather: 'Weather-purpose tags identify meteorological and environmental-observation missions; this is not a live weather forecast.',
  communications: 'Communications-purpose tags identify communications-related missions; the tag does not measure service availability or coverage.',
  navigation: 'Navigation-purpose tags identify positioning and navigation missions; the tag does not measure signal quality or user availability.',
  'earth-observation': 'Earth-observation tags identify imaging, remote-sensing, and related missions; the tag does not describe image quality or current tasking.'
};
function objectFromQuestion(text) {
  const named = catalog.objects.find((object) => {
    const escapedName = object.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escapedName}(?:$|[^a-z0-9])`).test(text);
  });
  if (named) return named;
  const norad = text.match(/\b(?:norad(?:\s+id)?|catalog(?:ue)?\s+id|object\s+id)\s*#?\s*(\d{3,7})\b/i);
  return norad ? catalog.objects.find((object) => String(object.noradId) === norad[1]) : null;
}
function objectAnswer(object, time = catalog.simulationTime) {
  const point = position(object, time);
  const location = point ? `modeled sub-satellite point ${point.latitude.toFixed(1)}° latitude, ${point.longitude.toFixed(1)}° longitude at ${time}` : 'no modeled position available at the selected time';
  return `${object.name} (NORAD ${object.noradId}) is classified as ${object.objectType.toLowerCase()}, with ${object.status.toLowerCase()} status and a ${object.purpose.join(', ')} purpose tag. Its ${location}; modeled altitude is ${point?.altitudeKm ?? 'unknown'} km. This is a snapshot/SGP4 projection from ${datasetLabel()}, not live telemetry. Source classification and purpose tags can be incomplete.`;
}
const offlineAnswers = [
  {match:['accurate','accuracy','simulation'], answer:'The simulation is an educational propagation model based on the bundled snapshot. It advances positions smoothly from stored orbital parameters, but it is not live telemetry and has not passed a precision SGP4 reference-validation gate. Treat it as a visual explanation, not an operational prediction.'},
  {match:['what is an orbit','how do satellites stay','gravity'], answer:'An orbit is continuous free fall around a body. A satellite moves forward while gravity curves its path toward Earth; the balance produces a repeating trajectory. Orbital altitude, inclination, eccentricity, and period shape that trajectory.'},
  {match:['leo','low earth'], answer:'LEO means low Earth orbit, roughly the near-Earth region below about 2,000 km in this educational grouping. It has short periods and is used by many Earth-observation, crewed, and communications missions.'},
  {match:['meo','geo','geostationary'], answer:'MEO is the middle-altitude region used by many navigation systems. The geosynchronous region has a period near Earth’s rotation; geostationary is the narrower case with a near-equatorial, low-eccentricity orbit.'},
  {match:['debris','space junk'], answer:'Cataloged debris is only the individually tracked portion of the debris environment. Smaller fragments are often discussed through agency estimates rather than individually rendered points. OrbitBrief keeps those concepts separate.'},
  {match:['launch'], answer:'A launch event is different from the number of payloads or cataloged objects associated with it. One launch may deploy many payloads and leave rocket bodies or later debris. The demo launch panel uses a small fixture-backed event set.'},
  {match:['cost','expensive','price','dollar'], answer:facts.removalCost},
  {match:['weather'], answer:`${purposeDescriptions.weather} The current snapshot contains ${catalog.objects.filter((object) => object.purpose.includes('weather')).length} cataloged weather-purpose records.`}
];
function offlineGeneralAnswer(text, contextText = '') {
  const combinedText = `${contextText} ${text}`;
  if (text.includes('worth') && (combinedText.includes('remov') || combinedText.includes('debris'))) return facts.removalWorth;
  const hit = offlineAnswers.find((entry) => entry.match.some((term) => combinedText.includes(term)));
  if (hit) return hit.answer;
  const purpose = Object.keys(purposeDescriptions).find((tag) => combinedText.includes(tag));
  if (purpose) return `${purposeDescriptions[purpose]} The current snapshot contains ${catalog.objects.filter((object) => object.purpose.includes(purpose)).length} cataloged ${purpose} object${catalog.objects.filter((object) => object.purpose.includes(purpose)).length === 1 ? '' : 's'}.`;
  return 'I can answer general orbital and space-environment questions, explain the catalog, identify objects, summarize purpose tags, estimate mission concepts, or analyze the modeled scene. Numeric claims are tied to the dated snapshot; questions outside the snapshot are answered as general context and labeled as estimates.';
}
async function modelAnswer(question, history = []) {
  const key = process.env.PORTKEY_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const conversationContext = history.slice(-8).map((item) => `${item.role === 'assistant' ? 'Analyst' : 'User'}: ${String(item.content || '').slice(0, 1200)}`).join('\n');
    const response = await fetch(`${process.env.PORTKEY_BASE_URL || 'https://api.portkey.ai/v1'}/responses`, {method:'POST', signal:controller.signal, headers:{'content-type':'application/json', authorization:`Bearer ${key}`, 'x-portkey-provider':'openai'}, body:JSON.stringify({model:process.env.ORBITBRIEF_MODEL || 'gpt-6-luna', input:`You are the OrbitBrief Analyst. Continue the conversation naturally and answer the user's latest question clearly. Treat the dataset context below as the source of truth for numeric, type, purpose, and snapshot claims. Cite the supplied source context when it supports a claim. Use generalized orbital intelligence for conceptual questions, and label estimates as estimates. Explain definitions and uncertainty. Do not claim this app provides live telemetry or collision probability. If the question needs a calculation or spatial query that is not in the supplied context, say that a deterministic catalog query is needed instead of inventing a number.\n\nDataset context:\n${JSON.stringify(datasetSummary())}\n\nRecent conversation:\n${conversationContext || '(none)'}\n\nLatest user question: ${question}`, max_output_tokens:500})});
    if (!response.ok) return null;
    const payload = await response.json();
    return payload.output_text || payload.output?.flatMap((item) => item.content || []).map((item) => item.text || '').join(' ').trim() || null;
  } catch { return null; } finally { clearTimeout(timeout); }
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  if (url.pathname === '/api/catalog') {
    const publicObjects = catalog.objects.map((object) => { const {omm, ...publicObject} = object; return {...publicObject, position:position(object, catalog.simulationTime), orbitGroup:orbitGroup(object)}; });
    return send(res, {...catalog, objects:publicObjects});
  }
  if (url.pathname === '/api/query') return send(res, count(Object.fromEntries(url.searchParams)));
  if (url.pathname === '/api/positions') {
    const query = Object.fromEntries(url.searchParams);
    const objects = filtered(query);
    const limit = 2500;
    return send(res, {datasetId:catalog.datasetId, simulationTime:query.time || catalog.simulationTime, positions:objects.slice(0, limit).map((object) => ({noradId:object.noradId, position:position(object, query.time || catalog.simulationTime)})), coverage:{matched:objects.length, returned:Math.min(objects.length, limit), complete:objects.length <= limit}, warnings:objects.length > limit ? [`Position refresh capped at ${limit} visible objects; remaining objects retain their last verified position until a later refresh.`] : []});
  }
  if (url.pathname === '/api/agent' && req.method === 'POST') {
    const maxBodyBytes = 16 * 1024;
    if (Number(req.headers['content-length'] || 0) > maxBodyBytes) return send(res, {error:'Agent request is too large'}, 413);
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > maxBodyBytes) return send(res, {error:'Agent request is too large'}, 413);
    }
    try {
      const {message = '', history = []} = JSON.parse(body);
      const text = message.toLowerCase();
      const recentHistory = Array.isArray(history) ? history.slice(-10).filter((item) => item && typeof item.content === 'string') : [];
      const contextText = recentHistory.map((item) => item.content.toLowerCase()).join(' ');
      if (text.includes('type') || text.includes('kinds') || text.includes('categories') || text.includes('different objects')) return send(res, {answer:typeAnswer, evidence:evidence(), trace:['getDatasetStatus','describeObjectTypes']});
      if (text.includes('collision') && (text.includes('chance') || text.includes('probability') || text.includes('risk') || text.includes('will'))) return send(res, {answer:collisionRiskAnswer, evidence:[...evidence(), {sourceId:'cara', url:'https://www.nasa.gov/cara/', publisher:'NASA CARA', retrievedAt:catalog.retrievedAt}], trace:['getDatasetStatus','collisionCapabilityCheck']});
      if ((text.includes('remov') || text.includes('deorbit') || contextText.includes('remov')) && (text.includes('cost') || text.includes('price') || text.includes('expensive') || text.includes('dollar') || text.includes('estimate'))) return send(res, {answer:facts.removalCost, evidence:[...evidence(), {sourceId:'nasa-debris', url:'https://www.nasa.gov/space-debris/', publisher:'NASA Orbital Debris Program Office', retrievedAt:catalog.retrievedAt}], trace:['getDebrisFacts','estimateMissionScale']});
      if (text.includes('worth') && ((text.includes('remov') || text.includes('debris')) || contextText.includes('remov') || contextText.includes('debris'))) return send(res, {answer:facts.removalWorth, evidence:[...evidence(), {sourceId:'nasa-debris', url:'https://www.nasa.gov/space-debris/', publisher:'NASA Orbital Debris Program Office', retrievedAt:catalog.retrievedAt}], trace:['getDebrisFacts','assessRemovalTradeoff']});
      if (text.includes('remov')) return send(res, {answer:facts.removal, evidence:evidence(), trace:['getDebrisFacts']});
      if (text.includes('collision')) return send(res, {answer:facts.collision, evidence:evidence(), trace:['getHistoricalEvents']});
      const object = objectFromQuestion(text);
      if (object && (text.includes('where') || text.includes('location') || text.includes('position') || text.includes('tell me about') || text.includes('what is'))) {
        const time = questionTime(text);
        return send(res, {answer:objectAnswer(object, time), interpreted:{time, datasetId:catalog.datasetId, noradId:object.noradId}, result:{data:{object:object.name, noradId:object.noradId, objectType:object.objectType, status:object.status, position:position(object, time)}, evidence:evidence()}, evidence:evidence(), trace:['getObject','propagateAtTime']});
      }
      if (!object && (text.includes('where is') || text.includes('tell me about') || text.includes('norad')) && (text.includes('cosmos') || text.includes('satellite') || text.includes('norad'))) {
        return send(res, {answer:`I could not find that object in ${datasetLabel()}. Try its exact catalog name or NORAD ID. The bundled snapshot is a documented-group subset, so absence here does not prove the object is absent from orbit.`, evidence:evidence(), trace:['getObject','coverageCheck']});
      }
      const purpose = ['science', 'communications', 'navigation', 'weather', 'earth-observation'].find((tag) => text.includes(tag));
      const region = regionFromQuestion(text);
      if (purpose && region) {
        const time = questionTime(text);
        const result = regionCount({purpose, region, time});
        return send(res, {answer:`${result.data.count} cataloged ${purpose} object${result.data.count === 1 ? '' : 's'} are over ${region.label} at ${time}. This uses propagated sub-satellite points and an educational geographic region definition; it is not a visibility or coverage count.`, interpreted:{time, datasetId:catalog.datasetId}, result, evidence:evidence(), action:{type:'filter', filterPatch:{purpose, simulationTime:time}}, trace:['countObjects','propagateAtTime','regionFilter']});
      }
      if (purpose && (text.includes('how many') || text.includes('number') || text.includes('count') || text.includes('what about') || text.includes('objects') || text.includes('filter') || text.includes('show') || text.includes('only') || text.includes('what are') || text.includes('what does') || text.includes('tell me'))) {
        const result = count({purpose});
        return send(res, {answer:`${result.data.count} cataloged objects are tagged ${purpose} in ${datasetLabel()}. ${purposeDescriptions[purpose]} This is a source-backed snapshot count, not an exact count of every object in space.`, interpreted:{time:catalog.simulationTime, datasetId:catalog.datasetId}, result, evidence:evidence(), action:{type:'filter', filterPatch:{purpose}}, trace:['countObjects','purposeTagMethod','proposeSceneAction']});
      }
      const band = text.match(/(?:between\s+)?(\d+)\s*(?:to|and|-|–)\s*(\d+)\s*km/);
      const result = count({min:band?.[1], max:band?.[2], type:text.includes('debris') ? 'DEBRIS' : 'all'});
      if (!band) {
        const answer = await modelAnswer(message, recentHistory) || offlineGeneralAnswer(text, contextText);
        return send(res, {answer, evidence:evidence(), trace:[process.env.PORTKEY_API_KEY ? 'generalModel' : 'offlineGeneralAnswer'], interpreted:{time:catalog.simulationTime, datasetId:catalog.datasetId}});
      }
      return send(res, {answer:`${result.data.count} cataloged object${result.data.count === 1 ? '' : 's'} match the requested band in ${datasetLabel()}. Breakdown: ${result.data.breakdown.PAYLOAD} payloads, ${result.data.breakdown.DEBRIS} debris objects, ${result.data.breakdown['ROCKET BODY']} rocket bodies, and ${result.data.breakdown.UNKNOWN} unknown.`, interpreted:{time:catalog.simulationTime, datasetId:catalog.datasetId}, result, evidence:evidence(), action:{type:'filter', filterPatch:{min:band?.[1] || '', max:band?.[2] || '', type:text.includes('debris') ? 'DEBRIS' : 'all'}}, trace:['countObjects','proposeSceneAction']});
    } catch { return send(res, {error:'Invalid agent request'}, 400); }
  }
  if (url.pathname.startsWith('/')) {
    const file = path.join(publicDir, url.pathname === '/' ? '/index.html' : url.pathname);
    if (!file.startsWith(publicDir) || !fs.existsSync(file)) return send(res, {error:'Not found'}, 404);
    const extension = path.extname(file);
    const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.jpg':'image/jpeg'};
    return send(res, fs.readFileSync(file), 200, types[extension] || 'application/octet-stream');
  }
}
const port = Number(process.env.ORBITBRIEF_PORT || 4173);
http.createServer(handler).listen(port, '127.0.0.1', () => console.log(`OrbitBrief running at http://127.0.0.1:${port}`));
