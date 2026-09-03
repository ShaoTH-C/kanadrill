const { KANA, TABLES, LOOKUP, tokenize, checkAnswer, firstMismatch } = KanaCheck;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const WORD = new Map(DATA.words.map(w => [w.k, w]));

/* ---------------- storage ---------------- */
const KEY = 'kanadrill:v1:';
const store = {
  get(k, d) { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) {} },
};
let bank = store.get('bank', { r: {}, d: {} });   // per mode: k -> {w: wrong count, s: correct streak}
let hist = store.get('hist', []);
let stat = store.get('stat', {});                 // k -> [seen, wrong]
let kstat = store.get('kana', {});                // kana -> [ok, wrong]
let day = store.get('day', null);

/* ---------------- settings ---------------- */
const DEF = { mode: 'r', content: 'wh', diff: 'all', kanaTypes: ['sei', 'dak', 'han', 'yo'], kanaScript: 'b', countSel: '20', custom: 50 };
const settings = Object.assign({}, DEF, store.get('settings', {}));
settings.kanaTypes = new Set(settings.kanaTypes);
const wantCount = () => settings.countSel === 'custom' ? settings.custom : +settings.countSel;
const saveSettings = () => store.set('settings', { ...settings, kanaTypes: [...settings.kanaTypes] });

const MODE = [['r', '认读 · 看假名写读音'], ['d', '听写 · 看读音写假名']];
const CONTENT = [['wh', '平假名单词'], ['wk', '片假名单词'], ['wm', '混合单词'], ['kana', '单个假名']];
const DIFF = [['0', '入门'], ['1', '进阶'], ['2', '挑战'], ['all', '全部']];
const KTYPES = [['sei', '清音'], ['dak', '浊音'], ['han', '半浊音'], ['yo', '拗音'], ['gai', '外来语音']];
const KSHORT = { sei: '清', dak: '浊', han: '半', yo: '拗', gai: '外' };
const KSCRIPT = [['h', '平假名'], ['k', '片假名'], ['b', '混合']];
const COUNTS = [['10', '10 题'], ['20', '20 题']];
const TYPE_LABEL = Object.fromEntries(KTYPES);
const SCRIPT_LABEL = { h: '平假名', k: '片假名', b: '混合' };
const label = (list, v) => (list.find(([x]) => x === v) || [])[1] || '';

function seg(el, opts, get, set) {
  el.innerHTML = '';
  opts.forEach(([v, text]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text;
    b.classList.toggle('sel', get() === v);
    b.onclick = () => { set(v); seg(el, opts, get, set); afterSetting(); };
    el.appendChild(b);
  });
}
function chips(el, opts, setRef) {
  el.innerHTML = '';
  opts.forEach(([v, text]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text;
    b.classList.toggle('sel', setRef.has(v));
    b.onclick = () => { setRef.has(v) ? setRef.delete(v) : setRef.add(v); chips(el, opts, setRef); afterSetting(); };
    el.appendChild(b);
  });
}

/* ---------------- pools ---------------- */
function kanaItem(e, s) {
  return { k: s === 'k' ? e.k : e.h, r: e.show, m: '', s, kind: 'kana', e };
}
function kanaItems(entries, script) {
  const out = [];
  entries.forEach(e => {
    if (e.rare) return;
    if (e.h && script !== 'k') out.push(kanaItem(e, 'h'));
    if (script !== 'h') out.push(kanaItem(e, 'k'));
  });
  return out;
}
function wordItem(w) { return { k: w.k, r: w.r, m: w.m, s: w.s, kind: 'word' }; }
function buildPool() {
  if (settings.content === 'kana') return kanaItems(KANA.filter(e => settings.kanaTypes.has(e.type)), settings.kanaScript);
  const scr = { wh: 'h', wk: 'k', wm: 'b' }[settings.content];
  return DATA.words.filter(w => (scr === 'b' || w.s === scr) && (settings.diff === 'all' || w.b === +settings.diff)).map(wordItem);
}
// unseen first, then words you got wrong before
function pick(pool, n) {
  const items = pool.slice();
  const w = items.map(it => { const s = stat[it.k]; return s ? 1 + 2 * Math.min(s[1], 3) : 4; });
  const out = [];
  while (out.length < n && items.length) {
    let total = 0; for (const x of w) total += x;
    let r = Math.random() * total, j = 0;
    for (; j < items.length - 1; j++) { r -= w[j]; if (r < 0) break; }
    out.push(items[j]); items.splice(j, 1); w.splice(j, 1);
  }
  return out;
}
function modeLabel() {
  let s;
  if (settings.content === 'kana') {
    const t = KTYPES.filter(([v]) => settings.kanaTypes.has(v)).map(([v]) => KSHORT[v]).join('+') || '—';
    s = `假名·${t}·${SCRIPT_LABEL[settings.kanaScript]}`;
  } else s = `${label(CONTENT, settings.content)}·${label(DIFF, settings.diff)}`;
  return (settings.mode === 'd' ? '听写·' : '') + s;
}
function afterSetting() {
  const kanaMode = settings.content === 'kana';
  $('fieldDiff').hidden = kanaMode;
  $('fieldKanaType').hidden = !kanaMode;
  $('fieldKanaScript').hidden = !kanaMode;
  const pool = buildPool();
  const unseen = pool.filter(it => !stat[it.k]).length;
  const n = wantCount();
  $('poolHint').textContent = pool.length
    ? `当前范围共 ${pool.length} 个 · 未做过 ${unseen}` + (n > pool.length ? `，不够 ${n} 题，会全部出完` : '')
    : '当前范围没有可出的题';
  $('btnStart').disabled = pool.length === 0;
  $('btnStart').textContent = settings.mode === 'd' ? '开始听写' : '开始测验';
  saveSettings();
  renderBank();
}

