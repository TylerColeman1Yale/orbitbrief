const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.head.insertAdjacentHTML('beforeend', `<style>
  #globe { touch-action: none; }
  #dots { z-index: 2; pointer-events: auto; }
  .earth { pointer-events: none; }
  .earth-surface { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; }
  .earth { background-image: radial-gradient(circle at 30% 25%, #ffffff33 0%, transparent 18%, #010817aa 80%), url('/earth-texture.jpg'); background-size: 100% 100%, 200% 100%; background-position: center, center; background-repeat: no-repeat, repeat-x; box-shadow: inset -42px -30px 72px #010817cc, inset 18px 10px 34px #e5ffff66, 0 0 0 2px #83edff66, 0 0 58px #0ca9df66, 0 0 130px #0c78c333; transform-style: preserve-3d; }
  .land { display: none; }
  .earth::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 24% 20%, #ffffff55 0 2%, transparent 13%), repeating-linear-gradient(166deg, transparent 0 12px, #b9efff12 13px 14px, transparent 15px 27px); mix-blend-mode: screen; opacity: .7; }
  .earth::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle at 28% 24%, transparent 0 42%, #020b20aa 78%, #01050e 100%); pointer-events: none; }
  .right, .sidebar { position: relative; z-index: 10; }
  .timebar { position: relative; z-index: 20; pointer-events: auto; }
  #play, #speed, #plus, #now { pointer-events: auto; position: relative; z-index: 21; }
  main { height: calc(100vh - 64px); min-height: 0; }
  .right { height: 100%; overflow: hidden; }
  .messages { min-height: 0; }
  .prompts, #chat { flex-shrink: 0; }
  .msg { position: relative; }
  .close-card { position: absolute; right: 7px; top: 5px; border: 0; background: none; color: #9eb2cd; font-size: 20px; cursor: pointer; }
  .close-card:hover { color: #fff; }
  .satdot { z-index: 3; padding: 0; }
  .satdot.behind { display: none; }
  .right { min-height: 0; }
  .messages { min-height: 120px; }
</style>`);

let catalog;
let state = { time: '2026-10-24T00:00:00Z', yaw: -105, pitch: 30, zoom: 1, xray: false };
let conversation = [];
let timer = null;
let simulationLastFrame = 0;
let realPositions = new Map();
let realPositionTime = null;
let lastPositionSync = 0;
let positionSync = null;
let positionSyncQueued = false;
const earthElement = $('.earth');
const earthSurface = document.createElement('canvas');
earthSurface.className = 'earth-surface';
earthSurface.setAttribute('aria-hidden', 'true');
earthElement.prepend(earthSurface);

