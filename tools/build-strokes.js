// pulls kana stroke paths from KanjiVG and writes strokes.js (sampled points, 109x109 box)
const fs = require('fs');
const path = require('path');
const https = require('https');
const { KANA } = require('../check.js');

const chars = new Set(['ー', 'っ', 'ッ']);
KANA.forEach(e => { [...e.h, ...e.k].forEach(c => chars.add(c)); });

const get = url => new Promise((res, rej) => {
  https.get(url, r => {
    if (r.statusCode !== 200) { r.resume(); return rej(new Error(r.statusCode + ' ' + url)); }
    let s = ''; r.setEncoding('utf8'); r.on('data', d => s += d); r.on('end', () => res(s));
  }).on('error', rej);
});

function parsePath(d) {
  const tok = d.match(/[MmLlHhVvCcSsQqTtZz]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const pts = []; let i = 0, cmd = '', x = 0, y = 0, cx = 0, cy = 0, sx = 0, sy = 0;
  const num = () => parseFloat(tok[i++]);
  const bez = (x1, y1, x2, y2, x3, y3) => {
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const u = 1 - t;
      pts.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
    }
    cx = x2; cy = y2; x = x3; y = y3;
  };
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': x = ox + num(); y = oy + num(); sx = x; sy = y; pts.push([x, y]); cmd = rel ? 'l' : 'L'; break;
      case 'L': x = ox + num(); y = oy + num(); pts.push([x, y]); break;
      case 'H': x = ox + num(); pts.push([x, y]); break;
      case 'V': y = oy + num(); pts.push([x, y]); break;
      case 'C': { const a = ox + num(), b = oy + num(), c = ox + num(), d2 = oy + num(), e = ox + num(), f = oy + num(); bez(a, b, c, d2, e, f); break; }
      case 'S': { const c = ox + num(), d2 = oy + num(), e = ox + num(), f = oy + num(); bez(2 * x - cx, 2 * y - cy, c, d2, e, f); break; }
      case 'Q': { const a = ox + num(), b = oy + num(), e = ox + num(), f = oy + num();
        bez(x + 2 / 3 * (a - x), y + 2 / 3 * (b - y), e + 2 / 3 * (a - e), f + 2 / 3 * (b - f), e, f); break; }
      case 'T': { const e = ox + num(), f = oy + num(); const a = 2 * x - cx, b = 2 * y - cy;
        bez(x + 2 / 3 * (a - x), y + 2 / 3 * (b - y), e + 2 / 3 * (a - e), f + 2 / 3 * (b - f), e, f); break; }
      case 'Z': x = sx; y = sy; pts.push([x, y]); break;
      default: i++;
    }
  }
  return pts;
}

// even spacing along the stroke, n points
function resample(pts, n) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const I = L / (n - 1), out = [pts[0]]; let D = 0;
  const src = pts.slice();
  for (let i = 1; i < src.length; i++) {
    const [ax, ay] = src[i - 1], [bx, by] = src[i];
    const d = Math.hypot(bx - ax, by - ay);
    if (D + d >= I && d > 0) {
      const t = (I - D) / d, q = [ax + t * (bx - ax), ay + t * (by - ay)];
      out.push(q); src.splice(i, 0, q); D = 0;
    } else D += d;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out.slice(0, n);
}

(async () => {
  const out = {};
  for (const c of [...chars].sort()) {
    const cp = c.codePointAt(0).toString(16).padStart(5, '0');
    let svg;
    try { svg = await get(`https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${cp}.svg`); }
    catch (e) { console.error('missing', c, e.message); continue; }
    const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map(m => m[1]);
    out[c] = paths.map(d => resample(parsePath(d), 16).map(([x, y]) => [Math.round(x), Math.round(y)]));
    process.stdout.write(c);
  }
  console.log('\n' + Object.keys(out).length + ' chars');
  const body = Object.entries(out).map(([c, s]) => `  ${JSON.stringify(c)}: ${JSON.stringify(s)}`).join(',\n');
  const js = `// kana stroke templates, 16 points per stroke in KanjiVG's 109x109 box.
// derived from KanjiVG (https://kanjivg.tagaini.net, CC BY-SA 3.0) by tools/build-strokes.js
var STROKES = {
${body}
};
if (typeof module !== 'undefined') module.exports = STROKES;
`;
  fs.writeFileSync(path.join(__dirname, '..', 'strokes.js'), js);
})();
