const test = require('node:test');
const assert = require('node:assert/strict');
const STROKES = require('../strokes.js');
const { verify, VOICE } = require('../recog.js');

// synthetic sloppy writing: affine wobble, elastic warp, jitter, plus the structural things
// people actually do - joining two strokes, splitting one, writing them out of order
// lehmer, warmed up: with a small seed the first few draws are all ~0, which would put every
// sample at the same corner of the distortion space instead of somewhere random in it
const rnd = seed => {
  let s = seed % 2147483647 || 1;
  for (let i = 0; i < 12; i++) s = (s * 16807) % 2147483647;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
};
const PROFILE = {
  clean: [0, 0, 0, 0, 0, 0, 0],
  light: [0.8, 0.06, 0.08, 0.10, 0.04, 1.5, 0.8],
  medium: [1.8, 0.12, 0.18, 0.20, 0.09, 3.0, 1.8],
  heavy: [3.2, 0.20, 0.30, 0.28, 0.16, 5.0, 3.0],
};
const len = s => { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return L; };
// the pad records a point per pointer move, not 16 per stroke
function pen(s, step) {
  const n = Math.max(3, Math.round(len(s) / step) + 1), I = len(s) / (n - 1) || 1;
  const out = [s[0]], src = s.slice();
  let D = 0;
  for (let i = 1; i < src.length && out.length < n; i++) {
    const [ax, ay] = src[i - 1], [bx, by] = src[i], d = Math.hypot(bx - ax, by - ay);
    if (D + d >= I && d > 0) { const t = (I - D) / d, q = [ax + t * (bx - ax), ay + t * (by - ay)]; out.push(q); src.splice(i, 0, q); D = 0; }
    else D += d;
  }
  while (out.length < n) out.push(s[s.length - 1]);
  return out;
}
function hand(strokes, profile, seed, quirk) {
  const r = rnd(seed), g = () => (r() + r() + r() + r() - 2) * 1.05;
  const [jit, rot, asp, sc, shear, warp, off] = PROFILE[profile];
  const a = (r() - 0.5) * 2 * rot, cos = Math.cos(a), sin = Math.sin(a);
  const S = 1 + (r() - 0.5) * 2 * sc, A = 1 + (r() - 0.5) * 2 * asp, sh = (r() - 0.5) * 2 * shear;
  const dx = (r() - 0.5) * 20 * (sc > 0 ? 1 : 0), dy = (r() - 0.5) * 20 * (sc > 0 ? 1 : 0);
  const f1 = 0.02 + r() * 0.05, f2 = 0.02 + r() * 0.05, p1 = r() * 6.28, p2 = r() * 6.28;
  let out = strokes.map(s => {
    const ox = g() * off, oy = g() * off;
    return pen(s, 2.4).map(([x, y]) => {
      let px = (x - 54.5) * S * A, py = (y - 54.5) * S / A;
      px += py * sh;
      let X = px * cos - py * sin + 54.5 + dx + ox, Y = px * sin + py * cos + 54.5 + dy + oy;
      X += warp * Math.sin(f1 * Y + p1); Y += warp * Math.sin(f2 * X + p2);
      return [X + g() * jit, Y + g() * jit];
    });
  });
  if (quirk === 'merge' && out.length > 1) { const i = Math.floor(r() * (out.length - 1)); out.splice(i, 2, out[i].concat(out[i + 1])); }
  if (quirk === 'split') { const i = out.findIndex(s => s.length >= 6); if (i >= 0) { const m = Math.floor(out[i].length / 2); out.splice(i, 1, out[i].slice(0, m + 1), out[i].slice(m)); } }
  if (quirk === 'shuffle') for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

const chars = Object.keys(STROKES);
const hira = c => c >= 'ぁ' && c <= 'ゖ';
// a small kana is written with the big shape, so the two are not different kana
const BIG = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ',
  'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ッ': 'ツ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ' };
const same = (a, b) => a === b || BIG[a] === b || BIG[b] === a;
const RUNS = [['clean', null], ['light', null], ['medium', null], ['heavy', null],
  ['medium', 'merge'], ['medium', 'split'], ['medium', 'shuffle']];

test('the clean template of every kana is accepted', () => {
  assert.deepEqual(chars.filter(c => !verify(STROKES[c], c).ok), []);
});

test('sloppy writing of the right kana is accepted', () => {
  let ok = 0, n = 0; const miss = {};
  chars.forEach((c, i) => RUNS.forEach(([p, q], j) => {
    n++;
    if (verify(hand(STROKES[c], p, i * 31 + j * 7 + 1, q), c).ok) ok++;
    else miss[c] = (miss[c] || 0) + 1;
  }));
  console.log(`  accepted ${(ok / n * 100).toFixed(1)}% (${ok}/${n}); refused most: ` +
    Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, k]) => c + '×' + k).join(' '));
  assert.ok(ok / n > 0.96, 'accepted ' + ok / n);
});

