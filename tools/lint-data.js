const { tokenize, toRomaji, checkAnswer, difficulty } = require('../check.js');
const DATA = require('../data.js');

const HIRA = /^[ぁ-ゖ]+$/;
const KATA = /^[ァ-ヺー]+$/;
const errs = [];
const seen = new Set();

for (const w of DATA.words) {
  const at = `${w.k}`;
  if (seen.has(w.k)) errs.push(`${at}: duplicate`);
  seen.add(w.k);
  if (w.s !== 'h' && w.s !== 'k') errs.push(`${at}: bad script ${w.s}`);
  if (w.s === 'h' && !HIRA.test(w.k)) errs.push(`${at}: not pure hiragana`);
  if (w.s === 'k' && !KATA.test(w.k)) errs.push(`${at}: not pure katakana`);
  const S = tokenize(w.k);
  if (S.some(s => s.unk)) errs.push(`${at}: unknown kana`);
  if (S.length > 7) errs.push(`${at}: too long`);
  if (S.length < 2) errs.push(`${at}: too short`);
  if (toRomaji(w.k) !== w.r) errs.push(`${at}: romaji ${w.r} != ${toRomaji(w.k)}`);
  if (!checkAnswer(w.k, w.r)) errs.push(`${at}: checker rejects own romaji`);
  if (difficulty(w.k) !== w.b) errs.push(`${at}: difficulty ${w.b} != ${difficulty(w.k)}`);
  if (!w.m || w.m.length > 8) errs.push(`${at}: bad meaning "${w.m}"`);
}

const n = DATA.words.length;
const byS = { h: 0, k: 0 }, byB = [0, 0, 0];
DATA.words.forEach(w => { byS[w.s]++; byB[w.b]++; });
console.log(`${n} words  h ${byS.h} / k ${byS.k}  difficulty ${byB.join('/')}`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
