const $ = s => document.querySelector(s);
const au = new Audio();
let tr = [], ix = -1, shuf = false, rep = 0; // rep: 0 apagado, 1 lista, 2 una

/* Burbujas de fondo */
(() => {
  const b = $('#bubbles');
  for (let i = 0; i < 16; i++) {
    const e = document.createElement('i'), s = 14 + Math.random() * 60;
    e.style.cssText = `width:${s}px;height:${s}px;left:${Math.random() * 100}%;animation-duration:${14 + Math.random() * 18}s;animation-delay:-${Math.random() * 20}s`;
    b.appendChild(e);
  }
})();

/* Controles de ventana */
$('#min').onclick = () => window.winCtl && winCtl.min();
$('#max').onclick = () => window.winCtl && winCtl.max();
$('#close').onclick = () => window.winCtl ? winCtl.close() : window.close();

/* Utilidades */
const fmt = t => isFinite(t) ? Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0') : '0:00';
const setP = (el, v, max) => el.style.setProperty('--p', (v / max * 100) + '%');
const ICON_PLAY = '<path d="M8 5v14l11-7z"/>', ICON_PAUSE = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';

/* Lista */
function addFiles(files) {
  [...files].filter(f => f.type.startsWith('audio') || /\.(mp3|flac|wav|ogg|m4a|opus)$/i.test(f.name)).forEach(f => {
    const t = { name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) };
    tr.push(t);
    readTags(f).then(m => { Object.assign(t, m); if (tr[ix] === t) show(t); render(); });
  });
  if (ix < 0 && tr.length) load(0, false); else render();
}
function render() {
  const pl = $('#pl');
  if (!tr.length) { pl.innerHTML = '<div class="empty">Arrastra tus archivos aquí<br>o pulsa «Añadir».</div>'; }
  else {
    pl.innerHTML = '';
    tr.forEach((t, i) => {
      const li = document.createElement('li');
      const nm = t.title ? (t.artist ? t.artist + ' – ' + t.title : t.title) : t.name;
      const sp = document.createElement('span'); sp.className = 'nm'; sp.textContent = (i + 1) + '. ' + nm;
      const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×'; rm.title = 'Quitar de la lista';
      rm.onclick = e => { e.stopPropagation(); removeAt(i); };
      li.append(sp, rm);
      li.title = nm;
      if (i === ix) li.className = 'on';
      li.onclick = () => load(i, true);
      pl.appendChild(li);
    });
  }
  $('#count').textContent = (ix + 1) + ' / ' + tr.length;
}
function load(i, play) {
  ix = i; au.src = tr[i].url;
  show(tr[i]);
  render();
  if (play) { initA(); au.play(); }
}

/* Etiquetas ID3 (título, artista, álbum y portada) */
const sync = (dv, o) => (dv.getUint8(o) << 21) | (dv.getUint8(o + 1) << 14) | (dv.getUint8(o + 2) << 7) | dv.getUint8(o + 3);
function dec(u8, enc) {
  let label = 'windows-1252';
  if (enc === 1) { label = 'utf-16le'; if (u8[0] === 0xFE && u8[1] === 0xFF) { label = 'utf-16be'; u8 = u8.subarray(2); } else if (u8[0] === 0xFF && u8[1] === 0xFE) u8 = u8.subarray(2); }
  else if (enc === 2) label = 'utf-16be';
  else if (enc === 3) label = 'utf-8';
  return new TextDecoder(label).decode(u8).replace(/\0+$/, '').replace(/\0/g, ' / ').trim();
}
function pic(d, v2) {
  const enc = d[0]; let p = 1;
  if (v2) p = 4; else { while (p < d.length && d[p] !== 0) p++; p++; }   // tipo MIME
  p++;                                                                   // tipo de imagen
  if (enc === 1 || enc === 2) { while (p + 1 < d.length && !(d[p] === 0 && d[p + 1] === 0)) p += 2; p += 2; }
  else { while (p < d.length && d[p] !== 0) p++; p++; }                  // descripción
  if (p >= d.length) return null;
  const mime = d[p] === 0x89 ? 'image/png' : 'image/jpeg';
  return URL.createObjectURL(new Blob([d.subarray(p)], { type: mime }));
}
/* FLAC: textos (Vorbis comment) y portada (PICTURE) */
async function readFlac(file) {
  const out = {};
  try {
    let pos = 4;                                   // salta las letras "fLaC"
    while (pos < file.size) {
      const hd = new DataView(await file.slice(pos, pos + 4).arrayBuffer());
      const last = hd.getUint8(0) & 0x80, type = hd.getUint8(0) & 0x7F;
      const len = (hd.getUint8(1) << 16) | (hd.getUint8(2) << 8) | hd.getUint8(3);
      pos += 4;
      if (type === 4 || (type === 6 && !out.cover)) {
        const buf = await file.slice(pos, pos + len).arrayBuffer();
        const dv = new DataView(buf), u = new Uint8Array(buf);
        if (type === 4) {                          // textos: TITLE=..., ARTIST=...
          let p = 4 + dv.getUint32(0, true);       // salta el "vendor"
          const n = dv.getUint32(p, true); p += 4;
          for (let i = 0; i < n; i++) {
            const l = dv.getUint32(p, true); p += 4;
            const txt = new TextDecoder().decode(u.subarray(p, p + l)); p += l;
            const k = txt.indexOf('=');
            if (k < 0) continue;
            const key = txt.slice(0, k).toUpperCase(), val = txt.slice(k + 1);
            if (key === 'TITLE') out.title = val;
            else if (key === 'ARTIST') out.artist = val;
            else if (key === 'ALBUM') out.album = val;
          }
        } else {                                   // portada
          let p = 4;
          p += 4 + dv.getUint32(p);                // salta el tipo MIME
          p += 4 + dv.getUint32(p);                // salta la descripción
          p += 16;                                 // ancho, alto, profundidad, colores
          const n = dv.getUint32(p); p += 4;
          const img = u.subarray(p, p + n);
          out.cover = URL.createObjectURL(new Blob([img], { type: img[0] === 0x89 ? 'image/png' : 'image/jpeg' }));
        }
      }
      pos += len;
      if (last) break;                             // era el último bloque
    }
  } catch (_) {}
  return out;
}