function createEarthRenderer(canvas) {
  const gl = canvas.getContext('webgl', {alpha:true, antialias:true, depth:true, premultipliedAlpha:true});
  if (!gl) return null;
  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec2 aUv;
    uniform float uYaw;
    uniform float uPitch;
    varying vec2 vUv;
    varying float vLight;
    void main() {
      float cy = cos(uYaw);
      float sy = sin(uYaw);
      float cp = cos(uPitch);
      float sp = sin(uPitch);
      float xYaw = aPosition.x * cy - aPosition.z * sy;
      float zYaw = aPosition.x * sy + aPosition.z * cy;
      float yRot = aPosition.y * cp - zYaw * sp;
      float zRot = aPosition.y * sp + zYaw * cp;
      gl_Position = vec4(xYaw, yRot, -zRot, 1.0);
      vUv = aUv;
      vec3 light = normalize(vec3(-0.38, 0.48, 1.0));
      vLight = 0.78 + 0.22 * max(dot(normalize(vec3(xYaw, yRot, zRot)), light), 0.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    uniform sampler2D uTexture;
    varying vec2 vUv;
    varying float vLight;
    void main() {
      vec4 color = texture2D(uTexture, vUv);
      gl_FragColor = vec4(color.rgb * vLight, color.a);
    }
  `;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const latitudeSegments = 72;
  const longitudeSegments = 144;
  const vertices = [];
  const indices = [];
  for (let row = 0; row <= latitudeSegments; row += 1) {
    const latitude = Math.PI / 2 - row * Math.PI / latitudeSegments;
    const cosLatitude = Math.cos(latitude);
    for (let column = 0; column <= longitudeSegments; column += 1) {
      const longitude = -Math.PI + column * 2 * Math.PI / longitudeSegments;
      vertices.push(cosLatitude * Math.sin(longitude), Math.sin(latitude), cosLatitude * Math.cos(longitude), column / longitudeSegments, row / latitudeSegments);
    }
  }
  for (let row = 0; row < latitudeSegments; row += 1) {
    for (let column = 0; column < longitudeSegments; column += 1) {
      const current = row * (longitudeSegments + 1) + column;
      const next = current + longitudeSegments + 1;
      indices.push(current, next, current + 1, current + 1, next, next + 1);
    }
  }
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  gl.disable(gl.CULL_FACE);

  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  const uvLocation = gl.getAttribLocation(program, 'aUv');
  const yawLocation = gl.getUniformLocation(program, 'uYaw');
  const pitchLocation = gl.getUniformLocation(program, 'uPitch');
  const textureLocation = gl.getUniformLocation(program, 'uTexture');
  let textureReady = false;
  return {
    setTexture(image) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      textureReady = true;
    },
    draw(yaw, pitch) {
      if (!textureReady) return;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(earthSurface.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(earthSurface.clientHeight * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(uvLocation);
      gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 20, 12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.uniform1f(yawLocation, yaw);
      gl.uniform1f(pitchLocation, pitch);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(textureLocation, 0);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    }
  };
}

const earthRenderer = createEarthRenderer(earthSurface);
const earthTexture = new Image();
earthTexture.onload = () => {
  earthRenderer?.setTexture(earthTexture);
  drawEarth();
};
earthTexture.src = '/earth-texture.jpg';

function drawEarth() {
  earthRenderer?.draw(state.yaw * Math.PI / 180, state.pitch * Math.PI / 180);
}

const backsideToggle = document.createElement('button');
backsideToggle.type = 'button';
backsideToggle.textContent = 'Backside: off';
backsideToggle.title = 'Show dimmed objects behind Earth';
backsideToggle.addEventListener('click', () => {
  state.xray = !state.xray;
  backsideToggle.textContent = `Backside: ${state.xray ? 'on' : 'off'}`;
  render();
});
$('.stagebar').append(backsideToggle);

function modelPosition(object, at) {
  if (realPositions.has(object.noradId)) return realPositions.get(object.noradId);
  if (catalog && at === catalog.simulationTime && object.position) return object.position;
  if (object.perigeeKm == null || object.apogeeKm == null) return null;
  const minutes = (Date.parse(at) - Date.parse(catalog.simulationTime)) / 60000;
  const angle = ((object.meanAnomaly || 0) + minutes * (object.meanMotion || 0) * 6) * Math.PI / 180;
  const radius = (object.perigeeKm + object.apogeeKm) / 2 + 6371;
  const inclination = (object.inclination || 0) * Math.PI / 180;
  return {
    altitudeKm: Math.round(radius - 6371),
    longitude: ((angle * 180 / Math.PI + 540) % 360) - 180,
    latitude: Math.asin(Math.sin(angle) * Math.sin(inclination)) * 180 / Math.PI
  };
}

async function syncRealPositions(force = false) {
  if (!catalog) return null;
  if (positionSync) {
    if (force) positionSyncQueued = true;
    return positionSync;
  }
  if (!force && Date.now() - lastPositionSync < 750) return positionSync;
  lastPositionSync = Date.now();
  const params = new URLSearchParams({time:state.time, type:$('#type').value, purpose:$('#purpose').value, search:$('#search').value, min:$('#min').value, max:$('#max').value});
  positionSync = fetch(`/api/positions?${params.toString()}`, {cache:'no-store'}).then((response) => {
    if (!response.ok) throw new Error('position refresh failed');
    return response.json();
  }).then((payload) => {
    // The server may cap refreshes for the large real catalog. Keep every
    // previously verified position and replace only the records refreshed in
    // this response. Replacing the whole map would make omitted objects fall
    // back to the simplified orbit model and visibly flicker between models.
    const nextPositions = new Map(realPositions);
    for (const entry of payload.positions || []) {
      if (entry.position) nextPositions.set(entry.noradId, entry.position);
    }
    realPositions = nextPositions;
    realPositionTime = payload.simulationTime;
    render();
  }).catch(() => {}).finally(() => {
    positionSync = null;
    if (positionSyncQueued) {
      positionSyncQueued = false;
      syncRealPositions(true);
    }
  });
  return positionSync;
}

function filteredObjects() {
  const search = $('#search').value.trim().toLowerCase();
  const type = $('#type').value;
  const purpose = $('#purpose').value;
  const min = $('#min').value;
  const max = $('#max').value;
  return catalog.objects.filter((object) => {
    const position = modelPosition(object, state.time);
    return (!type || type === 'all' || object.objectType === type) &&
      (!purpose || purpose === 'all' || object.purpose.includes(purpose)) &&
      (!search || String(object.noradId).includes(search) || object.name.toLowerCase().includes(search)) &&
      (!min || (position && position.altitudeKm >= Number(min))) &&
      (!max || (position && position.altitudeKm < Number(max)));
  });
}

function projectToGlobe(position) {
  const latitude = position.latitude * Math.PI / 180;
  const longitude = position.longitude * Math.PI / 180;
  const yaw = state.yaw * Math.PI / 180;
  const pitch = state.pitch * Math.PI / 180;
  let x = Math.cos(latitude) * Math.sin(longitude);
  let y = Math.sin(latitude);
  let z = Math.cos(latitude) * Math.cos(longitude);
  const xAfterYaw = x * Math.cos(yaw) - z * Math.sin(yaw);
  const zAfterYaw = x * Math.sin(yaw) + z * Math.cos(yaw);
  const yAfterPitch = y * Math.cos(pitch) - zAfterYaw * Math.sin(pitch);
  const zAfterPitch = y * Math.sin(pitch) + zAfterYaw * Math.cos(pitch);
  return { x: xAfterYaw, y: yAfterPitch, depth: zAfterPitch };
}

function drawCatalogCanvas(objects, dots) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Cataloged orbital objects');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:3;cursor:pointer;';
  const width = Math.max(1, dots.clientWidth);
  const height = Math.max(1, dots.clientHeight);
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  const context = canvas.getContext('2d');
  context.scale(pixelRatio, pixelRatio);
  const hits = [];
  for (const object of objects) {
    const position = modelPosition(object, state.time);
    if (!position) continue;
    const projected = projectToGlobe(position);
    if (projected.depth < -0.05 && !state.xray) continue;
    const radius = 30 * state.zoom * (1 + Math.min(0.65, position.altitudeKm / 18000));
    const x = width * (0.5 + projected.x * radius / 100);
    const y = height * (0.47 - projected.y * radius / 100);
    const size = 2 + Math.max(0, projected.depth) * 2.5;
    context.globalAlpha = projected.depth < -0.05 ? 0.08 : 0.22;
    context.strokeStyle = object.color;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x - 18 * projected.x, y - 18 * projected.y);
    context.stroke();
    context.globalAlpha = projected.depth < -0.05 ? 0.24 : 0.95;
    context.fillStyle = object.color;
    context.shadowColor = object.color;
    context.shadowBlur = 8;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    hits.push({object, x, y, radius:Math.max(8, size + 5)});
  }
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = hits.find((candidate) => Math.hypot(candidate.x - x, candidate.y - y) <= candidate.radius);
    if (hit) showObject(hit.object);
  });
  dots.append(canvas);
}

function render() {
  const objects = filteredObjects();
  const dots = $('#dots');
  dots.replaceChildren();

  if (objects.length > 1000) drawCatalogCanvas(objects, dots);
  if (objects.length <= 1000) objects.forEach((object) => {
    const position = modelPosition(object, state.time);
    if (!position) return;
    const projected = projectToGlobe(position);
    const radius = 30 * state.zoom * (1 + Math.min(0.65, position.altitudeKm / 18000));
    const x = 50 + projected.x * radius;
    const y = 47 - projected.y * radius;
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `satdot${projected.depth < -0.05 && !state.xray ? ' behind' : ''}`;
    dot.style.left = `${x}%`;
    dot.style.top = `${y}%`;
    dot.style.color = object.color;
    dot.style.background = object.color;
    dot.style.transform = `translate(-50%, -50%) scale(${0.72 + Math.max(0, projected.depth) * 0.35})`;
    dot.title = `${object.name} · NORAD ${object.noradId}`;
    dot.addEventListener('pointerdown', (event) => event.stopPropagation());
    dot.addEventListener('click', (event) => {
      event.stopPropagation();
      showObject(object);
    });
    dots.append(dot);

    if (projected.depth >= -0.05 || state.xray) {
      const trail = document.createElement('div');
      trail.className = 'trail';
      trail.style.left = `${x}%`;
      trail.style.top = `${y}%`;
      trail.style.color = object.color;
      trail.style.transform = `rotate(${Math.atan2(projected.y, projected.x) * 180 / Math.PI + 180}deg)`;
      dots.append(trail);
    }
  });

  $('.earth').style.transform = `translate(-50%, -53%) scale(${state.zoom})`;
  $('.earth').style.backgroundPosition = `center, calc(50% + ${state.yaw / 3.6}%) center`;
  drawEarth();
  const yawRadians = state.yaw * Math.PI / 180;
  const pitchRadians = state.pitch * Math.PI / 180;
  $('.land.one').style.transform = `translate(${Math.sin(yawRadians) * 42}px, ${Math.sin(pitchRadians) * 24}px) rotate(${state.yaw * 0.18}deg) scaleX(${0.55 + Math.abs(Math.cos(yawRadians)) * 0.45})`;
  $('.land.two').style.transform = `translate(${Math.sin(yawRadians + 1.8) * 34}px, ${Math.sin(pitchRadians + 0.8) * 18}px) rotate(${-state.yaw * 0.12}deg) scaleX(${0.55 + Math.abs(Math.cos(yawRadians + 1.8)) * 0.45})`;
  $('.land.three').style.transform = `translate(${Math.sin(yawRadians + 3.4) * 30}px, ${Math.sin(pitchRadians + 1.4) * 20}px) rotate(${state.yaw * 0.08}deg) scaleX(${0.55 + Math.abs(Math.cos(yawRadians + 3.4)) * 0.45})`;
  $('#shown').textContent = objects.length;
  $('.status').textContent = `● ${catalog.coverage?.mode?.startsWith('real-') ? 'REAL CELESTRAK SNAPSHOT' : 'OFFLINE DEMO SNAPSHOT'} · ${catalog.objects.length.toLocaleString()} OBJECTS`;
  $('#payloads').textContent = objects.filter((object) => object.objectType === 'PAYLOAD').length;
  $('#debris').textContent = objects.filter((object) => object.objectType === 'DEBRIS').length;
  $('#rocket').textContent = objects.filter((object) => object.objectType === 'ROCKET BODY').length;
  const band = $('#min').value && $('#max').value ? ` at ${$('#min').value}–${$('#max').value} km` : '';
  $('#banner').textContent = `${timer ? 'SIMULATING · ' : ''}Showing ${objects.length} cataloged object${objects.length === 1 ? '' : 's'}${band}`;
}

function showObject(object) {
  const position = modelPosition(object, state.time);
  addMessage(`<button class="close-card" type="button" aria-label="Close">×</button><b>${escapeHtml(object.name)}</b><br>NORAD ${escapeHtml(object.noradId)} · ${escapeHtml(object.objectType)} · ${escapeHtml(object.status)}<br><span class="muted">${escapeHtml(object.orbitGroup)} · modeled altitude ${escapeHtml(position?.altitudeKm ?? 'unknown')} km · inclination ${escapeHtml(object.inclination ?? 'unknown')}°</span><div class="evidence">Snapshot source · element epoch ${escapeHtml(object.epoch)}</div>`, 'assistant', true);
  const close = $('.close-card');
  if (close) close.addEventListener('click', (event) => event.currentTarget.parentElement.remove());
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

function addMessage(html, kind, trusted = false) {
  const message = document.createElement('div');
  message.className = `msg ${kind}`;
  if (trusted) message.innerHTML = html;
  else message.textContent = html;
  $('#messages').append(message);
  $('#messages').scrollTop = $('#messages').scrollHeight;
}

async function ask(question) {
  const value = question.trim();
  if (!value) return;
  addMessage(value, 'user');
  $('#question').value = '';
  conversation.push({role:'user', content:value});
  conversation = conversation.slice(-12);
  try {
    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: value, history: conversation.slice(-10) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Agent request failed');
    if (result.action?.filterPatch) {
      $('#type').value = result.action.filterPatch.type || 'all';
      $('#purpose').value = result.action.filterPatch.purpose || 'all';
      $('#min').value = result.action.filterPatch.min || '';
      $('#max').value = result.action.filterPatch.max || '';
      if (result.action.filterPatch.simulationTime) {
        state.time = result.action.filterPatch.simulationTime;
        $('#clock').textContent = `${state.time.replace('T', ' ').slice(0, 16)} UTC`;
      }
      render();
      syncRealPositions(true);
    }
    conversation.push({role:'assistant', content:result.answer});
    conversation = conversation.slice(-12);
    const citations = (result.evidence || []).filter((source) => source?.url && /^https?:\/\//i.test(source.url)).map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.publisher || source.sourceId || 'source')}</a>`).join(' · ');
    addMessage(`${escapeHtml(result.answer)}<div class="trace">Tools: ${(result.trace || []).map(escapeHtml).join(' → ')}<br>Time: ${escapeHtml(result.interpreted?.time || state.time)} · Dataset: ${escapeHtml(result.interpreted?.datasetId || catalog.datasetId)}</div><div class="evidence">${citations || 'Dataset evidence is shown in the answer context.'}</div>`, 'assistant', true);
  } catch (error) {
    addMessage(`The analyst request failed: ${error.message}. Confirm the Terminal still shows OrbitBrief running, then refresh the page.`, 'assistant');
  }
}