/* ---------------- tts ---------------- */
const tts = {
  voice: null, dog: null,
  init() {
    if (!('speechSynthesis' in window)) return;
    const find = () => {
      const v = speechSynthesis.getVoices().find(v => /^ja/i.test(v.lang));
      if (v && !this.voice) { this.voice = v; document.body.classList.add('tts'); $('ttsNote').hidden = true; }
      return !!v;
    };
    if (find()) return;
    speechSynthesis.addEventListener('voiceschanged', find);
    setTimeout(find, 1500);
  },
  speak(text) {
    if (!this.voice) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP'; u.voice = this.voice; u.rate = 0.9;
    speechSynthesis.speak(u);
    clearTimeout(this.dog);
    this.dog = setTimeout(() => speechSynthesis.cancel(), 4000);
  },
};
const SPK_SVG = '<svg viewBox="0 0 16 16"><path d="M2 6h3l4-3v10l-4-3H2z"/><path d="M11 5.5a3 3 0 0 1 0 5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
const spkBtn = k => `<button type="button" class="spk" data-say="${esc(k)}">${SPK_SVG}读音</button>`;
document.addEventListener('click', e => {
  const b = e.target.closest('[data-say]');
  if (b) tts.speak(b.dataset.say);
});

/* ---------------- screens ---------------- */
const show = id => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  $(id).classList.add('on');
  document.body.classList.toggle('wide', id === 'ref');
  window.scrollTo(0, 0);
};
function route() {
  if (location.hash === '#ref') { renderRef(); show('ref'); }
  else if ($('ref').classList.contains('on')) show('home');
}
window.addEventListener('hashchange', route);

/* ---------------- quiz ---------------- */
let quiz = null, timerId = null, autoId = null, lockUntil = 0;
const AMBIG = { 'お': 'o（あ行）', 'を': 'wo（わ行）', 'じ': 'ji（ざ行）', 'ぢ': 'di（だ行）', 'ず': 'zu（ざ行）', 'づ': 'du（だ行）' };
const TWIN = { 'お': 'を', 'を': 'お', 'じ': 'ぢ', 'ぢ': 'じ', 'ず': 'づ', 'づ': 'ず' };