async function readTags(file) {
  const out = {};
  try {
    const sig = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (String.fromCharCode(...sig) === 'fLaC') return readFlac(file);
    const h = new DataView(await file.slice(0, 10).arrayBuffer());
    if (h.getUint8(0) !== 0x49 || h.getUint8(1) !== 0x44 || h.getUint8(2) !== 0x33) return out;
    const ver = h.getUint8(3), flags = h.getUint8(5), size = sync(h, 6);
    const buf = await file.slice(10, 10 + Math.min(size, 20e6)).arrayBuffer();
    const b = new Uint8Array(buf), dv = new DataView(buf);
    let p = 0;
    if (flags & 0x40) p = ver === 4 ? sync(dv, 0) : dv.getUint32(0) + 4;
    const idLen = ver === 2 ? 3 : 4, hLen = ver === 2 ? 6 : 10;
    while (p + hLen <= b.length) {
      const id = String.fromCharCode(...b.subarray(p, p + idLen));
      if (!/^[A-Z0-9]+$/.test(id)) break;
      const fs = ver === 2 ? (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5] : ver === 4 ? sync(dv, p + 4) : dv.getUint32(p + 4);
      const s = p + hLen, e = s + fs;
      if (fs <= 0 || e > b.length) break;
      const d = b.subarray(s, e);
      if (id === 'TIT2' || id === 'TT2') out.title = dec(d.subarray(1), d[0]);
      else if (id === 'TPE1' || id === 'TP1') out.artist = dec(d.subarray(1), d[0]);
      else if (id === 'TALB' || id === 'TAL') out.album = dec(d.subarray(1), d[0]);
      else if ((id === 'APIC' || id === 'PIC') && !out.cover) out.cover = pic(d, ver === 2);
      p = e;
    }
  } catch (_) {}
  return out;
}
function show(t) {
  $('#title').textContent = t.title || t.name;
  $('#info').textContent = [t.artist, t.album].filter(Boolean).join(' · ') || 'MP3';
  const art = $('#art');
  if (t.cover) art.src = t.cover; else art.removeAttribute('src');
  $('#cover').classList.toggle('has', !!t.cover);
}

/* Reproducción */
function toggle() {
  if (ix < 0) return $('#file').click();
  initA();
  au.paused ? au.play() : au.pause();
}
function next(auto) {
  if (!tr.length) return;
  let i;
  if (shuf && tr.length > 1) { do { i = Math.floor(Math.random() * tr.length); } while (i === ix); }
  else { i = ix + 1; if (i >= tr.length) { if (rep === 1 || !auto) i = 0; else { au.pause(); au.currentTime = 0; return; } } }
  load(i, true);
}
function prev() {
  if (!tr.length) return;
  if (au.currentTime > 3) au.currentTime = 0; else load((ix - 1 + tr.length) % tr.length, true);
}
au.onplay = () => $('#pi').innerHTML = ICON_PAUSE;
au.onpause = () => $('#pi').innerHTML = ICON_PLAY;
au.onended = () => rep === 2 ? (au.currentTime = 0, au.play()) : next(true);
au.onloadedmetadata = () => $('#dur').textContent = fmt(au.duration);
au.ontimeupdate = () => {
  const v = au.duration ? au.currentTime / au.duration * 1000 : 0;
  $('#seek').value = v; setP($('#seek'), v, 1000);
  $('#cur').textContent = fmt(au.currentTime);
};
$('#seek').oninput = e => { if (au.duration) au.currentTime = e.target.value / 1000 * au.duration; setP(e.target, e.target.value, 1000); };
$('#vol').oninput = e => { au.volume = e.target.value / 100; setP(e.target, e.target.value, 100); };
au.volume = .8; setP($('#vol'), 80, 100);

