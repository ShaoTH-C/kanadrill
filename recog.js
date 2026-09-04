// handwriting check for one kana: ink binned into a small grid of orientation channels and
// blurred, then matched against the KanjiVG stroke templates in strokes.js
(function () {

const T = typeof STROKES !== 'undefined' ? STROKES : require('./strokes.js');

const CFG = {
  GRID: 10,         // cells per side of the feature map
  DIRS: 4,          // unsigned orientation channels
  SIGMA: 0.85,      // splat width in cells, this is what absorbs deformation
  STEP: 0.22,       // sub-segment length, in cells
  FILL: 0.86,       // how much of the map the long side spans
  STRETCH: 2.2,     // cap on the aspect-ratio-adaptive stretch
  POW: 0.5,         // variance stabilising transform on the cell energies
  ROT: 0.14,        // the query is also matched rotated by +-this (rad)
  SHEAR: 0.16,      // ... sheared by +-this
  ASPECT: 1.12,     // ... and stretched by this factor either way
  FGRID: 16,        // finer map, used only to tell a dakuten from a handakuten
  FSIGMA: 1.1,
  ABS: 0.46,        // distance past which nothing is the expected kana
  SHOW: 0.46,       // past this distance the nearest rival is noise, so do not name it
  TURN: 30,         // turning budget: past this the ink is a scribble, not a glyph
  TURND: 0.24,      // ... but only refuse on that when the shape is a poor match too
  TURNEPS: 0.03,    // simplification tolerance, as a fraction of the glyph size
  SMOOTH: 3.0,      // ink is smoothed over this many tremor widths before it is binned, otherwise
                    // a shaky hand fills the orientation channels with noise. clean ink is untouched
  SMOOTHMAX: 0.07,  // ... but never over more than this much of the glyph size
  RATIO: 1.30,      // how much worse than the best candidate the target may be
  SLACK: 0.02,      // additive slack on the ratio gate
  TWIN: 0.10,       // pair-discriminant margin for voiced/unvoiced twins
  RIVAL: 0.25,      // pair-discriminant margin for everything else
};

const PI = Math.PI;

// small affine pre-warps; matching keeps the best one, which absorbs tilt, slant and squash
const FRAMES = (() => {
  const out = [];
  for (const r of [-CFG.ROT, 0, CFG.ROT]) for (const k of [-CFG.SHEAR, 0, CFG.SHEAR]) for (const a of [1 / CFG.ASPECT, 1, CFG.ASPECT]) {
    const c = Math.cos(r), s = Math.sin(r);
    out.push(r || k || a !== 1 ? [c * a, (c * k - s) / a, s * a, (s * k + c) / a] : null);
  }
  return out;
})();

// how far a sample sits off the line through its neighbours. a mouse gives a unit or two
function tremor(s) {
  const d = [];
  for (let i = 1; i < s.length - 1; i++) {
    const [ax, ay] = s[i - 1], [bx, by] = s[i + 1], [px, py] = s[i];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    d.push(L < 1e-9 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * (px - ax) - dx * (py - ay)) / L);
  }
  if (!d.length) return 0;
  d.sort((a, b) => a - b);
  return d[d.length >> 1];
}
// gaussian smoothing along the stroke, by as much as the tremor asks for and no more
function smooth(strokes, cap) {
  return strokes.map(s => {
    const r = Math.min(cap, CFG.SMOOTH * tremor(s));
    if (!(r > 0)) return s;
    const inv = -1 / (2 * r * r);
    if (s.length < 4) return s;
    const arc = [0];
    for (let i = 1; i < s.length; i++) arc.push(arc[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
    if (arc[arc.length - 1] < r) return s;
    return s.map((p, i) => {
      let x = 0, y = 0, w = 0;
      for (let j = i; j >= 0 && arc[i] - arc[j] <= 2 * r; j--) {
        const g = Math.exp(inv * (arc[i] - arc[j]) ** 2);
        x += g * s[j][0]; y += g * s[j][1]; w += g;
      }
      for (let j = i + 1; j < s.length && arc[j] - arc[i] <= 2 * r; j++) {
        const g = Math.exp(inv * (arc[j] - arc[i]) ** 2);
        x += g * s[j][0]; y += g * s[j][1]; w += g;
      }
      return [x / w, y / w];
    });
  });
}
function inkSize(strokes) {
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (const s of strokes) for (const p of s) {
    if (p[0] < mnx) mnx = p[0];
    if (p[0] > mxx) mxx = p[0];
    if (p[1] < mny) mny = p[1];
    if (p[1] > mxy) mxy = p[1];
  }
  return Math.max(mxx - mnx, mxy - mny);
}

function featurizer(G, SIG) {
  const D = CFG.DIRS, DIM = G * G * D;
  const RAD = Math.ceil(2.6 * SIG), INV = -1 / (2 * SIG * SIG);
  const wx = new Float64Array(2 * RAD + 1), wy = new Float64Array(2 * RAD + 1);

  // gaussian splat: rasterise and blur in one step
  function splat(f, x, y, b0, b1, w0, w1) {
    const lo = Math.floor(x) - RAD, hi = lo + 2 * RAD, jlo = Math.floor(y) - RAD, jhi = jlo + 2 * RAD;
    if (hi < 0 || lo >= G || jhi < 0 || jlo >= G) return;
    for (let i = lo; i <= hi; i++) { const t = i + 0.5 - x; wx[i - lo] = Math.exp(INV * t * t); }
    for (let j = jlo; j <= jhi; j++) { const t = j + 0.5 - y; wy[j - jlo] = Math.exp(INV * t * t); }
    const i0 = Math.max(0, lo), i1 = Math.min(G - 1, hi);
    for (let j = Math.max(0, jlo), je = Math.min(G - 1, jhi); j <= je; j++) {
      const cy = wy[j - jlo], row = j * G;
      for (let i = i0; i <= i1; i++) {
        const c = cy * wx[i - lo], base = (row + i) * D;
        f[base + b0] += c * w0;
        if (w1) f[base + b1] += c * w1;
      }
    }
  }

  // the long side fills the map, the short side keeps a damped ratio, so a flat kana stays flat
  function of(strokes, m) {
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, n = 0;
    const pts = [];
    for (const s of strokes) {
      if (!s || !s.length) continue;
      const q = [];
      for (const p of s) {
        const x = m ? m[0] * p[0] + m[1] * p[1] : p[0];
        const y = m ? m[2] * p[0] + m[3] * p[1] : p[1];
        if (x < mnx) mnx = x;
        if (x > mxx) mxx = x;
        if (y < mny) mny = y;
        if (y > mxy) mxy = y;
        q.push(x, y); n++;
      }
      pts.push(q);
    }
    if (n < 2) return null;
    const W = mxx - mnx, H = mxy - mny;
    const L = Math.max(W, H) || 1, R = Math.min(W, H) / L;
    const k = R > 1e-4 ? Math.min(CFG.STRETCH, Math.sqrt(Math.sin(PI / 2 * R)) / R) : CFG.STRETCH;
    const u = CFG.FILL * G / L;
    const sx = W >= H ? u : u * k, sy = W >= H ? u * k : u;
    const ox = G / 2 - (mnx + mxx) / 2 * sx, oy = G / 2 - (mny + mxy) / 2 * sy;

    const f = new Float64Array(DIM);
    for (const q of pts) {
      if (q.length === 2) { for (let d = 0; d < D; d++) splat(f, q[0] * sx + ox, q[1] * sy + oy, d, 0, 0.12, 0); continue; }
      for (let i = 2; i < q.length; i += 2) {
        const ax = q[i - 2] * sx + ox, ay = q[i - 1] * sy + oy;
        const dx = q[i] * sx + ox - ax, dy = q[i + 1] * sy + oy - ay;
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) continue;
        let a = Math.atan2(dy, dx);
        if (a < 0) a += PI;
        if (a >= PI) a -= PI;
        const bin = a / PI * D;
        let b0 = Math.floor(bin);
        const fr = bin - b0;
        b0 %= D;
        const b1 = (b0 + 1) % D;
        const cnt = Math.max(1, Math.ceil(len / CFG.STEP)), w = len / cnt;
        for (let t = 0; t < cnt; t++) {
          const v = (t + 0.5) / cnt;
          splat(f, ax + dx * v, ay + dy * v, b0, b1, w * (1 - fr), w * fr);
        }
      }
    }
    // mean removal before the norm: without it a solid scribble correlates with every dense kana
    let tot = 0;
    for (let i = 0; i < DIM; i++) { f[i] = Math.pow(f[i], CFG.POW); tot += f[i]; }
    if (!(tot > 0)) return null;
    const mu = tot / DIM;
    let e = 0;
    for (let i = 0; i < DIM; i++) { f[i] -= mu; e += f[i] * f[i]; }
    e = Math.sqrt(e) || 1;
    for (let i = 0; i < DIM; i++) f[i] /= e;
    return f;
  }

  const cache = {};
  return {
    of,
    all: strokes => { const o = []; for (const m of FRAMES) { const f = of(strokes, m); if (f) o.push(f); } return o.length ? o : null; },
    tmpl: c => cache[c] || (cache[c] = of(smooth(T[c], CFG.SMOOTHMAX * inkSize(T[c])), null)),
  };
}

const F = featurizer(CFG.GRID, CFG.SIGMA);
const FF = featurizer(CFG.FGRID, CFG.FSIGMA);

// douglas-peucker
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let far = -1, fd = eps;
    for (let i = a + 1; i < b; i++) {
      const d = L < 1e-9 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
        : Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L;
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// total turning, simplified first so sample rate and tremor do not inflate it
function turning(strokes) {
  const eps = CFG.TURNEPS * inkSize(strokes);
  if (!(eps > 0)) return 0;
  let tot = 0;
  for (const s of strokes) {
    if (!s || s.length < 3) continue;
    const p = simplify(s, eps);
    for (let i = 2; i < p.length; i++) {
      let d = Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]) -
        Math.atan2(p[i - 1][1] - p[i - 2][1], p[i - 1][0] - p[i - 2][0]);
      while (d > PI) d -= 2 * PI;
      while (d < -PI) d += 2 * PI;
      tot += Math.abs(d);
    }
  }
  return tot;
}

const POOL = Object.keys(T);

// voiced / unvoiced pairs that must not be confused
const VOICE = {};
[['かきくけこさしすせそたちつてとはひふへほ', 'がぎぐげござじずぜぞだぢづでどばびぶべぼ'],
 ['はひふへほ', 'ぱぴぷぺぽ'], ['ばびぶべぼ', 'ぱぴぷぺぽ'],
 ['カキクケコサシスセソタチツテトハヒフヘホ', 'ガギグゲゴザジズゼゾダヂヅデドバビブベボ'],
 ['ハヒフヘホ', 'パピプペポ'], ['バビブベボ', 'パピプペポ'], ['ウ', 'ヴ']]
  .forEach(([a, b]) => [...a].forEach((c, i) => {
    (VOICE[c] = VOICE[c] || []).push(b[i]); (VOICE[b[i]] = VOICE[b[i]] || []).push(c);
  }));

// small kana are the same shape as the big one
const BIG = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ',
  'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ッ': 'ツ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ' };
