// kana tables + romaji matching. shared by the page and the tests.
(function () {

const SEI = [
  ['あ', 'あ い う え お', 'ア イ ウ エ オ', 'a i u e o'],
  ['か', 'か き く け こ', 'カ キ ク ケ コ', 'ka ki ku ke ko'],
  ['さ', 'さ し す せ そ', 'サ シ ス セ ソ', 'sa shi su se so'],
  ['た', 'た ち つ て と', 'タ チ ツ テ ト', 'ta chi tsu te to'],
  ['な', 'な に ぬ ね の', 'ナ ニ ヌ ネ ノ', 'na ni nu ne no'],
  ['は', 'は ひ ふ へ ほ', 'ハ ヒ フ ヘ ホ', 'ha hi fu he ho'],
  ['ま', 'ま み む め も', 'マ ミ ム メ モ', 'ma mi mu me mo'],
  ['や', 'や _ ゆ _ よ', 'ヤ _ ユ _ ヨ', 'ya _ yu _ yo'],
  ['ら', 'ら り る れ ろ', 'ラ リ ル レ ロ', 'ra ri ru re ro'],
  ['わ', 'わ _ _ _ を', 'ワ _ _ _ ヲ', 'wa _ _ _ o'],
  ['ん', 'ん', 'ン', 'n'],
];
const DAK = [
  ['が', 'が ぎ ぐ げ ご', 'ガ ギ グ ゲ ゴ', 'ga gi gu ge go'],
  ['ざ', 'ざ じ ず ぜ ぞ', 'ザ ジ ズ ゼ ゾ', 'za ji zu ze zo'],
  ['だ', 'だ ぢ づ で ど', 'ダ ヂ ヅ デ ド', 'da ji zu de do'],
  ['ば', 'ば び ぶ べ ぼ', 'バ ビ ブ ベ ボ', 'ba bi bu be bo'],
];
const HAN = [
  ['ぱ', 'ぱ ぴ ぷ ぺ ぽ', 'パ ピ プ ペ ポ', 'pa pi pu pe po'],
];
const YO = [
  ['きゃ', 'きゃ きゅ きょ', 'キャ キュ キョ', 'kya kyu kyo'],
  ['しゃ', 'しゃ しゅ しょ', 'シャ シュ ショ', 'sha shu sho'],
  ['ちゃ', 'ちゃ ちゅ ちょ', 'チャ チュ チョ', 'cha chu cho'],
  ['にゃ', 'にゃ にゅ にょ', 'ニャ ニュ ニョ', 'nya nyu nyo'],
  ['ひゃ', 'ひゃ ひゅ ひょ', 'ヒャ ヒュ ヒョ', 'hya hyu hyo'],
  ['みゃ', 'みゃ みゅ みょ', 'ミャ ミュ ミョ', 'mya myu myo'],
  ['りゃ', 'りゃ りゅ りょ', 'リャ リュ リョ', 'rya ryu ryo'],
  ['ぎゃ', 'ぎゃ ぎゅ ぎょ', 'ギャ ギュ ギョ', 'gya gyu gyo'],
  ['じゃ', 'じゃ じゅ じょ', 'ジャ ジュ ジョ', 'ja ju jo'],
  ['ぢゃ', 'ぢゃ ぢゅ ぢょ', 'ヂャ ヂュ ヂョ', 'ja ju jo'],
  ['びゃ', 'びゃ びゅ びょ', 'ビャ ビュ ビョ', 'bya byu byo'],
  ['ぴゃ', 'ぴゃ ぴゅ ぴょ', 'ピャ ピュ ピョ', 'pya pyu pyo'],
];
// katakana only, for loanwords
const GAI = [
  ['イェ', '', 'イェ', 'ye'],
  ['ウィ', '', 'ウィ ウェ ウォ', 'wi we wo'],
  ['ヴァ', '', 'ヴァ ヴィ ヴ ヴェ ヴォ', 'va vi vu ve vo'],
  ['シェ', '', 'シェ ジェ チェ', 'she je che'],
  ['ティ', '', 'ティ ディ テュ デュ トゥ ドゥ', 'ti di tyu dyu tu du'],
  ['ツァ', '', 'ツァ ツィ ツェ ツォ', 'tsa tsi tse tso'],
  ['ファ', '', 'ファ フィ フェ フォ フュ', 'fa fi fe fo fyu'],
  ['クァ', '', 'クァ クィ クェ クォ グァ', 'kwa kwi kwe kwo gwa'],
];

// accepted alternative spellings (kunrei / nihon-shiki / IME habits), keyed by hiragana
const ALT = {
  'し': 'si', 'ち': 'ti', 'つ': 'tu', 'ふ': 'hu', 'を': 'wo', 'じ': 'zi', 'ぢ': 'di zi', 'づ': 'du',
  'しゃ': 'sya', 'しゅ': 'syu', 'しょ': 'syo', 'ちゃ': 'tya', 'ちゅ': 'tyu', 'ちょ': 'tyo',
  'じゃ': 'zya jya', 'じゅ': 'zyu jyu', 'じょ': 'zyo jyo', 'ぢゃ': 'dya zya', 'ぢゅ': 'dyu zyu', 'ぢょ': 'dyo zyo',
  'ヴ': 'bu', 'ティ': 'thi', 'ディ': 'dhi',
};
// shown next to the canonical romaji where two spellings are common
const SHOW = { 'を': 'o (wo)', 'ぢ': 'ji (di)', 'づ': 'zu (du)' };
const RARE = new Set(['ぢゃ', 'ぢゅ', 'ぢょ', 'イェ', 'クァ', 'クィ', 'クェ', 'クォ', 'グァ', 'ツィ', 'テュ', 'トゥ', 'ドゥ']);

const KANA = [];
const TABLES = { sei: [], dak: [], han: [], yo: [], gai: [] };
const LOOKUP = {};

function build(type, rows) {
  rows.forEach(([label, hs, ks, rs]) => {
    const H = hs ? hs.split(' ') : [], Kc = ks.split(' '), R = rs.split(' ');
    const cells = Kc.map((k, i) => {
      if (k === '_') return null;
      const h = H[i] || '';
      const key = h || k;
      const e = { h, k, r: R[i], alts: (ALT[key] || '').split(' ').filter(Boolean), show: SHOW[key] || R[i],
        row: label, type, rare: RARE.has(key) };
      KANA.push(e);
      if (h) LOOKUP[h] = e;
      LOOKUP[k] = e;
      return e;
    });
    TABLES[type].push({ label, cells });
  });
}
build('sei', SEI); build('dak', DAK); build('han', HAN); build('yo', YO); build('gai', GAI);

// particle-は read as wa inside a fixed phrase
const SPECIAL = { 'こんにちは': 'konnichiwa', 'こんばんは': 'konbanwa' };

const SMALL = 'ゃゅょャュョァィゥェォ';

function tokenize(word) {
  const out = []; let i = 0;
  while (i < word.length) {
    const ch = word[i];
    if (ch === 'っ' || ch === 'ッ') { out.push({ sok: true }); i++; continue; }
    if (ch === 'ー') { out.push({ cho: true }); i++; continue; }
    const nx = word[i + 1];
    const two = nx && SMALL.includes(nx) ? ch + nx : null;
    let e = null, len = 1;
    if (two && LOOKUP[two]) { e = LOOKUP[two]; len = 2; }
    else if (LOOKUP[ch]) e = LOOKUP[ch];
    else { out.push({ unk: ch }); i++; continue; }
    i += len;
    out.push(e.r === 'n' ? { n: true, t: ch } : { e, t: two && len === 2 ? two : ch });
  }
  return out;
}

function toRomaji(word) {
  if (SPECIAL[word]) return SPECIAL[word];
  const S = tokenize(word); let out = '';
  for (let i = 0; i < S.length; i++) {
    const s = S[i], nx = S[i + 1];
    if (s.unk) { out += '?'; continue; }
    if (s.sok) { const r = nx && nx.e ? nx.e.r : ''; out += r.startsWith('ch') ? 't' : (r[0] || ''); continue; }
    if (s.cho) { const v = out[out.length - 1] || ''; out += 'aiueo'.includes(v) ? v : ''; continue; }
    if (s.n) { out += 'n'; if (nx && nx.e && /^[aiueoy]/.test(nx.e.r)) out += "'"; continue; }
    out += s.e.r;
  }
  return out;
}

function normalizeAnswer(s) {
  const t = (s || '').toLowerCase().trim().replace(/[\s\-'’\.．。、]/g, '');
  const base = t.replace(/ā/g, 'aa').replace(/ī/g, 'ii').replace(/ū/g, 'uu').replace(/ē/g, 'ee');
  if (base.includes('ō')) return [base.replace(/ō/g, 'ou'), base.replace(/ō/g, 'oo')];
  return [base];
}

function matchOne(word, input, track) {
  const S = tokenize(word);
  const rec = (i, pos) => {
    if (track && i > track.best) track.best = i;
    if (i === S.length) return pos === input.length;
    const s = S[i];
    if (s.unk) return false;
    if (s.n) {
      if (input[pos] !== 'n' && input[pos] !== 'm') return false;
      if (input[pos] === 'm' && !'bmp'.includes(input[pos + 1] || '')) return false;
      if (rec(i + 1, pos + 1)) return true;
      // wapuro habit: nn
      return input[pos] === 'n' && input[pos + 1] === 'n' && rec(i + 1, pos + 2);
    }
    if (s.sok) {
      const nx = S[i + 1];
      if (!nx || !nx.e) return false;
      for (const a of [nx.e.r, ...nx.e.alts]) {
        const firsts = a.startsWith('ch') ? ['t', 'c'] : [a[0]];
        for (const f of firsts) if (input.startsWith(f + a, pos) && rec(i + 2, pos + 1 + a.length)) return true;
      }
      return false;
    }
    if (s.cho) {
      const prev = input[pos - 1];
      return !!prev && 'aiueo'.includes(prev) && input[pos] === prev && rec(i + 1, pos + 1);
    }
    for (const a of [s.e.r, ...s.e.alts]) if (input.startsWith(a, pos) && rec(i + 1, pos + a.length)) return true;
    return false;
  };
  return rec(0, 0);
}

function checkAnswer(word, raw) {
  return normalizeAnswer(raw).some(t => t.length > 0 && (t === SPECIAL[word] || matchOne(word, t)));
}

// index of the first kana slot the input fails at, -1 if it matches
function firstMismatch(word, raw) {
  if (checkAnswer(word, raw)) return -1;
  const S = tokenize(word);
  let best = 0;
  for (const t of normalizeAnswer(raw)) {
    const track = { best: 0 };
    matchOne(word, t, track);
    best = Math.max(best, track.best);
  }
  return Math.min(best, S.length - 1);
}

function difficulty(word) {
  const S = tokenize(word);
  const r = toRomaji(word);
  let score = S.length;
  if (S.some(s => s.e && (s.e.type === 'dak' || s.e.type === 'han'))) score += 1;
  if (S.some(s => s.e && (s.e.type === 'yo' || s.e.type === 'gai'))) score += 2;
  if (S.some(s => s.sok)) score += 2;
  if (S.some(s => s.cho) || /aa|ii|uu|ee|oo|ou|ei/.test(r)) score += 1;
  return score <= 3 ? 0 : score <= 5 ? 1 : 2;
}

const api = { KANA, TABLES, LOOKUP, tokenize, toRomaji, normalizeAnswer, checkAnswer, firstMismatch, difficulty };
if (typeof module !== 'undefined') module.exports = api;
else window.KanaCheck = api;

})();