function startQuiz(items, lab, opts = {}) {
  clearInterval(timerId); clearTimeout(autoId);
  quiz = { mode: settings.mode, items, label: lab, i: 0, ok: 0, no: 0, phase: 'ask', records: [], t0: Date.now(),
    from: opts.from || 'home', again: opts.again || null };
  timerId = setInterval(() => { $('qTime').textContent = fmt(Math.floor((Date.now() - quiz.t0) / 1000)); }, 500);
  $('qTime').textContent = '00:00';
  if (location.hash) history_replace();
  show('quiz');
  renderQ();
}
function history_replace() { history.replaceState(null, '', location.pathname + location.search); }
function startFromSettings() {
  const pool = buildPool();
  if (!pool.length) return;
  startQuiz(pick(pool, wantCount()), modeLabel(), { again: startFromSettings });
}
function fitWord() {
  const el = $('qWord'), card = $('qCard');
  const len = Math.max(1, [...quiz.items[quiz.i].k].length);
  el.style.fontSize = Math.max(28, Math.min(72, Math.floor((card.clientWidth - 56) / len))) + 'px';
  el.style.wordBreak = len > 8 ? 'normal' : 'keep-all';
}
function scriptTag(q) {
  const s = q.s === 'k' ? '片假名' : '平假名';
  return q.kind === 'kana' ? `${s} · ${TYPE_LABEL[q.e.type]}` : s;
}
function promptOf(q) {
  if (q.kind === 'kana') { const h = q.e.h || q.e.k; return AMBIG[h] || q.e.r; }
  return q.r;
}
function twinNote(q) {
  if (q.kind !== 'kana') return '';
  const h = q.e.h || q.e.k, t = TWIN[h];
  if (!t) return '';
  const te = LOOKUP[t];
  const show = x => q.s === 'k' ? x.k : x.h;
  return `<div class="yours">同音：${show(q.e)}（${q.e.row}行）· ${show(te)}（${te.row}行）</div>`;
}
function setRows(on) {
  ['rowType', 'rowReveal', 'rowJudge', 'rowNext'].forEach(id => { $(id).hidden = !on.includes(id); });
}
function undoLink() {
  const u = $('btnUndo');
  const prev = quiz.records[quiz.i - 1];
  if (quiz.mode === 'd' && quiz.phase === 'ask' && prev && prev.self) {
    u.hidden = false; u.textContent = prev.ok ? '上一题其实写错了？改回' : '上一题其实写对了？改回';
    u.onclick = () => flip(quiz.i - 1);
  } else if (quiz.mode === 'd' && quiz.phase === 'fb' && !quiz.records[quiz.i].ok) {
    u.hidden = false; u.textContent = '点错了？改成写对了';
    u.onclick = () => flip(quiz.i);
  } else u.hidden = true;
}
function live() {
  $('liveOk').textContent = '✓ ' + quiz.ok;
  $('liveNo').textContent = '× ' + quiz.no;
}
function renderQ() {
  const q = quiz.items[quiz.i], d = quiz.mode === 'd';
  quiz.phase = 'ask';
  $('qTag').textContent = `第 ${quiz.i + 1} 题`;
  $('qNum').textContent = `${quiz.i + 1} / ${quiz.items.length}`;
  $('qBar').style.width = (quiz.i / quiz.items.length * 100) + '%';
  $('qFb').innerHTML = '';
  $('qCard').className = 'qcard';
  const st = $('qScript');
  if (d || q.kind === 'kana') { st.hidden = false; st.textContent = scriptTag(q); st.className = 'qtag right ' + (q.s === 'k' ? 'kata' : 'hira'); }
  else st.hidden = true;
  const w = $('qWord');
  w.style.fontSize = ''; w.style.wordBreak = '';
  if (d) {
    w.className = 'kword prompt';
    w.innerHTML = `<div class="rom">${esc(promptOf(q))}</div>` + (q.m ? `<div class="mean">（${esc(q.m)}）</div>` : '') +
      `<div class="hint">先在纸上写${q.s === 'k' ? '片假名' : '平假名'}</div>`;
    setRows(['rowReveal']);
    $('btnGiveup').hidden = true;
  } else {
    w.className = 'kword'; w.textContent = q.k; fitWord();
    setRows(['rowType']);
    const inp = $('qInput');
    inp.value = ''; inp.readOnly = false; inp.focus();
    const go = $('btnGo'); go.textContent = '提交'; go.className = 'go';
    $('btnGiveup').hidden = false;
  }
  undoLink();
  live();
}
function reveal() {
  if (!quiz || quiz.phase !== 'ask' || quiz.mode !== 'd') return;
  const q = quiz.items[quiz.i];
  quiz.phase = 'reveal';
  const w = $('qWord');
  w.className = 'kword'; w.textContent = q.k; fitWord();
  $('qFb').innerHTML = `<div><span class="romaji">${esc(q.r)}</span> <span class="mean">${meanTail(q)}</span>${spkBtn(q.k)}</div>` + twinNote(q);
  setRows(['rowJudge']);
  lockUntil = Date.now() + 250;
  undoLink();
}
function judge(ok) {
  if (!quiz || quiz.phase !== 'reveal' || Date.now() < lockUntil) return;
  settle(ok, '', true);
}
function meanTail(q) { return q.m ? `（${esc(q.m)}）` : ''; }
function rubyWord(q, miss) {
  return tokenize(q.k).map((s, i) => {
    const rt = s.e ? s.e.r : s.n ? 'n' : s.sok ? '' : s.cho ? '-' : '?';
    const t = s.t || (s.sok ? (q.s === 'k' ? 'ッ' : 'っ') : s.cho ? 'ー' : '');
    return `<ruby${i === miss ? ' class="miss"' : ''}>${esc(t)}<rt>${rt}</rt></ruby>`;
  }).join('');
}
function settle(ok, ans, self) {
  const q = quiz.items[quiz.i];
  quiz.phase = 'fb';
  quiz.records.push({ ...q, ok, ans, self: !!self });
  ok ? quiz.ok++ : quiz.no++;
  live();
  $('qBar').style.width = ((quiz.i + 1) / quiz.items.length * 100) + '%';
  $('btnGiveup').hidden = true;
  $('qCard').classList.add(ok ? 'good' : 'bad');
  const fb = $('qFb');
  if (ok) {
    fb.innerHTML = `<div class="big good">${self ? '✓ 写对了' : '✓ 正确'}</div>
      <div><span class="romaji">${esc(q.r)}</span> <span class="mean">${meanTail(q)}</span>${spkBtn(q.k)}</div>`;
    if (self) setRows([]); else $('qInput').readOnly = true;
    autoId = setTimeout(next, self ? 700 : 800);
  } else if (self) {
    fb.innerHTML = `<div class="big bad">× 写错了</div>
      <div><span class="romaji bad">${esc(q.r)}</span> <span class="mean">${meanTail(q)}</span>${spkBtn(q.k)}</div>
      <div class="yours">已记入错题本，在纸上订正一遍再走</div>`;
    setRows(['rowNext']);
  } else {
    const miss = ans ? firstMismatch(q.k, ans) : -1;
    if (ans) $('qWord').innerHTML = `<span>${rubyWord(q, miss)}</span>`;
    fb.innerHTML = `<div class="big bad">× 不对</div>
      <div>正确读音 <span class="romaji bad">${esc(q.r)}</span> <span class="mean">${meanTail(q)}</span>${spkBtn(q.k)}</div>
      ${ans ? `<div class="yours">你写的：${esc(ans)}</div>` : ''}`;
    $('qInput').readOnly = true;
    const go = $('btnGo'); go.textContent = '下一题'; go.className = 'go next';
    go.focus();
  }
  undoLink();
}
function flip(idx) {
  const r = quiz.records[idx];
  if (!r) return;
  r.ok = !r.ok;
  r.ok ? (quiz.ok++, quiz.no--) : (quiz.ok--, quiz.no++);
  live();
  if (idx === quiz.i && quiz.phase === 'fb') {
    $('qCard').className = 'qcard good';
    $('qFb').querySelector('.big').outerHTML = '<div class="big good">✓ 改为写对了</div>';
    setRows([]);
    $('btnUndo').hidden = true;
    autoId = setTimeout(next, 500);
  } else undoLink();
}
function submit() {
  if (!quiz || quiz.phase !== 'ask' || quiz.mode !== 'r') return;
  const raw = $('qInput').value;
  if (!raw.trim()) { $('qInput').focus(); return; }
  settle(checkAnswer(quiz.items[quiz.i].k, raw), raw.trim(), false);
}
function next() {
  if (!quiz || quiz.phase !== 'fb') return;
  clearTimeout(autoId);
  if (quiz.i + 1 < quiz.items.length) { quiz.i++; renderQ(); }
  else finish();
}
function exitQuiz() {
  clearInterval(timerId); clearTimeout(autoId);
  const from = quiz && quiz.from;
  quiz = null;
  if (from === 'ref') location.hash = '#ref'; else show('home');
}

