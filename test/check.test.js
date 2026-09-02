const test = require('node:test');
const assert = require('node:assert/strict');
const { KANA, TABLES, LOOKUP, tokenize, toRomaji, checkAnswer, firstMismatch, difficulty } = require('../check.js');

test('tokenize keeps the kana each slot came from', () => {
  assert.deepEqual(tokenize('きょうと').map(s => s.t), ['きょ', 'う', 'と']);
  assert.deepEqual(tokenize('しんぶん').map(s => s.t), ['し', 'ん', 'ぶ', 'ん']);
  assert.deepEqual(tokenize('サッカー').map(s => s.t), ['サ', undefined, 'カ', undefined]);
});

test('firstMismatch points at the kana the input got wrong', () => {
  assert.equal(firstMismatch('ねこ', 'neko'), -1);
  assert.equal(firstMismatch('ねこ', 'neka'), 1);
  assert.equal(firstMismatch('ねこ', 'meko'), 0);
  assert.equal(firstMismatch('きょうと', 'kyoto'), 1);
  assert.equal(firstMismatch('しんぶん', 'shinbu'), 3);
  assert.equal(firstMismatch('ねこ', 'nekoo'), 1);
  assert.equal(firstMismatch('ねこ', ''), 0);
});

test('toRomaji: plain, dakuten, yoon, long vowels', () => {
  assert.equal(toRomaji('あさ'), 'asa');
  assert.equal(toRomaji('たまご'), 'tamago');
  assert.equal(toRomaji('きょう'), 'kyou');
  assert.equal(toRomaji('おおさか'), 'oosaka');
  assert.equal(toRomaji('とうきょう'), 'toukyou');
  assert.equal(toRomaji('ぎゅうにゅう'), 'gyuunyuu');
  assert.equal(toRomaji('ちょうちょ'), 'choucho');
  assert.equal(toRomaji('せんせい'), 'sensei');
});

test('toRomaji: sokuon doubles the next consonant, tch before ch', () => {
  assert.equal(toRomaji('きって'), 'kitte');
  assert.equal(toRomaji('ざっし'), 'zasshi');
  assert.equal(toRomaji('まっちゃ'), 'matcha');
  assert.equal(toRomaji('サッカー'), 'sakkaa');
});

test('toRomaji: katakana long mark repeats the vowel', () => {
  assert.equal(toRomaji('コーヒー'), 'koohii');
  assert.equal(toRomaji('インターネット'), 'intaanetto');
  assert.equal(toRomaji('キュー'), 'kyuu');
});

test('toRomaji: n gets an apostrophe before a vowel or y', () => {
  assert.equal(toRomaji('ぜんいん'), "zen'in");
  assert.equal(toRomaji('きんようび'), "kin'youbi");
  assert.equal(toRomaji('しんぶん'), 'shinbun');
  assert.equal(toRomaji('ほん'), 'hon');
});

test('toRomaji: loanword kana', () => {
  assert.equal(toRomaji('ファミリー'), 'famirii');
  assert.equal(toRomaji('パーティー'), 'paatii');
  assert.equal(toRomaji('ヴァイオリン'), 'vaiorin');
  assert.equal(toRomaji('ディズニー'), 'dizunii');
  assert.equal(toRomaji('ウェブ'), 'webu');
});

test('toRomaji: fixed phrases with particle は', () => {
  assert.equal(toRomaji('こんにちは'), 'konnichiwa');
  assert.equal(toRomaji('こんばんは'), 'konbanwa');
  assert.ok(checkAnswer('こんにちは', 'konnichiwa'));
  assert.ok(checkAnswer('こんにちは', 'konnichiha'));
});

test('tokenize flags unknown characters', () => {
  assert.ok(tokenize('漢字').every(s => s.unk));
  assert.ok(tokenize('あゃ').some(s => s.unk));
  assert.ok(tokenize('きゃ').every(s => s.e));
  assert.equal(toRomaji('日'), '?');
});

test('checkAnswer accepts hepburn variants', () => {
  assert.ok(checkAnswer('ふじさん', 'fujisan'));
  assert.ok(checkAnswer('ふじさん', 'huzisan'));
  assert.ok(checkAnswer('しんぶん', 'shimbun'));
  assert.ok(checkAnswer('しんぶん', 'shinbun'));
  assert.ok(checkAnswer('がっこう', 'gakkō'));
  assert.ok(checkAnswer('がっこう', 'Gakkou'));
  assert.ok(checkAnswer('とうきょう', 'tōkyō'));
  assert.ok(checkAnswer('おおさか', 'ōsaka'));
  assert.ok(checkAnswer('まっちゃ', 'matcha'));
  assert.ok(checkAnswer('まっちゃ', 'maccha'));
  assert.ok(checkAnswer('ざっし', 'zasshi'));
  assert.ok(checkAnswer('ぜんいん', "zen'in"));
  assert.ok(checkAnswer('ぜんいん', 'zenin'));
  assert.ok(checkAnswer('ほん', 'honn'));
  assert.ok(checkAnswer('こんな', 'konna'));
  assert.ok(checkAnswer('はなぢ', 'hanadi'));
  assert.ok(checkAnswer('はなぢ', 'hanaji'));
  assert.ok(checkAnswer('つづく', 'tsuduku'));
  assert.ok(checkAnswer('を', 'wo'));
  assert.ok(checkAnswer('ディズニー', 'dizunii'));
  assert.ok(checkAnswer('ヴ', 'bu'));
});

test('checkAnswer accepts spaces and hyphens in the input', () => {
  assert.ok(checkAnswer('おはよう', 'o ha yo u'));
  assert.ok(checkAnswer('おはよう', 'o-ha-you'));
});

test('checkAnswer rejects wrong readings', () => {
  assert.ok(!checkAnswer('ねこ', 'neka'));
  assert.ok(!checkAnswer('きって', 'kite'));
  assert.ok(!checkAnswer('コーヒー', 'kohi'));
  assert.ok(!checkAnswer('コーヒー', 'kouhii'));
  assert.ok(!checkAnswer('しんぶん', 'shinbu'));
  assert.ok(checkAnswer('しんぶん', 'shinbunn'));
  assert.ok(!checkAnswer('ねこ', ''));
  assert.ok(!checkAnswer('ねこ', '   '));
  assert.ok(!checkAnswer('漢字', 'kanji'));
});

test('difficulty buckets', () => {
  assert.equal(difficulty('ねこ'), 0);
  assert.equal(difficulty('さかな'), 0);
  assert.equal(difficulty('たまご'), 1);
  assert.equal(difficulty('きょう'), 1);
  assert.equal(difficulty('がっこう'), 2);
  assert.equal(difficulty('ぎゅうにゅう'), 2);
});

test('kana table shape', () => {
  assert.equal(TABLES.sei.length, 11);
  assert.equal(TABLES.dak.length, 4);
  assert.equal(TABLES.han.length, 1);
  assert.equal(TABLES.yo.length, 12);
  assert.ok(TABLES.gai.length >= 8);
  assert.equal(TABLES.sei[0].cells.length, 5);
  assert.equal(TABLES.sei[7].cells[1], null);
  assert.ok(KANA.every(e => e.r && e.k));
  assert.ok(TABLES.gai.every(row => row.cells.every(c => c.h === '')));
  assert.equal(LOOKUP['ぢゃ'].r, 'ja');
  assert.equal(LOOKUP['を'].show, 'o (wo)');
  assert.equal(LOOKUP['ぢゃ'].rare, true);
  assert.equal(LOOKUP['を'].rare, false);
  assert.equal(new Set(KANA.map(e => e.k)).size, KANA.length);
});