const same = (a, b) => a === b || BIG[a] === b || BIG[b] === a || (BIG[a] && BIG[a] === BIG[b]);

function dist(a, b) {
  const n = a.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s >= 1 ? 0 : 1 - s;
}
// closest pre-warp of the query for one template
function match(qs, t) {
  let best = Infinity, bf = qs[0];
  for (let i = 0; i < qs.length; i++) { const d = dist(qs[i], t); if (d < best) { best = d; bf = qs[i]; } }
  return { d: best, f: bf };
}
// weighted by where the two templates disagree, so a small local difference still shows.
// > 0 means the ink leans towards B
function lean(qa, A, qb, B) {
  const n = A.length;
  let da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.abs(A[i] - B[i]);
    if (w < 1e-6) continue;
    const x = qa[i] - A[i], y = qb[i] - B[i];
    da += w * x * x; db += w * y * y;
  }
  return (da - db) / (da + db + 1e-12);
}
// the same test on the fine map, which resolves two dakuten ticks from one handakuten ring
function voiceLean(fs, a, b) {
  const A = FF.tmpl(a), B = FF.tmpl(b);
  return lean(match(fs, A).f, A, match(fs, B).f, B);
}

// a lookalike is only worth showing when the rival is a plausible reading of the ink
function refuse(reason, d, other) {
  const r = { ok: false, reason };
  if (d != null) r.d = d;
  if (other && other.d <= CFG.SHOW) r.looksLike = other.c;
  return r;
}