/* ---------------- stats ---------------- */
const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
function bumpDay(n) {
  const t = dayKey(new Date());
  if (!day || day.d !== t) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    day = { d: t, n: 0, streak: day && day.d === dayKey(y) ? day.streak + 1 : 1 };
  }
  day.n += n;
  store.set('day', day);
}
// which kana in a record were wrong: the one the typed answer failed at, or all of them when self-graded / given up
function wrongKana(r) {
  const slots = tokenize(r.k).filter(s => s.t);
  if (r.ok) return { all: slots.map(s => s.t), bad: [] };
  if (r.self || !r.ans) return { all: slots.map(s => s.t), bad: slots.map(s => s.t) };
  const mi = firstMismatch(r.k, r.ans);
  const bad = tokenize(r.k)[mi];
  return { all: slots.map(s => s.t), bad: bad && bad.t ? [bad.t] : [] };
}
function weakLine(records) {
  const cnt = {};
  records.forEach(r => wrongKana(r).bad.forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }));
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return top.length ? '本组出错的假名：' + top.map(([t, n]) => `<b lang="ja">${esc(t)}</b>×${n}`).join(' ') : '';
}
async function finish() {
  if (quiz.phase === 'done') return;
  quiz.phase = 'done';
  clearInterval(timerId); clearTimeout(autoId);
  const secs = Math.floor((Date.now() - quiz.t0) / 1000);
  const total = quiz.records.length, ok = quiz.ok;
  const B = bank[quiz.mode];
  let added = 0, removed = 0;
  quiz.records.forEach(r => {
    const e = B[r.k];
    if (r.ok) { if (e) { e.s++; if (e.s >= 2) { delete B[r.k]; removed++; } } }
    else { if (!e) added++; B[r.k] = { w: (e ? e.w : 0) + 1, s: 0 }; }
    const s = stat[r.k] || [0, 0]; s[0]++; if (!r.ok) s[1]++; stat[r.k] = s;
    const wk = wrongKana(r);
    wk.all.forEach(t => { const x = kstat[t] || [0, 0]; wk.bad.includes(t) ? x[1]++ : x[0]++; kstat[t] = x; });
  });
  store.set('bank', bank); store.set('stat', stat); store.set('kana', kstat);
  const last = hist.find(h => h.label === quiz.label);
  hist.unshift({ t: Date.now(), mode: quiz.mode, label: quiz.label, ok, total, s: secs });
  hist = hist.slice(0, 20);
  store.set('hist', hist);
  bumpDay(total);
  renderHome();

  $('resSub').textContent = quiz.label + '　' + new Date().toLocaleDateString('zh-CN');
  $('resScore').textContent = ok;
  $('resTotal').textContent = '/ ' + total;
  $('resAcc').textContent = Math.round(ok / total * 100) + '%';
  $('resTime').textContent = fmt(secs);
  $('resLast').hidden = !last;
  if (last) $('resLastVal').textContent = `${last.ok}/${last.total}`;
  $('resGrid').innerHTML = quiz.records.map((r, i) =>
    `<span class="mark ${r.ok ? 'ok' : 'no'}"><i>${r.ok ? '✓' : '×'}</i>${i + 1}</span>`).join('');
  const wrongs = quiz.records.filter(r => !r.ok);
  const weak = weakLine(wrongs);
  $('resWeak').hidden = !weak; $('resWeak').innerHTML = weak;
  $('resWrongBox').hidden = !wrongs.length;
  $('resPerfect').hidden = !!wrongs.length;
  const note = [];
  if (added) note.push(`${added} 个记入错题本`);
  if (removed) note.push(`${removed} 个连对两次已移出`);
  $('resBankNote').hidden = !note.length;
  $('resBankNote').textContent = note.join('，') + (added ? '，连对两次自动移出。' : '。');
  $('btnRedoWrong').hidden = !wrongs.length;
  $('btnHome').textContent = quiz.from === 'ref' ? '返回五十音图' : '返回设置';
  if (wrongs.length) {
    $('resWrongTitle').textContent = `错题 ${wrongs.length} 个 · 读三遍再走`;
    $('resWrongList').innerHTML = wrongs.map(r => {
      const idx = quiz.records.indexOf(r) + 1;
      return `<div class="wrong"><span class="n">${idx}</span><span class="w" lang="ja">${esc(r.k)}</span>
        <span><span class="r">${esc(r.r)}</span> <span class="m">${meanTail(r)}</span>
        ${r.ans ? `<span class="u">${esc(r.ans)}</span>` : ''}${spkBtn(r.k)}</span></div>`;
    }).join('');
  }
  show('result');
}