function switchTab(index) {
  $$('.tabs button').forEach((button, buttonIndex) => button.classList.toggle('active', buttonIndex === index));
  const prompts = $('.prompts');
  const chat = $('#chat');
  if (index === 0) {
    $('#messages').innerHTML = '<div class="msg assistant">Ask a question and I’ll show the interpreted filters, evidence, and a reversible scene action.</div>';
    prompts.style.display = 'grid';
    chat.style.display = 'flex';
  } else if (index === 1) {
    const launchIds = [...new Set(catalog.objects.filter((object) => object.launch).map((object) => object.launch.id))];
    $('#messages').innerHTML = `<div class="msg assistant"><b>Launch Explorer</b><br>Offline launch snapshot: ${launchIds.length} unique launch events linked to the demo objects.<div class="evidence">Launch fields are fixture-backed. Refresh with Launch Library 2 before calling this current.</div></div>`;
    prompts.style.display = 'none';
    chat.style.display = 'none';
  } else {
    $('#messages').innerHTML = '<div class="msg assistant"><b>Sources & methods</b><br>CelesTrak GP/OMM and SATCAT are the intended orbital sources. NASA Orbital Debris and NASA CARA support the learning panels.<div class="evidence"><a href="https://celestrak.org/NORAD/documentation/gp-data-formats.php" target="_blank">CelesTrak GP docs</a><br><a href="https://orbitaldebris.jsc.nasa.gov/" target="_blank">NASA Orbital Debris</a><br><a href="https://www.nasa.gov/cara/" target="_blank">NASA CARA</a></div></div>';
    prompts.style.display = 'none';
    chat.style.display = 'none';
  }
}