test('another kana is refused', () => {
  let ref = 0, n = 0; const leak = [];
  chars.forEach((c, i) => {
    const pool = chars.filter(o => hira(o) === hira(c) && !same(o, c));
    for (let j = 0; j < 2; j++) {
      const w = pool[(i * 7 + j * 53) % pool.length];
      n++;
      if (!verify(hand(STROKES[w], 'medium', i * 13 + j + 5), c).ok) ref++; else leak.push(w + '→' + c);
    }
  });
  console.log(`  refused ${(ref / n * 100).toFixed(1)}% (${ref}/${n}); let through: ${leak.slice(0, 10).join(' ')}`);
  assert.ok(ref / n > 0.98, 'refused ' + ref / n);
});

// the pool used to be split by script, so writing カ passed as あ
test('the other script is refused', () => {
  let ref = 0, n = 0; const leak = [];
  chars.forEach((c, i) => {
    const pool = chars.filter(o => hira(o) !== hira(c));
    for (let j = 0; j < 2; j++) {
      const w = pool[(i * 11 + j * 37) % pool.length];
      n++;
      if (!verify(hand(STROKES[w], 'light', i * 19 + j + 9), c).ok) ref++; else leak.push(w + '→' + c);
    }
  });
  console.log(`  refused ${(ref / n * 100).toFixed(1)}% (${ref}/${n}); let through: ${leak.slice(0, 10).join(' ')}`);
  assert.ok(ref / n > 0.99, 'refused ' + ref / n);
});

test('the unvoiced twin is refused when the voiced kana was asked for', () => {
  let ref = 0, n = 0; const leak = [];
  Object.entries(VOICE).forEach(([c, twins], i) => twins.forEach((t, j) => {
    if (!STROKES[t]) return;
    n++;
    const v = verify(hand(STROKES[t], 'light', i * 17 + j + 3), c);
    if (!v.ok) ref++; else leak.push(t + '→' + c);
  }));
  console.log(`  refused ${(ref / n * 100).toFixed(1)}% (${ref}/${n}); let through: ${leak.join(' ')}`);
  assert.ok(ref / n > 0.98, 'refused ' + ref / n);
});

test('scribbles and empty input are refused', () => {
  const r = rnd(99);
  const walk = (n, step) => { const p = [[50, 50]]; for (let i = 1; i < n; i++) p.push([p[i - 1][0] + (r() - 0.5) * step, p[i - 1][1] + (r() - 0.5) * step]); return p; };
  for (const c of ['あ', 'ぬ', 'め', 'ツ', 'ぱ', 'ソ']) {
    assert.equal(verify([], c).ok, false);
    assert.equal(verify([[[10, 10]]], c).ok, false);
    assert.equal(verify([walk(80, 22)], c).ok, false, 'scribble passed as ' + c);
    assert.equal(verify([walk(50, 30), walk(40, 26)], c).ok, false, 'scribble passed as ' + c);
    assert.equal(verify([[[20, 30], [80, 40], [20, 60], [80, 70]]], c).ok, false, 'zigzag passed as ' + c);
  }
  const line = [[[10, 50], [100, 50]]];
  assert.equal(verify(line, 'ー').ok, true);
  assert.equal(verify(line, 'あ').ok, false);
});

// a dense pointer trace must not read as a scribble
test('a slow hand with hundreds of points is still accepted', () => {
  const r = rnd(7);
  let ok = 0, n = 0;
  for (const c of chars) {
    const s = hand(STROKES[c], 'light', c.codePointAt(0), null)
      .map(st => pen(st, 0.5).map(([x, y]) => [x + (r() - 0.5) * 0.7, y + (r() - 0.5) * 0.7]));
    n++;
    if (verify(s, c).ok) ok++;
  }
  console.log(`  accepted ${(ok / n * 100).toFixed(1)}% (${ok}/${n})`);
  assert.ok(ok / n > 0.98, 'accepted ' + ok / n);
});

test('small kana accept the big shape', () => {
  for (const [small, big] of [['っ', 'つ'], ['ゃ', 'や'], ['ッ', 'ツ'], ['ォ', 'オ'], ['ぁ', 'あ']]) {
    assert.equal(verify(STROKES[big], small).ok, true, small);
  }
});

test('the feedback names a lookalike only when there is one', () => {
  const v = verify(STROKES['め'], 'ぬ');
  assert.equal(v.ok, false);
  assert.equal(v.looksLike, 'め');
  assert.equal(verify(STROKES['は'], 'ぱ').reason, 'voice');
  assert.equal(verify([[[20, 30], [80, 40], [20, 60], [80, 70]]], 'ぬ').reason, 'shape');
});