/* ---------------- home ---------------- */
function bankItems(mode) {
  return Object.keys(bank[mode]).map(k => {
    const w = WORD.get(k);
    if (w) return wordItem(w);
    const e = LOOKUP[k];
    return e ? kanaItem(e, k === e.k && e.h !== e.k ? 'k' : 'h') : null;
  }).filter(Boolean);
}
function renderBank() {
  const nr = Object.keys(bank.r).length, nd = Object.keys(bank.d).length, n = settings.mode === 'd' ? nd : nr;
  $('bankCnt').textContent = nr + nd ? `认读 ${nr} · 听写 ${nd}` : '';
  $('bankInfo').textContent = nr + nd ? '连对两次自动移出。练错题按当前题型出题。' : '错题本是空的，答错的题会自动记到这里。';
  $('btnBank').disabled = !n; $('btnBank').textContent = n ? `练错题（${Math.min(n, 40)}）` : '练错题';
  $('btnClear').disabled = !(nr + nd); $('btnClear').textContent = '清空错题本';
}
let histAll = false;
function renderHome() {
  renderBank();
  const ul = $('histList');
  const rows = histAll ? hist : hist.slice(0, 3);
  ul.innerHTML = rows.length ? rows.map(h => {
    const d = new Date(h.t);
    const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const perfect = h.ok === h.total ? ' perfect' : '';
    return `<li><span class="when">${when}</span><span class="what">${esc(h.label)}</span>
      <span class="score${perfect}">${h.ok}/${h.total}</span><span class="minor">${fmt(h.s)}</span></li>`;
  }).join('') : '<li class="empty">还没有记录，先来一组吧。</li>';
  $('btnMoreHist').hidden = hist.length <= 3;
  $('btnMoreHist').textContent = histAll ? '收起 ▴' : `全部 ${hist.length} 条 ▾`;
  const t = $('today');
  if (day && day.d === dayKey(new Date())) { t.hidden = false; t.textContent = `今天 ${day.n} 题 · 连续 ${day.streak} 天`; }
  else t.hidden = true;
}