$('#chat').addEventListener('submit', (event) => {
  event.preventDefault();
  ask($('#question').value);
});
$$('.prompts button').forEach((button) => button.addEventListener('click', () => ask(button.dataset.q)));
$$('.tabs button').forEach((button, index) => button.addEventListener('click', () => switchTab(index)));
['search', 'type', 'purpose', 'min', 'max'].forEach((id) => {
  $( `#${id}` ).addEventListener('input', () => { render(); syncRealPositions(true); });
  $( `#${id}` ).addEventListener('change', () => { render(); syncRealPositions(true); });
});

$('#reset').addEventListener('click', () => {
  ['search', 'min', 'max'].forEach((id) => { $(`#${id}`).value = ''; });
  $('#type').value = 'all';
  $('#purpose').value = 'all';
  render();
  syncRealPositions(true);
});

$('#plus').addEventListener('click', () => {
  state.time = new Date(Date.parse(state.time) + 3600000).toISOString();
  $('#clock').textContent = `${state.time.replace('T', ' ').slice(0, 16)} UTC`;
  render();
  syncRealPositions(true);
});
$('#now').addEventListener('click', () => {
  state.time = catalog.simulationTime;
  $('#clock').textContent = '2026-10-24 00:00 UTC';
  render();
  syncRealPositions(true);
});
$('#resetView').addEventListener('click', () => {
  state.yaw = -105;
  state.pitch = 30;
  state.zoom = 1;
  render();
});
$('#play').addEventListener('click', () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    $('#play').textContent = '▶';
    render();
    return;
  }
  timer = window.setInterval(() => {
    try {
      const simulatedMilliseconds = 100 * 60 * Number($('#speed').value || 1);
      state.time = new Date(Date.parse(state.time) + simulatedMilliseconds).toISOString();
      $('#clock').textContent = `${state.time.replace('T', ' ').slice(0, 16)} UTC`;
      $('#banner').textContent = `SIMULATING · ${state.time.replace('T', ' ').slice(0, 16)} UTC`;
      render();
      syncRealPositions();
    } catch (error) {
      window.clearInterval(timer);
      timer = null;
      $('#play').textContent = '▶';
      addMessage(`Simulation stopped: ${error.message}`, 'assistant');
    }
  }, 100);
  $('#play').textContent = 'Ⅱ';
  render();
});