$('#play').onclick = toggle;
$('#next').onclick = () => next(false);
$('#prev').onclick = prev;
$('#shuf').onclick = e => { shuf = !shuf; e.currentTarget.classList.toggle('on', shuf); };
$('#rep').onclick = e => { rep = (rep + 1) % 3; e.currentTarget.classList.toggle('on', rep > 0); e.currentTarget.title = ['Repetir: no', 'Repetir lista', 'Repetir canción'][rep]; };
$('#add').onclick = () => $('#file').click();
$('#file').onchange = e => { addFiles(e.target.files); e.target.value = ''; };

/* Quitar canciones */
function freeTrack(t) { URL.revokeObjectURL(t.url); if (t.cover) URL.revokeObjectURL(t.cover); }
function resetUI() {
  $('#title').textContent = 'Sin canción';
  $('#info').textContent = 'Añade tus MP3 para empezar';
  $('#cover').classList.remove('has'); $('#art').removeAttribute('src');
  $('#cur').textContent = $('#dur').textContent = '0:00';
  $('#seek').value = 0; setP($('#seek'), 0, 1000);
}
function clearAll() {
  tr.forEach(freeTrack); tr = []; ix = -1;
  au.pause(); au.removeAttribute('src'); au.load();
  resetUI(); render();
}
function removeAt(i) {
  const was = !au.paused, isCur = i === ix;
  freeTrack(tr[i]); tr.splice(i, 1);
  if (!tr.length) return clearAll();
  if (isCur) load(Math.min(i, tr.length - 1), was);
  else { if (i < ix) ix--; render(); }
}
$('#clr').onclick = clearAll;

/* Temas de color */
const C = {}, THEMES = ['aqua', 'negro', 'gris', 'rojo'];
function setTheme(n) {
  if (!THEMES.includes(n)) n = 'aqua';
  document.documentElement.dataset.theme = n;
  try { localStorage.setItem('theme', n); } catch (_) {}
  const s = getComputedStyle(document.documentElement);
  C.ac = s.getPropertyValue('--ac').trim(); C.top = s.getPropertyValue('--ttl').trim(); C.g2 = s.getPropertyValue('--g2').trim();
  document.querySelectorAll('.dot').forEach(d => d.classList.toggle('sel', d.dataset.t === n));
}
THEMES.forEach(n => {
  const b = document.createElement('button');
  b.className = 'dot'; b.dataset.t = n; b.title = 'Tema ' + n; b.setAttribute('aria-label', 'Tema ' + n);
  b.onclick = () => setTheme(n); $('#themes').appendChild(b);
});


addEventListener('dragover', e => { e.preventDefault(); $('#app').classList.add('drop'); });
addEventListener('dragleave', () => $('#app').classList.remove('drop'));
addEventListener('drop', e => { e.preventDefault(); $('#app').classList.remove('drop'); addFiles(e.dataTransfer.files); });


addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if (e.code === 'ArrowRight') au.currentTime = Math.min(au.duration || 0, au.currentTime + 5);
  else if (e.code === 'ArrowLeft') au.currentTime = Math.max(0, au.currentTime - 5);
  else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    e.preventDefault();
    const v = $('#vol'); v.value = Math.max(0, Math.min(100, +v.value + (e.code === 'ArrowUp' ? 5 : -5))); v.oninput({ target: v });
  }
});

/* Visualizador */
let ctx, an, data;
function initA() {
  if (!ctx) {
    ctx = new AudioContext();
    const src = ctx.createMediaElementSource(au);
    an = ctx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = .82;
    src.connect(an); an.connect(ctx.destination);
    data = new Uint8Array(an.frequencyBinCount);
  }
  ctx.resume();
}
const cv = $('#viz'), g = cv.getContext('2d');
function draw() {
  requestAnimationFrame(draw);
  const dpr = devicePixelRatio || 1, w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  g.clearRect(0, 0, w, h);
  const N = 36, gap = 5 * dpr, bw = (w - gap * (N - 1)) / N, base = h * .68;
  if (an) an.getByteFrequencyData(data);
  for (let i = 0; i < N; i++) {
    const v = an ? data[Math.floor(i * 1.9)] / 255 : 0.04;
    const bh = Math.max(4 * dpr, v * base), x = i * (bw + gap);
    const grad = g.createLinearGradient(0, base - bh, 0, base);
    grad.addColorStop(0, C.top); grad.addColorStop(.35, C.ac); grad.addColorStop(1, C.g2);
    g.shadowColor = C.ac; g.shadowBlur = 10 * dpr; g.fillStyle = grad;
    g.beginPath(); g.roundRect(x, base - bh, bw, bh, bw / 2.5); g.fill();
    // reflejo
    g.shadowBlur = 0; g.globalAlpha = .22; g.fillStyle = C.ac;
    g.beginPath(); g.roundRect(x, base + 3 * dpr, bw, bh * .45, bw / 2.5); g.fill(); g.globalAlpha = 1;
  }
}
try { setTheme(localStorage.getItem('theme')); } catch (_) { setTheme('aqua'); }
draw(); render();