/* ---------------- kana chart ---------------- */
let refScript = store.get('refScript', 'h');
const REF_SCRIPT = [['h', '平假名'], ['k', '片假名'], ['b', '对照']];
const SECTIONS = [
  { id: 'sei', title: '清音', types: ['sei'], cols: 5, head: ['a', 'i', 'u', 'e', 'o'] },
  { id: 'dak', title: '浊音 · 半浊音', types: ['dak', 'han'], cols: 5, head: ['a', 'i', 'u', 'e', 'o'] },
  { id: 'yo', title: '拗音', types: ['yo'], cols: 3, head: ['ゃ', 'ゅ', 'ょ'] },
  { id: 'gai', title: '外来语音', types: ['gai'], gai: true },
];
const pickState = {};   // section id -> Set of row labels
function cellText(e) {
  if (refScript === 'b' && e.h) return `<span class="kn pair">${e.h}<i>${e.k}</i></span>`;
  return `<span class="kn">${refScript === 'k' || !e.h ? e.k : e.h}</span>`;
}
function cell(e) {
  const say = refScript === 'k' || !e.h ? e.k : e.h;
  return `<button type="button" class="cell" data-say="${say}" lang="ja">${cellText(e)}<span class="rm">${e.show}</span></button>`;
}
function rowsOf(sec) { return sec.types.flatMap(t => TABLES[t].map(r => ({ ...r, type: t }))); }
function renderSection(sec) {
  const rows = rowsOf(sec);
  const sel = pickState[sec.id] || (pickState[sec.id] = new Set(rows.map(r => r.label)));
  let grid;
  if (sec.gai) {
    grid = '<div class="gai">' + rows.map(r => `<span class="grp">${r.label} 组</span>` + r.cells.map(cell).join('')).join('') + '</div>';
  } else {
    let body = sec.head.map(h => `<span class="hd">${h}</span>`).join('');
    rows.forEach((r, i) => {
      if (r.type === 'han') body += '<span class="sep">半浊音</span>';
      if (r.label === 'ん') { body += cell(r.cells[0]) + '<span class="cell note">拨音，占一拍但不单独成音节，见下方规则</span>'; return; }
      body += r.cells.map(c => c ? cell(c) : '<span class="cell empty"></span>').join('');
    });
    grid = `<div class="grid c${sec.cols}">${body}</div>`;
  }
  const count = quizCount(sec, sel);
  const pickrow = `<div class="pickrow" id="pick-${sec.id}" hidden>
    <div class="chips">${rows.map(r => `<button type="button" data-row="${r.label}" class="${sel.has(r.label) ? 'sel' : ''}">${r.label}</button>`).join('')}
      <button type="button" data-row="*">全部</button></div>
    <button type="button" class="go" data-start="${sec.id}" ${count ? '' : 'disabled'}>开始（${count}）</button></div>`;
  return `<div class="panel refsec" id="sec-${sec.id}"><h2>${sec.title}${sec.gai ? ' <span class="cnt">只用片假名</span>' : ''}<button type="button" data-pick="${sec.id}">出题 ›</button></h2>${pickrow}${grid}</div>`;
}
function quizItemsOf(sec, sel) {
  const entries = rowsOf(sec).filter(r => sel.has(r.label)).flatMap(r => r.cells.filter(Boolean));
  return kanaItems(entries, refScript);
}
function quizCount(sec, sel) { return quizItemsOf(sec, sel).length; }
const RULES = `<div class="panel refsec" id="sec-rules"><h2>三条规则</h2><ul class="rules">
  <li><span class="sym">っ</span><div><div class="t"><b>促音</b>　停一拍，下一个辅音双写</div><div class="ex"><i>きって</i> kitte · <i>ざっし</i> zasshi · <i>サッカー</i> sakkaa · <i>まっちゃ</i> matcha</div></div></li>
  <li><span class="sym">ー</span><div><div class="t"><b>长音</b>　前一个元音拉长一拍</div><div class="ex">平假名加元音：<i>おかあさん</i> okaasan · <i>とうきょう</i> toukyou（お段 + う）· <i>おおきい</i> ookii<br>片假名一律写 ー：<i>コーヒー</i> koohii · <i>ケーキ</i> keeki</div></div></li>
  <li><span class="sym">ん</span><div><div class="t"><b>拨音</b>　鼻音占一拍，不单独成音节</div><div class="ex"><i>しんぶん</i> shinbun · <i>さんぽ</i> sanpo（b/m/p 前读 m）· 后接元音加 '：<i>きんえん</i> kin'en</div></div></li>
</ul></div>`;
function renderRef() {
  $('refBody').innerHTML = SECTIONS.map(renderSection).join('') + RULES;
  $('refAnchors').innerHTML = [...SECTIONS.map(s => [s.id, s.title.split(' ')[0]]), ['rules', '规则']]
    .map(([id, t]) => `<button type="button" data-goto="sec-${id}">${t}</button>`).join('');
}
$('refBody').addEventListener('click', e => {
  const pick = e.target.closest('[data-pick]');
  if (pick) { const p = $('pick-' + pick.dataset.pick); p.hidden = !p.hidden; return; }
  const row = e.target.closest('[data-row]');
  if (row) {
    const secEl = row.closest('.refsec'), sec = SECTIONS.find(s => 'sec-' + s.id === secEl.id), sel = pickState[sec.id];
    const all = rowsOf(sec).map(r => r.label);
    if (row.dataset.row === '*') { sel.size === all.length ? sel.clear() : all.forEach(l => sel.add(l)); }
    else sel.has(row.dataset.row) ? sel.delete(row.dataset.row) : sel.add(row.dataset.row);
    const open = !$('pick-' + sec.id).hidden;
    secEl.outerHTML = renderSection(sec);
    $('pick-' + sec.id).hidden = !open;
    return;
  }
  const start = e.target.closest('[data-start]');
  if (start) {
    const sec = SECTIONS.find(s => s.id === start.dataset.start), sel = pickState[sec.id];
    const items = shuffle(quizItemsOf(sec, sel));
    if (!items.length) return;
    const rows = rowsOf(sec).filter(r => sel.has(r.label)).map(r => r.label);
    const lab = `${settings.mode === 'd' ? '听写·' : ''}假名·${rows.length === rowsOf(sec).length ? sec.title.split(' ')[0] : rows.join('+')}·${refScript === 'b' ? '混合' : SCRIPT_LABEL[refScript]}`;
    const again = () => startQuiz(shuffle(quizItemsOf(sec, sel)), lab, { from: 'ref', again });
    again();
    return;
  }
  const c = e.target.closest('.cell[data-say]');
  if (c && tts.voice) { c.classList.add('lit'); setTimeout(() => c.classList.remove('lit'), 300); }
});
$('refAnchors').addEventListener('click', e => {
  const b = e.target.closest('[data-goto]');
  if (b) $(b.dataset.goto).scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------------- wiring ---------------- */
seg($('segMode'), MODE, () => settings.mode, v => settings.mode = v);
seg($('segContent'), CONTENT, () => settings.content, v => settings.content = v);
seg($('segDiff'), DIFF, () => settings.diff, v => settings.diff = v);
chips($('chipKana'), KTYPES, settings.kanaTypes);
seg($('segKanaScript'), KSCRIPT, () => settings.kanaScript, v => settings.kanaScript = v);
// 10 / 20 / or type your own number in the third slot
function renderCount() {
  const el = $('segCount'); el.innerHTML = '';
  const sync = () => {
    el.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === settings.countSel));
    el.querySelector('.cntbox').classList.toggle('sel', settings.countSel === 'custom');
  };
  COUNTS.forEach(([v, text]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text; b.dataset.v = v;
    b.onclick = () => { settings.countSel = v; sync(); afterSetting(); };
    el.appendChild(b);
  });
  const box = document.createElement('label'); box.className = 'cntbox';
  const inp = document.createElement('input');
  inp.type = 'number'; inp.min = 1; inp.max = 500; inp.inputMode = 'numeric'; inp.value = settings.custom;
  inp.setAttribute('aria-label', '自定义题数');
  inp.onfocus = () => { if (settings.countSel !== 'custom') { settings.countSel = 'custom'; sync(); afterSetting(); } };
  inp.oninput = () => {
    const v = Math.min(500, Math.max(1, Math.floor(+inp.value || 0)));
    if (v) { settings.custom = v; afterSetting(); }
  };
  inp.onblur = () => { inp.value = settings.custom; };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); startFromSettings(); } };
  box.append(inp, document.createTextNode('题'));
  el.appendChild(box);
  sync();
}
renderCount();
seg($('segRefScript'), REF_SCRIPT, () => refScript, v => { refScript = v; store.set('refScript', v); renderRef(); });
afterSetting();