function verify(raw, expected) {
  if (!Array.isArray(raw)) return { ok: false, reason: 'empty' };
  const ink = raw.filter(s => s && s.length);
  const strokes = smooth(ink, CFG.SMOOTHMAX * inkSize(ink));
  const qs = F.all(strokes);
  if (!qs) return { ok: false, reason: 'empty' };
  const scores = POOL.map(c => { const m = match(qs, F.tmpl(c)); return { c, d: m.d, f: m.f }; }).sort((a, b) => a.d - b.d);
  const mine = scores.filter(s => same(s.c, expected))[0];
  const other = scores.filter(s => !same(s.c, expected))[0];
  if (!mine) return refuse('shape', null, other);
  const dExp = mine.d, exp = F.tmpl(mine.c);

  if (dExp > CFG.ABS || (dExp > CFG.TURND && turning(strokes) > CFG.TURN))
    return refuse('shape', dExp, other);

  const twins = (VOICE[expected] || []).filter(c => T[c]);
  if (twins.length) {
    const fs = FF.all(strokes);
    for (const t of twins) {
      if (voiceLean(fs, mine.c, t) > CFG.TWIN) return { ok: false, reason: 'voice', d: dExp, looksLike: t };
    }
  }
  for (const s of scores) {
    if (s.d >= dExp) break;
    if (same(s.c, expected)) continue;
    if (lean(mine.f, exp, s.f, F.tmpl(s.c)) > CFG.RIVAL) return { ok: false, reason: 'shape', d: dExp, looksLike: s.c };
  }
  if (dExp > scores[0].d * CFG.RATIO + CFG.SLACK) return refuse('shape', dExp, other);
  return { ok: true, d: dExp };
}

const api = { verify, VOICE };
if (typeof module !== 'undefined') module.exports = api;
else window.KanaRecog = api;

})();