let dragging = false;
let lastX = 0;
let lastY = 0;
$('#globe').addEventListener('pointerdown', (event) => {
  if (event.target.closest('.satdot')) return;
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  $('#globe').setPointerCapture(event.pointerId);
});
$('#globe').addEventListener('pointerup', () => { dragging = false; });
$('#globe').addEventListener('pointercancel', () => { dragging = false; });
$('#globe').addEventListener('pointermove', (event) => {
  if (!dragging) return;
  state.yaw += (event.clientX - lastX) * 0.45;
  state.pitch += (event.clientY - lastY) * 0.45;
  lastX = event.clientX;
  lastY = event.clientY;
  render();
});
$('#globe').addEventListener('wheel', (event) => {
  event.preventDefault();
  state.zoom = Math.max(0.7, Math.min(1.8, state.zoom - event.deltaY * 0.001));
  render();
}, { passive: false });

fetch('/api/catalog', { cache: 'no-store' })
  .then((response) => { if (!response.ok) throw new Error('catalog endpoint unavailable'); return response.json(); })
  .then((data) => { catalog = data; state.time = catalog.simulationTime; realPositions = new Map(catalog.objects.filter((object) => object.position).map((object) => [object.noradId, object.position])); realPositionTime = catalog.simulationTime; $('#clock').textContent = `${state.time.replace('T', ' ').slice(0, 16)} UTC`; render(); })
  .catch((error) => addMessage(`The catalog could not load: ${error.message}. Keep the local server running and refresh.`, 'assistant'));