$('btnStart').onclick = startFromSettings;
$('btnGo').onclick = () => quiz && (quiz.phase === 'ask' ? submit() : next());
$('btnReveal').onclick = reveal;
$('btnYes').onclick = () => judge(true);
$('btnNo').onclick = () => judge(false);
$('btnNext').onclick = next;
$('btnGiveup').onclick = () => quiz && quiz.phase === 'ask' && quiz.mode === 'r' && settle(false, '', false);
let exitArmed = 0;
$('btnExit').onclick = () => {
  const dt = Date.now() - exitArmed;
  if (dt > 400 && dt < 2500) { exitArmed = 0; $('btnExit').textContent = '×'; $('btnExit').classList.remove('armed'); exitQuiz(); return; }
  if (dt <= 400) return;
  exitArmed = Date.now();
  $('btnExit').textContent = '退出?'; $('btnExit').classList.add('armed');
  setTimeout(() => { if (exitArmed) { exitArmed = 0; $('btnExit').textContent = '×'; $('btnExit').classList.remove('armed'); } }, 2500);
};
$('btnAgain').onclick = () => quiz && quiz.again ? quiz.again() : startFromSettings();
$('btnHome').onclick = () => { if (quiz && quiz.from === 'ref') location.hash = '#ref'; else show('home'); };
$('btnRedoWrong').onclick = () => {
  const wrongs = quiz.records.filter(r => !r.ok).map(r => ({ k: r.k, r: r.r, m: r.m, s: r.s, kind: r.kind, e: r.e }));
  if (wrongs.length) startQuiz(shuffle(wrongs), `${quiz.mode === 'd' ? '听写·' : ''}错题重练`, { from: quiz.from });
};
$('btnBank').onclick = () => {
  const items = shuffle(bankItems(settings.mode)).slice(0, 40);
  const again = () => startQuiz(shuffle(bankItems(settings.mode)).slice(0, 40), `${settings.mode === 'd' ? '听写·' : ''}错题本`, { again });
  if (items.length) again();
};
let clearArmed = 0;
$('btnClear').onclick = () => {
  const dt = Date.now() - clearArmed;
  if (dt <= 400) return;
  if (dt < 2500) { clearArmed = 0; bank = { r: {}, d: {} }; store.set('bank', bank); renderHome(); return; }
  clearArmed = Date.now(); $('btnClear').textContent = '再点一次确认清空';
  setTimeout(() => { if (clearArmed) { clearArmed = 0; renderHome(); } }, 2500);
};
$('btnMoreHist').onclick = () => { histAll = !histAll; renderHome(); };

document.addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;
  if (!$('quiz').classList.contains('on') || !quiz) return;
  const d = quiz.mode === 'd';
  if (e.key === 'Enter') {
    e.preventDefault();
    if (quiz.phase === 'ask') d ? reveal() : submit();
    else if (quiz.phase === 'fb') next();
    return;
  }
  if (!d) return;
  if (e.key === ' ' && quiz.phase === 'ask') { e.preventDefault(); reveal(); }
  else if (quiz.phase === 'reveal' && e.key === 'ArrowRight') judge(true);
  else if (quiz.phase === 'reveal' && e.key === 'ArrowLeft') judge(false);
});
window.addEventListener('resize', () => { if (quiz && $('quiz').classList.contains('on') && $('qWord').classList.contains('kword') && !$('qWord').classList.contains('prompt')) fitWord(); });

renderHome();
tts.init();
route();
