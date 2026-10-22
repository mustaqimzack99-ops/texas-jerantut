(function () {
  'use strict';
  var C = window.GajiCalc, SEED = window.GajiSeed, I18N = window.GajiI18n;
  var KEY = 'gajiPT.v1';
  var RING = 326.73; // lilitan cincin (r=52)

  var state, tab = 'home', sheetClose = null, undoSnap = null, toastTimer = null, uidN = 0, lastPunch = 0, shownNet = 0;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- Ikon (SVG garis) ----------
  var ICONS = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cal: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/>',
    wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v4"/><rect x="4" y="7.5" width="16" height="12" rx="2.5"/><path d="M16 13.5h.01"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    login: '<path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="m10 17 5-5-5-5M15 12H3"/>',
    logout: '<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    coffee: '<path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 2.5v2.5M12 2.5v2.5"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    check: '<path d="M5 12.5 9.5 17 19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5h-1"/>',
    addsq: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 8v8M8 12h8"/>'
  };
  function ic(name) { return '<svg class="i" viewBox="0 0 24 24">' + ICONS[name] + '</svg>'; }

  // ---------- Bahasa ----------
  function dict() { return I18N.L[(state && state.settings.lang) || 'en'] || I18N.L.en; }
  function t(key) {
    var s = dict()[key];
    if (s == null) s = I18N.L.en[key];
    if (s == null) return key;
    for (var i = 1; i < arguments.length; i++) s = s.split('{' + (i - 1) + '}').join(arguments[i]);
    return s;
  }
  function DAYS() { return dict().DAYS; }
  function MON() { return dict().MON; }

  // ---------- Util ----------
  function uid() { uidN++; return Date.now().toString(36) + uidN.toString(36) + Math.random().toString(36).slice(2, 6); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function nowHM() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function parseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmt12(hm, compact) {
    if (!hm) return '-';
    var m = C.toMin(hm), h = Math.floor(m / 60), mm = m % 60, ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 || 12;
    if (compact) return h12 + (mm ? ':' + pad(mm) : '') + ap;
    return h12 + ':' + pad(mm) + ' ' + ap;
  }
  function groupInt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtRM(sen) {
    var neg = sen < 0, s = Math.abs(Math.round(sen));
    return (neg ? '-' : '') + groupInt(Math.floor(s / 100)) + '.' + pad(s % 100);
  }
  function fmtH(min) { return String(Math.round(min * 100 / 60) / 100); }
  function num(v) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function shortDate(iso) { var d = parseISO(iso); return d.getDate() + ' ' + MON()[d.getMonth()]; }
  function errText(code) { return t('e_' + code); }
  function mmss(sec) { // kiraan turun rehat "29:41"
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + pad(sec % 60);
  }
  function hms(sec) { // "2:15" + saat kecil
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return h + ':' + pad(m) + '<small>:' + pad(s) + '</small>';
  }

  // ---------- Simpanan ----------
  // Install baru mula kosong (data peribadi user hanya dalam APK peribadi)
  function freshState(lang) {
    var s = { v: 1, dv: 4, settings: clone(C.DEFAULT_SETTINGS), periods: [], plan: [], activeId: null, open: null };
    s.settings.lang = lang || '';
    s.settings.theme = 'light';
    return s;
  }
  function ensurePeriod() {
    if (state.periods.length) return;
    var p = { id: uid(), name: defaultPeriodName(), entries: [] };
    state.periods.push(p); state.activeId = p.id;
  }
  function load() {
    try {
      var raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { /* storage tak boleh guna */ }
      // Data dari salinan Android (contoh lepas update tukar origin)
      if (!raw && window.AndroidUI && window.AndroidUI.getData) raw = window.AndroidUI.getData();
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.periods) {
          s.settings = Object.assign(clone(C.DEFAULT_SETTINGS), s.settings || {});
          return s;
        }
      }
    } catch (e) { /* data rosak / storage tak boleh guna */ }
    return freshState('');
  }
  function save() {
    var json = JSON.stringify(state);
    try { localStorage.setItem(KEY, json); } catch (e) { toast(t('saveFail')); }
    try { if (window.AndroidUI && window.AndroidUI.putData) window.AndroidUI.putData(json); } catch (e) { /* bukan dalam APK */ }
  }
  function defaultPeriodName() { var d = new Date(); return t('defaultPeriod', MON()[d.getMonth()], d.getFullYear()); }

  function findPeriod(id) { for (var i = 0; i < state.periods.length; i++) if (state.periods[i].id === id) return state.periods[i]; return null; }
  function period() { return findPeriod(state.activeId) || currentPeriod(); }        // tempoh yang sedang dilihat
  function currentPeriod() { return state.periods[state.periods.length - 1]; }       // tempoh semasa (punch masuk sini)
  function sorted(entries) {
    return entries.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (C.toMin(a.in) || 0) - (C.toMin(b.in) || 0);
    });
  }
  // Syif yang sedang berjalan (punch terbuka)
  function openShift() {
    if (!state.open) return null;
    var p = findPeriod(state.open.pid), e = null;
    if (p) for (var i = 0; i < p.entries.length; i++) if (p.entries[i].id === state.open.eid) e = p.entries[i];
    if (!e || e.type !== 'time' || e.out) { state.open = null; return null; }
    return { p: p, e: e };
  }
  function at(dateISO, hm, after) { // Date sebenar untuk masa dalam syif (ikut tarikh masuk, lepas tengah malam = esok)
    var d = parseISO(dateISO);
    d.setMinutes(C.toMin(hm));
    if (after && d < after) d.setDate(d.getDate() + 1);
    return d;
  }

  // ---------- Render ----------
  function renderAll() { renderStatic(); renderHome(); renderPlan(); renderList(); renderSettings(); }
  // Tema gelap / cerah (+ warna status bar Android melalui jambatan AndroidUI)
  function applyTheme() {
    var th = state.settings.theme === 'dark' ? 'dark' : 'light'; // default cerah
    document.documentElement.setAttribute('data-theme', th);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', th === 'light' ? '#F2F3F6' : '#0A0B0E');
    try { if (window.AndroidUI) window.AndroidUI.setTheme(th); } catch (e) { /* bukan dalam APK */ }
  }
  function renderStatic() {
    applyTheme();
    document.documentElement.lang = state.settings.lang || 'en';
    $('brandSub').textContent = t('sub');
    $('navHome').textContent = t('tabHome');
    $('navList').textContent = t('tabList');
    $('navPlan').textContent = t('tabPlan');
    $('navSet').textContent = t('tabSet');
    $('periodName').textContent = period().name;
  }

  function heroHTML(p, s) {
    var st = state.settings, ded = s.kwsp + s.socso + s.eis;
    var segs = [['#FFFFFF', s.net, t('lgNet')]];
    if (st.kwsp) segs.push(['#FF7A80', s.kwsp, t('lgEpf')]);
    if (st.socso) segs.push(['#FFB020', s.socso, 'SOCSO']);
    if (st.eis) segs.push(['#9A8BFF', s.eis, 'EIS']);
    var bar = s.gross > 0 ? segs.map(function (g) {
      return g[1] > 0 ? '<i style="width:' + (g[1] * 100 / s.gross).toFixed(2) + '%;min-width:4px;background:' + g[0] + '"></i>' : '';
    }).join('') : '';
    // Atas: gaji hari ini = syif semasa/terakhir (besar, live). Bawah: jumlah gaji bersih tempoh ini.
    var ls = lastShift(new Date()), pill;
    if (ls && ls.live) pill = t('since', fmt12(ls.e.in));
    else if (ls) pill = shortDay(ls.e.date);
    else pill = shortDay(todayISO());
    return '<div class="card hero">' +
      '<div class="row-between"><div class="eyebrow">' + t('todayPay') + ' <span class="tag live" id="todayLive" style="display:none">LIVE</span></div>' +
      '<div class="pp">' + pill + '</div></div>' +
      '<div class="amt"><span class="cur">RM</span><span class="int" id="todayInt">0</span><span class="dec" id="todayDec">.00</span></div>' +
      '<div class="amt-sub"><span id="todaySub"></span></div>' +
      '<div class="hero-div"></div>' +
      '<div class="row-between"><div class="eyebrow">' + t('totalNet') + '</div><div class="pp">' + esc(p.name) + '</div></div>' +
      '<div class="amt amt2"><span class="cur">RM</span><span class="int" id="netInt">0</span><span class="dec" id="netDec">.00</span></div>' +
      '<div class="amt-sub"><span>' + t('grossL') + ' <b>RM' + fmtRM(s.gross) + '</b></span><span>' + t('dedL') + ' <b>RM' + fmtRM(ded) + '</b></span></div>' +
      // Lebih masa (oren): asing dari gaji bersih, belum pasti dapat
      (s.otMin ? '<div class="hero-ot">' + ic('clock') + '<span>' + t('otLine') + ' +' + otLabel(s.otMin) + ' &middot; <b>RM' + fmtRM(s.otPay) + '</b> &middot; ' + t('otUnsure') + '</span></div>' : '') +
      '<div class="split">' + bar + '</div>' +
      '<div class="legend">' + segs.map(function (g) { return '<span style="--c:' + g[0] + '">' + g[2] + '</span>'; }).join('') + '</div>' +
      '</div>';
  }

  function titleName(s) {
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s(])([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); });
  }
  function shortDay(iso) { var d = parseISO(iso); return DAYS()[d.getDay()] + ', ' + d.getDate() + ' ' + MON()[d.getMonth()]; }
  /*
   * "Gaji hari ini" dikira ikut SYIF, bukan tarikh: syif yang sedang berjalan, atau syif terakhir yang dah tamat.
   * Masuk 11PM keluar 6AM = satu syif. Tekan MASUK KERJA lagi = mula dari 0.
   * Syif yang belum berlaku (dirancang, masa depan) tak dikira.
   * Hanya syif dalam tempoh yang sedang dibuka: tempoh baru = mula RM0.00.
   */
  function lastShift(now) {
    var o = openShift();
    if (o) return { e: o.e, live: true };
    var best = null, bestEnd = 0, nowMs = now.getTime();
    [period()].forEach(function (p) {
      p.entries.forEach(function (e) {
        if (e.type !== 'time' || !e.out || C.toMin(e.in) === null || C.toMin(e.out) === null) return;
        var end = e.outTs || at(e.date, e.out, at(e.date, e.in)).getTime();
        if (end <= nowMs && end > bestEnd) { best = e; bestEnd = end; }
      });
    });
    return best ? { e: best, live: false } : null;
  }
  // Masa kerja syif terbuka setakat ini (saat)
  function openWork(o, now) {
    var e = o.e, tin = e.inTs ? new Date(e.inTs) : at(e.date, e.in), brkSec = 0, actualSec = 0, onBreak = false, brkUntil = null;
    if (e.brk === 'actual' && e.brkOut) {
      var bo = e.brkOutTs ? new Date(e.brkOutTs) : at(e.date, e.brkOut, tin);
      var bi = e.brkIn ? (e.brkInTs ? new Date(e.brkInTs) : at(e.date, e.brkIn, bo)) : now;
      var std = (Number(state.settings.stdBreak) || 0) * 60;
      actualSec = (bi - bo) / 1000; onBreak = !e.brkIn;
      // Rehat diberi penuh: masuk awal pun timer tunggu sampai cukup 30 min (tak lompat turun)
      brkSec = Math.max(actualSec, Math.min((now - bo) / 1000, std));
      brkUntil = new Date(bo.getTime() + std * 1000);
    }
    return { tin: tin, workSec: Math.max(0, (now - tin) / 1000 - brkSec), brkSec: brkSec, actualSec: actualSec, onBreak: onBreak, brkUntil: brkUntil };
  }
  // ---------- Padan punch dengan jadual ----------
  var EARLY_MS = 16 * 3600 * 1000; // masuk seawal mana pun tetap ikut jadual hari tu (had 16 jam supaya tak terlekat jadual esok)
  function findSched(inMs) {
    var best = null, bd = 1e15;
    state.plan.forEach(function (p) {
      if (!p.date || p.type !== 'time' || C.toMin(p.in) === null || C.toMin(p.out) === null) return;
      var sp = spanOf(p);
      if (inMs < sp[0] - EARLY_MS || inMs >= sp[1]) return;
      var d = Math.abs(sp[0] - inMs);
      if (d < bd) { bd = d; best = { p: p, s: sp[0], e: sp[1] }; }
    });
    return best;
  }
  // Lekat jadual pada syif (minit mula/tamat jadual relatif dari punch masuk) — gaji ikut jadual
  function attachSched(e) {
    var inMs = e.inTs || at(e.date, e.in).getTime(), m = findSched(inMs);
    if (!m) return false;
    e.sched = { id: m.p.id, date: m.p.date, in: m.p.in, out: m.p.out, s: (m.s - inMs) / 60000, e: (m.e - inMs) / 60000 };
    return true;
  }
  function attachSchedByOverlap(e) {
    var sp = spanOf(e), best = null, bo = 0;
    state.plan.forEach(function (p) {
      if (!p.date || p.type !== 'time' || C.toMin(p.in) === null || C.toMin(p.out) === null) return;
      var ps = spanOf(p), ov = Math.min(sp[1], ps[1]) - Math.max(sp[0], ps[0]);
      if (ov > bo) { bo = ov; best = { p: p, s: ps[0], e: ps[1] }; }
    });
    if (!best) return false;
    e.sched = { id: best.p.id, date: best.p.date, in: best.p.in, out: best.p.out, s: (best.s - sp[0]) / 60000, e: (best.e - sp[0]) / 60000 };
    return true;
  }
  // Syif berjalan ikut jadual: minit dibayar (blok 30), lebih masa (blok 30), masih tunggu mula?
  function liveSched(o, now) {
    var e = o.e;
    if (!e.sched) return null;
    var w = openWork(o, now), inMs = e.inTs || at(e.date, e.in).getTime(), el = (now - inMs) / 60000;
    var ws = Math.max(0, e.sched.s), we = Math.max(ws, Math.min(el, e.sched.e));
    var paid = Math.max(0, (we - ws) - Math.min(w.brkSec / 60, we - ws)), ot = el - Math.max(e.sched.e, ws);
    var early = Math.min(el, Math.max(0, e.sched.s)); // kerja sebelum jadual mula = lebih masa juga
    var otB = (early > 0 ? Math.floor(early / 30 + 1e-9) * 30 : 0) + (ot > 0 ? Math.floor(ot / 30 + 1e-9) * 30 : 0);
    return { paid: Math.floor(paid / 30 + 1e-9) * 30, ot: otB, otRaw: Math.max(0, ot) + early,
      workSec: paid * 60, waiting: el < e.sched.s, startAt: new Date(inMs + e.sched.s * 60000) };
  }
  function otPaySen(min) { return Math.round(min * Math.round(Number(state.settings.rate) * 100) / 60); }

  // Gaji hari ini (kasar) = gaji syif semasa/terakhir; live bila tengah kerja
  function todayPay(now) {
    var st = state.settings, ls = lastShift(now), sec = 0, mid = false;
    if (!ls) return { sen: 0, min: 0, live: false, e: null };
    var ot = 0;
    if (ls.live) {
      var lv = liveSched({ e: ls.e }, now);
      if (lv) { sec = lv.paid * 60; ot = lv.ot; } else sec = openWork({ e: ls.e }, now).workSec;
      var nm = nowHM();
      mid = nm !== ls.e.in && C.calcEntry({ type: 'time', in: ls.e.in, out: nm, brk: 'none', sched: ls.e.sched }).midnight;
    } else {
      var c = C.calcEntry(ls.e, st);
      sec = c.ok ? c.minutes * 60 : 0; mid = c.ok && c.midnight; ot = c.otMinutes || 0;
    }
    var rateSen = Math.round(Number(st.rate) * 100), midSen = Math.round(Number(st.midnight) * 100);
    return { sen: Math.round(sec * rateSen / 3600) + (mid ? midSen : 0), min: sec / 60, live: ls.live, e: ls.e, ot: ot };
  }
  function statsHTML(s) {
    function tile(icon, c, soft, val, label) {
      return '<div class="stat"><div class="ico" style="--c:' + c + ';--soft:' + soft + '">' + ic(icon) + '</div><div><b>' + val + '</b><span>' + label + '</span></div></div>';
    }
    return '<div class="stats">' +
      tile('clock', 'var(--red-hi)', 'var(--red-soft)', fmtH(s.totalMin), t('totalHours')) +
      tile('cal', 'var(--green)', 'var(--green-soft)', s.workDays, t('workDays')) +
      tile('moon', 'var(--violet)', 'var(--violet-soft)', s.midnightCount + '&times;', t('midnight')) +
      tile('gauge', 'var(--amber)', 'var(--amber-soft)', s.avgHundredths / 100, t('avgDay')) +
      '</div>';
  }
  function clockHTML() {
    var o = openShift(), e = o ? o.e : {};
    var onBreak = !!(o && e.brk === 'actual' && e.brkOut && !e.brkIn), hadBreak = !!(o && e.brk === 'actual' && e.brkIn);
    var stCls = !o ? '' : onBreak ? ' brk' : ' work';
    var stTxt = !o ? t('notIn') : onBreak ? t('onBreak') : t('working');
    function step(label, v) { return '<div class="tl-s' + (v ? ' done' : '') + '"><em>' + label + '</em><i></i><b>' + (v ? fmt12(v, true) : '--') + '</b></div>'; }
    var act = e.brk === 'actual';
    var btns;
    if (!o) btns = '<button class="btn big" data-punch="in">' + ic('login') + t('clockIn') + '</button>';
    else if (onBreak) btns = '<button class="btn big go" data-punch="brkIn">' + ic('login') + t('endBreak') + '</button>';
    else btns = (hadBreak ? '' : '<button class="btn big amber" data-punch="brkOut">' + ic('coffee') + t('startBreak') + '</button>') +
      '<button class="btn big" data-punch="out">' + ic('logout') + t('clockOut') + '</button>';
    return '<div class="card" id="punchCard"><div class="eyebrow">' + t('timeClock') + '</div>' +
      '<div class="clock"><div class="ring' + (onBreak ? ' brk' : '') + '" id="ring"><svg viewBox="0 0 120 120"><circle class="trk" cx="60" cy="60" r="52"/>' +
      '<circle class="prg" id="ringPrg" cx="60" cy="60" r="52" stroke-dasharray="' + RING + '" stroke-dashoffset="' + RING + '"/></svg>' +
      '<div class="ring-c"><b id="ringVal"></b><span id="ringLbl"></span></div></div>' +
      '<div class="clock-info"><div class="status' + stCls + '"><span class="dot"></span>' + stTxt + '</div>' +
      '<div class="clock-date" id="clkDate"></div><div class="clock-sub" id="clkSub"></div></div></div>' +
      '<div class="tl">' + step(t('stepIn'), e.in) + step(t('stepBreak'), act ? e.brkOut : '') + step(t('stepBack'), act ? e.brkIn : '') + step(t('stepOut'), e.out) + '</div>' +
      '<div class="btn-row">' + btns + '</div></div>';
  }
  function slipHTML(s) {
    var st = state.settings;
    function li(cls, label, sub, val) {
      return '<div class="li' + cls + '"><div><b>' + label + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div><span>' + val + '</span></div>';
    }
    return '<div class="card"><div class="eyebrow">' + t('payslip') + '</div>' +
      (s.openCount ? '<div class="warn">' + t('openWarn') + '</div>' : '') +
      '<div class="slip">' +
      li('', t('hourlyPay'), t('hoursX', fmtH(s.totalMin), fmtRM(s.rateSen)), fmtRM(s.basePay)) +
      li('', t('midAllow'), t('timesX', s.midnightCount, fmtRM(s.midSen)), fmtRM(s.midnightPay)) +
      li(' sum', t('gross'), '', fmtRM(s.gross)) +
      (st.kwsp ? li(' minus', t('epf') + ' ' + st.kwspRate + '%', t('epfSub'), '-' + fmtRM(s.kwsp)) : '') +
      (st.socso ? li(' minus', 'SOCSO', t('socsoSub'), '-' + fmtRM(s.socso)) : '') +
      (st.eis ? li(' minus', 'EIS', t('eisSub'), '-' + fmtRM(s.eis)) : '') +
      '</div>' +
      '<div class="net-row"><b>' + t('net') + '</b><span>RM' + fmtRM(s.net) + '</span></div>' +
      (s.otMin ? '<div class="ot-box"><div><b>' + t('otLine') + '</b><span>' + t('otNote') + '</span></div><strong>+' + otLabel(s.otMin) + '<br>RM' + fmtRM(s.otPay) + '?</strong></div>' : '') +
      '<div class="fine">' + t('fine', s.avgHundredths / 100, s.workDays, s.offDays) + '</div></div>';
  }
  function historyHTML() {
    var cur = currentPeriod(), view = period();
    var rows = state.periods.slice().reverse().map(function (p) {
      var s = C.summarize(p.entries, state.settings), isCur = p === cur;
      var tag = isCur ? '<span class="tag cur">' + t('current') + '</span>' : p === view ? '<span class="tag view">' + t('viewing') + '</span>' : '';
      return '<button class="h-row" data-pid="' + p.id + '">' +
        '<div class="ico" style="--c:' + (isCur ? 'var(--red-hi)' : 'var(--text-2)') + ';--soft:' + (isCur ? 'var(--red-soft)' : 'var(--ov)') + '">' + ic('wallet') + '</div>' +
        '<div class="h-mid"><b>' + esc(p.name) + '</b><span>' + t('histStat', s.workDays, fmtH(s.totalMin)) + '</span></div>' +
        '<div class="h-amt"><b>RM' + fmtRM(s.net) + '</b>' + tag + '</div></button>';
    }).join('');
    return '<div class="card"><div class="eyebrow">' + t('history') + '</div><div class="hist">' + rows + '</div></div>';
  }

  function renderHome() {
    var p = period(), s = C.summarize(p.entries, state.settings);
    var html = '';
    if (p !== currentPeriod()) html += '<button class="past" id="toCurrent">' + ic('history') + '<span>' + t('viewingPast') + '</span><b>' + t('backToCurrent') + '</b></button>';
    html += heroHTML(p, s) + statsHTML(s) + clockHTML() + slipHTML(s) + historyHTML();
    $('v-home').innerHTML = html;
    countNet(s.net);
    tick();
  }

  // Animasi nombor gaji bersih naik
  function countNet(to) {
    var from = shownNet, t0 = null, dur = 750;
    function paint(v) {
      v = Math.round(v);
      var a = Math.abs(v);
      var iEl = $('netInt'), dEl = $('netDec');
      if (!iEl) return;
      iEl.textContent = (v < 0 ? '-' : '') + groupInt(Math.floor(a / 100));
      dEl.textContent = '.' + pad(a % 100);
    }
    if (from === to || !window.requestAnimationFrame) { paint(to); shownNet = to; return; }
    function step(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      paint(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step); else shownNet = to;
    }
    requestAnimationFrame(step);
    setTimeout(function () { paint(to); }, dur + 120); // jaminan nilai akhir (rAF tak jalan bila app tersorok)
    shownNet = to;
  }

  function rowSub(e, c) {
    if (e.type === 'off') return t('dayOff');
    if (e.type === 'manual') return t('manualHours');
    if (c.open) return e.brk === 'actual' && e.brkOut && !e.brkIn ? t('onBreak') : t('workingNow');
    if (e.brk === 'std') return t('breakMin', state.settings.stdBreak);
    if (e.brk === 'actual') {
      var ba = Math.round(c.breakActual), bm = Math.round(c.breakMin);
      return ba < bm ? t('breakEarly', fmt12(e.brkOut, true), fmt12(e.brkIn, true), ba, bm)
        : t('breakRange', fmt12(e.brkOut, true), fmt12(e.brkIn, true), bm);
    }
    return t('noBreak');
  }
  function dayPay(c) {
    var st = state.settings;
    return Math.round(c.minutes * Math.round(Number(st.rate) * 100) / 60) + (c.midnight ? Math.round(Number(st.midnight) * 100) : 0);
  }
  function renderList() {
    var p = period(), list = sorted(p.entries).filter(function (e) { return !(e.type === 'time' && !e.out); }), s = C.summarize(p.entries, state.settings), today = todayISO();
    var html = '<div class="list-head"><div><h2>' + t('shifts') + '</h2><span>' + t('daysRec', list.length) + '</span></div></div>' +
      '<div class="lock-note">' + ic('lock') + '<span>' + t('shiftsHint') + '</span></div>';
    html += '<div class="sum3"><div><b>' + s.workDays + '</b><span>' + t('workDays') + '</span></div><div><b>' + fmtH(s.totalMin) + '</b><span>' + t('totalHours') + '</span></div><div><b>' + s.midnightCount + '&times;</b><span>' + t('midnight') + '</span></div></div>';
    if (!list.length) {
      html += '<div class="rows"><div class="empty">' + ic('cal') + '<br>' + t('empty') + '</div></div>';
    } else {
      html += '<div class="rows">' + list.map(function (e) {
        var c = C.calcEntry(e, state.settings), d = parseISO(e.date);
        var main = e.type === 'off' ? 'OFF' : e.type === 'manual' ? t('timeNotRec') : fmt12(e.in, true) + ' &ndash; ' + (e.out ? fmt12(e.out, true) : '...');
        var right = e.type === 'off' ? '0' : c.open ? '...' : c.ok ? fmtH(c.minutes) + t('h') : '!';
        // Gaji hari tu (kasar): jam x kadar + elaun midnight
        var dayRM = (e.type !== 'off' && !c.open && c.ok) ? '<span class="r-rm">RM' + fmtRM(dayPay(c)) + '</span>' : '';
        var tags = (c.midnight ? '<span class="tag mid">MIDNIGHT</span>' : '') + (c.open ? '<span class="tag live">LIVE</span>' : '') +
          (c.otMinutes ? '<span class="tag ot">+' + otLabel(c.otMinutes) + ' OT &middot; RM' + fmtRM(otPaySen(c.otMinutes)) + '?</span>' : '') +
          (e.type === 'off' ? '<span class="tag off">OFF</span>' : '') + (!c.ok ? '<span class="tag err">!</span>' : '');
        return '<button class="r' + (e.type === 'off' ? ' off' : '') + (e.date === today ? ' today' : '') + (c.otMinutes ? ' ot' : '') + '" data-edit="' + e.id + '">' +
          '<div class="r-date"><b>' + d.getDate() + '</b><span>' + MON()[d.getMonth()] + '</span></div>' +
          '<div class="r-mid"><b>' + main + '</b><span>' + DAYS()[d.getDay()] + ' &middot; ' + (c.ok ? rowSub(e, c) : esc(errText(c.error))) + '</span></div>' +
          '<div class="r-right"><b>' + right + '</b>' + dayRM + tags + '</div></button>';
      }).join('') + '</div>';
    }
    $('v-list').innerHTML = html;
  }

  function renderSettings() {
    var st = state.settings, p = period();
    function numRow(key, label, sub, step) {
      return '<div class="set-row"><label for="s-' + key + '">' + label + '<small>' + sub + '</small></label>' +
        '<input class="num" id="s-' + key + '" data-set="' + key + '" type="number" inputmode="decimal" step="' + step + '" value="' + st[key] + '"></div>';
    }
    function sw(key, label, sub) {
      return '<div class="set-row"><label>' + label + '<small>' + sub + '</small></label>' +
        '<label class="switch"><input type="checkbox" data-set="' + key + '"' + (st[key] ? ' checked' : '') + '><i></i></label></div>';
    }
    $('v-set').innerHTML =
      '<div class="card"><div class="eyebrow sec-t" style="margin-bottom:12px">' + t('language') + '</div>' +
      '<div class="seg" style="margin:0">' + I18N.LANGS.map(function (l) {
        return '<button data-lang="' + l[0] + '"' + (st.lang === l[0] ? ' class="on"' : '') + '>' + l[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="card"><div class="eyebrow sec-t" style="margin-bottom:12px">' + t('theme') + '</div>' +
      '<div class="seg" style="margin:0"><button data-theme-set="light"' + (st.theme !== 'dark' ? ' class="on"' : '') + '>' + t('themeLight') + '</button>' +
      '<button data-theme-set="dark"' + (st.theme === 'dark' ? ' class="on"' : '') + '>' + t('themeDark') + '</button></div></div>' +
      '<div class="card"><div class="eyebrow sec-t" style="margin-bottom:12px">' + t('rosterSec') + '</div>' +
      '<label class="fld" style="margin:0"><span>' + t('rosterName') + '</span><input class="txt" id="rosterNameIn" maxlength="30" placeholder="' + t('namePh') + '" autocapitalize="words" value="' + esc(st.rosterName || '') + '"></label>' +
      '<div class="fine" style="margin-top:6px">' + t('rosterNameSub') + '</div></div>' +
      '<div class="card"><div class="eyebrow sec-t">' + t('payRate') + '</div>' +
      numRow('rate', t('rate'), t('rateSub'), '0.01') +
      numRow('midnight', t('midAllowRM'), t('midSub'), '0.5') +
      numRow('stdBreak', t('stdBreak'), t('stdBreakSub'), '5') +
      '</div>' +
      '<div class="card"><div class="eyebrow sec-t">' + t('deductions') + '</div>' +
      sw('kwsp', t('epf'), t('epfSwSub')) +
      numRow('kwspRate', t('epfRate'), t('epfRateSub'), '1') +
      sw('socso', t('socsoSw'), t('socsoSwSub')) +
      sw('eis', t('eisSw'), t('eisSwSub')) +
      '</div>' +
      '<div class="card"><div class="eyebrow sec-t" style="margin-bottom:12px">' + t('period') + '</div>' +
      '<label class="fld"><span>' + t('periodName') + '</span><input class="txt" id="periodRename" value="' + esc(p.name) + '" maxlength="40"></label>' +
      '<div class="stack"><button class="btn ghost" id="newPeriod">' + t('newPeriod') + '</button>' +
      '<button class="btn danger" id="delPeriod">' + t('delPeriod') + '</button></div></div>' +
      '<div class="card"><div class="eyebrow sec-t" style="margin-bottom:12px">' + t('data') + '</div>' +
      '<button class="btn danger" id="wipeAll" style="width:100%">' + t('wipe') + '</button></div>' +
      '<div class="about">' + t('about') + '<br>Texas Jerantut v1.2</div>';
  }

  // Kemas kini jam, cincin & tempoh berjalan setiap saat (tanpa render penuh)
  function tick() {
    if (!state.settings.lang) return;
    var now = new Date(), o = openShift();
    var tInt = $('todayInt');
    if (tInt) { // gaji hari ini (live bila tengah kerja)
      var tp = todayPay(now);
      tInt.textContent = groupInt(Math.floor(tp.sen / 100));
      $('todayDec').textContent = '.' + pad(tp.sen % 100);
      $('todaySub').innerHTML = (!tp.e ? t('noShift') : tp.live ? t('todaySub', fmtH(tp.min)) :
        t('shiftSub', fmtH(tp.min), fmt12(tp.e.in, true) + ' &ndash; ' + fmt12(tp.e.out, true))) +
        (tp.ot ? ' <span class="ot-inline">+' + otLabel(tp.ot) + ' OT &middot; RM' + fmtRM(otPaySen(tp.ot)) + '?</span>' : '');
      $('todayLive').style.display = tp.live ? '' : 'none';
    }
    var val = $('ringVal'), lbl = $('ringLbl'), prg = $('ringPrg'), dEl = $('clkDate'), sub = $('clkSub');
    if (!val) return;
    dEl.textContent = DAYS()[now.getDay()] + ', ' + now.getDate() + ' ' + MON()[now.getMonth()];
    if (!o) {
      var h = now.getHours();
      val.innerHTML = ((h % 12) || 12) + ':' + pad(now.getMinutes()) + '<small>' + (h < 12 ? 'AM' : 'PM') + '</small>';
      lbl.textContent = t('ready');
      prg.setAttribute('stroke-dashoffset', RING);
      var np = nextPlan(now);
      sub.innerHTML = np ? t('nextShift', DAYS()[parseISO(np.date).getDay()] + ' ' + shortDate(np.date) + ' &middot; ' + fmt12(np.in, true) + '&ndash;' + fmt12(np.out, true)) : t('hintIn');
      return;
    }
    var e = o.e, w = openWork(o, now), frac, lv = liveSched(o, now);
    sub.textContent = t('clockedInAt', fmt12(e.in) + (e.date !== todayISO() ? ' (' + shortDate(e.date) + ')' : ''));
    if (lv && lv.waiting && !w.onBreak) { // masuk awal: kira turun ke masa jadual mula (sebelum tu tak dikira)
      val.innerHTML = hms((lv.startAt - now) / 1000); lbl.textContent = t('startsIn');
      prg.setAttribute('stroke-dashoffset', RING);
      sub.innerHTML = t('waitStart', fmt12(e.sched.in));
      return;
    }
    if (lv) sub.innerHTML = t('schedNow', fmt12(e.sched.in, true) + '&ndash;' + fmt12(e.sched.out, true)) +
      (lv.otRaw > 0 ? ' &middot; <span class="ot-inline">' + t('otRunning', otLabel(Math.floor(lv.otRaw))) + '</span>' : '');
    var std = Number(state.settings.stdBreak) || 0;
    var until = w.brkUntil ? fmt12(pad(w.brkUntil.getHours()) + ':' + pad(w.brkUntil.getMinutes())) : '';
    var ringEl = $('ring');
    if (w.onBreak) { // sedang rehat: kiraan turun 30:00 -> 0:00, cincin makin kosong
      var remain = std * 60 - w.actualSec;
      if (std && remain > 0) {
        val.innerHTML = mmss(remain); lbl.textContent = t('brkLeft');
        frac = remain / (std * 60);
        if (ringEl) ringEl.classList.remove('over');
      } else { // lebih masa rehat
        val.innerHTML = '+' + mmss(-remain); lbl.textContent = t('brkOver');
        frac = 1;
        if (ringEl) ringEl.classList.add('over');
      }
      prg.setAttribute('stroke-dashoffset', RING * (1 - frac));
      if (std) sub.innerHTML = t('backBy', std, until);
      return;
    }
    // Masuk awal: rehat masih ditolak sampai cukup 30 min
    if (w.brkUntil && now < w.brkUntil) sub.textContent = t('brkCovers', until);
    var workSec = lv ? lv.workSec : w.workSec;
    val.innerHTML = hms(workSec); lbl.textContent = t('workedLbl');
    frac = Math.min(1, workSec / (8 * 3600)); // penuh = 8 jam
    prg.setAttribute('stroke-dashoffset', RING * (1 - frac));
  }

  // ---------- Punch ----------
  function snapshot() { undoSnap = JSON.stringify({ periods: state.periods, open: state.open, plan: state.plan }); }
  function undo() {
    if (!undoSnap) return;
    var s = JSON.parse(undoSnap); state.periods = s.periods; state.open = s.open; state.plan = s.plan || []; undoSnap = null;
    save(); renderAll(); toast(t('undone'));
  }
  function punch(action) {
    // Elak double-tap: butang seterusnya muncul di tempat sama
    if (Date.now() - lastPunch < 1500) return;
    lastPunch = Date.now();
    var o = openShift(), tm = nowHM(), msg;
    if (action === 'out') {
      var c = C.calcEntry(Object.assign(clone(o.e), { out: tm }), state.settings);
      confirmSheet(t('confirmOutT'), t('confirmOutB', fmt12(tm)) + (c.ok ? t('hoursWorked', fmtH(c.minutes)) + (c.midnight ? t('plusMid') : '') : ''),
        t('clockOut'), false, function () {
          snapshot(); o.e.out = tm; o.e.outTs = Date.now(); state.open = null;
          if (!o.e.sched) attachSchedByOverlap(o.e); state.activeId = o.p.id; save(); renderAll();
          shiftDone(o.e, o.p);
        });
      return;
    }
    snapshot();
    if (action === 'in') {
      // Punch sentiasa masuk tempoh semasa, walaupun tengah lihat tempoh lama
      var p = currentPeriod(), e = { id: uid(), date: todayISO(), type: 'time', in: tm, inTs: Date.now(), out: '', brk: 'none' };
      attachSched(e); // ikut jadual kalau masuk dalam masa syif (paling awal 3 jam sebelum)
      p.entries.push(e); state.open = { pid: p.id, eid: e.id }; state.activeId = p.id; msg = t('toastIn', fmt12(tm));
    } else if (action === 'brkOut') {
      o.e.brk = 'actual'; o.e.brkOut = tm; o.e.brkOutTs = Date.now(); o.e.brkIn = ''; delete o.e.brkInTs; msg = t('toastBrkOut', fmt12(tm));
    } else if (action === 'brkIn') {
      o.e.brkIn = tm; o.e.brkInTs = Date.now(); msg = t('toastBrkIn', fmt12(tm));
    }
    save(); renderAll(); toast(msg, undo);
  }

  // Skrin "Syif selesai" terus lepas clock out: gaji hari ini + butiran syif
  function shiftDone(e, p) {
    var st = state.settings, c = C.calcEntry(e, st), tp = todayPay(new Date());
    var midSen = Math.round(Number(st.midnight) * 100);
    function row(label, val) { return '<div class="li"><div><b>' + label + '</b></div><span>' + val + '</span></div>'; }
    openSheet('<div class="done">' +
      '<div class="done-ic">' + ic('check') + '</div>' +
      '<h3>' + t('shiftDone') + '</h3>' +
      '<div class="eyebrow">' + t('todayPay') + '</div>' +
      '<div class="done-amt"><span class="cur">RM</span>' + groupInt(Math.floor(tp.sen / 100)) + '<span class="dec">.' + pad(tp.sen % 100) + '</span></div>' +
      '<div class="done-sub">' + t('beforeDed') + '</div></div>' +
      '<div class="slip">' +
      row(t('clockInL') + ' &rarr; ' + t('clockOutL'), fmt12(e.in, true) + ' &ndash; ' + fmt12(e.out, true)) +
      row(t('hoursWorkedL'), fmtH(c.minutes) + ' ' + t('h')) +
      (c.breakMin ? row(t('brk'), c.breakActual != null && Math.round(c.breakActual) < Math.round(c.breakMin)
        ? t('brkDeducted', Math.round(c.breakMin), Math.round(c.breakActual)) : Math.round(c.breakMin) + ' min') : '') +
      (c.midnight ? row(t('midAllow'), '+RM' + fmtRM(midSen)) : '') +
      (e.sched ? row(t('schedL'), fmt12(e.sched.in, true) + ' &ndash; ' + fmt12(e.sched.out, true)) : '') +
      (c.otMinutes ? '<div class="li ot-li"><div><b>' + t('otLine') + '</b><span>' + t('otUnsure') + '</span></div><span>+' + otLabel(c.otMinutes) + ' &middot; RM' + fmtRM(otPaySen(c.otMinutes)) + '</span></div>' : '') +
      '</div>' +
      '<div class="fine" style="margin:4px 0 16px">' + t('addedTo', esc(p.name)) + '</div>' +
      '<div class="btn-row"><button class="btn ghost" id="dUndo">' + t('undoBtn') + '</button><button class="btn" id="dOk">OK</button></div>');
    $('dOk').onclick = closeSheet;
    $('dUndo').onclick = function () { closeSheet(); undo(); };
  }

  // ---------- Imbas jadual manager (banyak gambar sekali) ----------
  var rosterRun = 0, batch = null;
  function addDays(iso, n) { var d = parseISO(iso); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function emptySlots() { var s = []; for (var i = 0; i < 24; i++) s.push(''); return s; }

  // Langkah 1: nama (boleh tukar setiap kali) + pilih gambar
  function startRoster() {
    if (window.GajiRoster && window.GajiRoster.warm) window.GajiRoster.warm();
    openSheet('<h3>' + t('scanTitle') + '</h3><p>' + t('scanSub') + '</p>' +
      '<label class="fld"><span>' + t('rosterName') + '</span><input class="txt" id="rnIn" maxlength="30" placeholder="' + t('namePh') + '" autocapitalize="words" value="' + esc(state.settings.rosterName || '') + '"></label>' +
      '<div class="fine" style="margin:-4px 0 14px">' + t('nameFuzzy') + '</div>' +
      '<div class="btn-row"><button class="btn ghost" id="rnNo">' + t('cancel') + '</button><button class="btn" id="rnOk">' + ic('scan') + t('pickImages') + '</button></div>');
    $('rnNo').onclick = closeSheet;
    $('rnOk').onclick = function () {
      var v = titleName($('rnIn').value);
      if (!v) { $('rnIn').focus(); return; }
      if (v !== state.settings.rosterName) { state.settings.rosterName = v; save(); renderSettings(); }
      closeSheet();
      var inp = $('rosterFile'); inp.value = ''; inp.click();
    };
  }

  // Langkah 2: baca semua gambar ikut susunan nama fail (WhatsApp: IMG-tarikh-WA00xx)
  function rosterFiles(files) {
    var list = [].slice.call(files || []);
    if (!list.length) return;
    list.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : (a.lastModified || 0) - (b.lastModified || 0); });
    var run = ++rosterRun, items = [];
    batch = { items: items, name: state.settings.rosterName };
    openSheet('<h3>' + t('rosterTitle') + '</h3><div class="r-stat" id="rCount"></div>' +
      '<div class="prog"><i id="rProg"></i></div><div class="r-stat" id="rStat">' + t('loadingOcr') + '</div>',
      function () { if (rosterRun === run) { rosterRun++; batch = null; } });
    var next = 0, doneN = 0, PAR = 2, results = [];
    function paint() {
      if (!$('rCount')) return;
      $('rCount').textContent = t('imgOf', Math.min(doneN + 1, list.length), list.length);
      $('rProg').style.width = Math.round(Math.max(4, doneN / list.length * 100)) + '%';
      $('rStat').textContent = doneN ? t('reading', Math.round(doneN / list.length * 100)) : t('loadingOcr');
    }
    function finish(k, res) {
      if (rosterRun !== run) return;
      results[k] = { res: res, slots: (res.slots && res.slots.length ? res.slots.slice() : emptySlots()), date: res.date || '', ok: !!res.found, file: list[k].name };
      doneN++; paint();
      if (doneN === list.length) {
        results.forEach(function (x) { items.push(x); });
        fillDates(items); rosterSummary();
      } else launch();
    }
    function launch() {
      if (rosterRun !== run || next >= list.length) return;
      var k = next++;
      if (!window.GajiRoster || !window.Tesseract) { finish(k, { ok: false, reason: 'noTable', slots: [] }); return; }
      window.GajiRoster.scan(list[k], batch.name, function () {}).then(function (res) { finish(k, res); },
        function () { finish(k, { ok: false, reason: 'noTable', slots: [] }); });
    }
    paint();
    for (var p = 0; p < PAR; p++) launch();
  }

  // Tarikh: hanya yang tertulis dalam gambar (Date :05.10.2026). Tiada tarikh = kosong — user letak sendiri
  // (boleh simpan dulu, letak tarikh kemudian dalam Jadual). App tak teka / susun sendiri.
  function fillDates(items) { items.forEach(function (it) { it.date = it.res.date || it.date || ''; }); }
  // Petak tarikh: '?' kalau tiada tarikh
  function dateTile(iso) {
    if (!iso) return '<div class="r-date nodate"><b>?</b><span>' + t('noDateShort') + '</span></div>';
    var d = parseISO(iso);
    return '<div class="r-date"><b>' + d.getDate() + '</b><span>' + MON()[d.getMonth()] + '</span></div>';
  }

  function itemEntry(it) {
    var sh = window.GajiRoster.shiftFromSlots(it.slots);
    return sh ? { type: 'time', in: sh.in, out: sh.out, brk: sh.brk } : { type: 'off' };
  }

  // Langkah 3: senarai ringkas semua hari -> Simpan semua
  function rosterSummary() {
    if (!batch) return;
    var items = batch.items, okN = 0;
    var rows = items.map(function (it, k) {
      var right, sub;
      if (!it.ok) {
        sub = '<span style="color:var(--amber);font-weight:700">' + (it.res.reason === 'noName' ? t('tapToPick') : t('tapToMark')) + '</span>';
        right = '<b>?</b>';
      } else {
        okN++;
        var e = itemEntry(it), c = C.calcEntry(e, state.settings);
        sub = e.type === 'off' ? t('dayOff') : fmt12(e.in, true) + ' &ndash; ' + fmt12(e.out, true) + (e.brk === 'std' ? ' &middot; ' + t('breakMin', state.settings.stdBreak) : '');
        right = e.type === 'off' ? '<b>0</b>' : '<b>' + fmtH(c.minutes) + t('h') + '</b>';
      }
      var dayName = it.date ? DAYS()[parseISO(it.date).getDay()] : '<span style="color:var(--amber)">' + t('noDate') + '</span>';
      return '<button class="r' + (it.ok ? '' : ' warnrow') + '" data-k="' + k + '">' + dateTile(it.date) +
        '<div class="r-mid"><b>' + dayName + '</b><span>' + sub + '</span></div>' +
        '<div class="r-right">' + right + '</div></button>';
    }).join('');
    var tot = 0;
    items.forEach(function (it) { if (it.ok) { var c = C.calcEntry(itemEntry(it), state.settings); if (c.ok) tot += c.minutes; } });
    openSheet('<div id="bWrap"><h3>' + t('batchTitle', items.length) + '</h3>' +
      '<div class="r-msg ' + (okN === items.length ? 'ok' : 'warn') + '">' + (okN === items.length ? ic('check') + t('batchAllOk', esc(batch.name)) : t('batchSome', okN, items.length)) + '</div>' +
      (items.some(function (it) { return !it.date; }) ? '<div class="r-msg warn">' + t('undatedNote', items.filter(function (it) { return !it.date; }).length) + '</div>' : '') +
      '<div class="rows" style="margin-bottom:12px">' + rows + '</div>' +
      '<div class="preview">' + t('batchTotal') + ' <span style="margin-left:auto">' + fmtH(tot) + ' ' + t('h') + '</span></div>' +
      '<div class="btn-row"><button class="btn ghost" id="bNo">' + t('cancel') + '</button>' +
      '<button class="btn" id="bSave"' + (okN ? '' : ' disabled') + '>' + t('saveAll', okN) + '</button></div></div>',
      function () { rosterRun++; });
    var run = rosterRun;
    $('bWrap').addEventListener('click', function (ev) {
      var r = ev.target.closest('[data-k]'); if (!r) return;
      editItem(+r.getAttribute('data-k'), run);
    });
    $('bNo').onclick = function () { batch = null; closeSheet(); };
    $('bSave').onclick = function () {
      var n = 0;
      snapshot();
      items.forEach(function (it) {
        if (!it.ok) return;
        var e = itemEntry(it);
        e.id = uid(); e.date = it.date; e.src = 'roster'; e.pid = period().id;
        // Jadual baru untuk tarikh sama ganti yang lama (tiada tarikh = tambah sahaja)
        if (it.date) state.plan = state.plan.filter(function (x) { return x.date !== it.date; });
        state.plan.push(e); n++;
      });
      batch = null;
      save(); closeSheet(); renderAll(); setTab('plan'); toast(t('batchSaved', n), undo);
    };
  }

  // Betulkan satu hari: pilih nama (kalau tak jumpa) / tanda jam / tukar tarikh
  function editItem(k, run) {
    var it = batch && batch.items[k]; if (!it) return;
    if (!it.ok && it.res.reason === 'noName' && it.res.rows && it.res.rows.length && !it.manual) {
      rosterPick(it.res, function (r2) {
        if (r2) { it.res = r2; it.slots = r2.slots.slice(); it.ok = true; it.picked = true; }
        else it.manual = true;
        editItem(k, run);
      });
      return;
    }
    rosterReview(it, function () { rosterSummary(); });
  }

  // Nama tak dapat dibaca: user tekan nama sendiri (gambar petak nama dari jadual)
  function rosterPick(res, cb) {
    openSheet('<div id="pkWrap"><h3>' + t('pickTitle') + '</h3><p>' + t('pickSub', esc(batch ? batch.name : state.settings.rosterName)) + '</p>' +
      '<div class="pick">' + res.rows.map(function (r) {
        return '<button class="pk" data-r="' + r.i + '" data-t="' + esc(r.text) + '"><img src="' + r.img + '" alt=""></button>';
      }).join('') + '</div>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn ghost" id="pkBack">' + t('back') + '</button><button class="btn ghost" id="pkManual">' + t('pickManual') + '</button></div></div>',
      function () { rosterRun++; });
    $('pkWrap').addEventListener('click', function (ev) {
      var b = ev.target.closest('.pk'); if (!b) return;
      window.GajiRoster.readRowAt(+b.getAttribute('data-r'), b.getAttribute('data-t'), res.ctx).then(cb);
    });
    $('pkManual').onclick = function () { cb(null); };
    $('pkBack').onclick = function () { rosterSummary(); };
  }

  function hrLabel(i) { var h = window.GajiRoster.slotHour(i); return ((h % 12) || 12) + (h < 12 ? 'A' : 'P'); }
  // Semak / betulkan satu hari (kotak jam 7AM..6AM)
  function rosterReview(it, back) {
    var slots = it.slots, res = it.res;
    var msg = it.picked ? '<div class="r-msg ok">' + ic('check') + t('pickedRow') + '</div>'
      : it.ok ? '<div class="r-msg ok">' + ic('check') + t('found', esc(res.nameText || '')) + '</div>'
      : '<div class="r-msg warn">' + (res.reason === 'noName' ? t('notFound', esc(batch ? batch.name : '')) : t('noTable')) + '</div>';
    function strip(from) {
      var h = '';
      for (var k = from; k < from + 12; k++) h += '<button class="hr" data-i="' + k + '"><em>' + hrLabel(k) + '</em><b></b></button>';
      return '<div class="strip">' + h + '</div>';
    }
    openSheet('<div id="rWrap"><h3>' + t('rosterTitle') + '</h3>' + msg +
      (res.crop ? '<img class="r-crop" src="' + res.crop + '" alt="">' : '') +
      '<label class="fld"><span>' + t('date') + '</span><input type="date" id="rDate" value="' + it.date + '"></label>' +
      '<div class="fine" style="margin:0 0 4px">' + t('tapHint') + '</div>' +
      '<div class="strip-lbl">' + t('dayHalf1') + '</div>' + strip(0) + '<div class="strip-lbl">' + t('dayHalf2') + '</div>' + strip(12) +
      '<div class="preview" id="rSum" style="margin-top:12px"></div>' +
      '<div class="btn-row"><button class="btn" id="rOk">OK</button></div></div>',
      function () { rosterRun++; });
    function paint() {
      [].forEach.call($('rWrap').querySelectorAll('.hr'), function (b) {
        var v = slots[+b.getAttribute('data-i')];
        b.className = 'hr' + (v === 'X' ? ' x' : v === 'B' ? ' b' : '');
        b.querySelector('b').textContent = v || '·';
      });
      var sh = window.GajiRoster.shiftFromSlots(slots), sum = $('rSum');
      if (!sh) { sum.innerHTML = t('rosterOff'); return; }
      var c = C.calcEntry({ type: 'time', in: sh.in, out: sh.out, brk: sh.brk }, state.settings);
      sum.innerHTML = fmt12(sh.in, true) + ' &ndash; ' + fmt12(sh.out, true) + ' <small>&middot; ' +
        (sh.brk === 'std' ? t('breakMin', state.settings.stdBreak) : t('noBreak')) +
        ' &middot; ' + fmtH(c.minutes) + ' ' + t('h') + '</small>';
    }
    $('rWrap').addEventListener('click', function (ev) {
      var b = ev.target.closest('.hr'); if (!b) return;
      var k = +b.getAttribute('data-i');
      slots[k] = slots[k] === '' ? 'X' : slots[k] === 'X' ? 'B' : '';
      it.ok = true; // user dah tanda sendiri = sah
      paint();
    });
    paint();
    $('rOk').onclick = function () {
      if ($('rDate').value) it.date = $('rDate').value;
      it.ok = true;
      back();
    };
  }

  // ---------- Tab Jadual (rancangan kerja: jam sahaja, tak masuk gaji) ----------
  // v2.1: setiap jadual milik satu tempoh gaji (pid). Tempoh baru = jadual kosong; jadual lama dilihat ikut tempoh.
  function planSorted(pid) {
    return state.plan.filter(function (x) { return !pid || x.pid === pid; }).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (C.toMin(a.in) || 0) - (C.toMin(b.in) || 0);
    });
  }
  // Julat masa sebenar [mula, tamat] (ms) untuk syif / jadual
  function spanOf(x) {
    var s = x.inTs || at(x.date, x.in).getTime();
    var e = x.outTs || at(x.date, x.out, new Date(s)).getTime();
    return [s, e];
  }
  // Semua syif yang dah selesai (punch masuk + balik), dari semua tempoh
  function doneShifts() {
    var out = [];
    state.periods.forEach(function (p) {
      p.entries.forEach(function (x) {
        if (x.type !== 'time' || !x.out || C.toMin(x.in) === null || C.toMin(x.out) === null) return;
        out.push({ e: x, span: spanOf(x), c: C.calcEntry(x, state.settings) });
      });
    });
    return out;
  }
  /*
   * Padankan jadual dengan syif sebenar: masa bertindih (syif malam lepas 12AM pun padan), kalau tiada, tarikh sama.
   * Pulang { st: 'done'|'absent'|'live'|'', act, diff } — diff = minit kerja sebenar tolak jadual.
   */
  function planStatus(e, done, now) {
    if (!e.date || e.type !== 'time' || C.toMin(e.in) === null || C.toMin(e.out) === null) return { st: '' };
    var ps = spanOf(e), best = null;
    // 1) syif yang dilekat pada jadual ni; 2) syif lain yang bertindih dengan waktu jadual (masuk seawal mana pun)
    done.forEach(function (d) { if (!best && d.e.sched && d.e.sched.id === e.id) best = d; });
    if (!best) done.forEach(function (d) {
      if (!best && (!d.e.sched || d.e.sched.id === e.id) && Math.min(ps[1], d.span[1]) - Math.max(ps[0], d.span[0]) > 0) best = d;
    });
    if (best) {
      var pc = C.calcEntry(e, state.settings);
      return { st: best.span[1] >= ps[1] - 60000 ? 'done' : 'early', act: best.e,
        diff: Math.round(best.c.minutes - pc.minutes), ot: best.c.otMinutes || 0 };
    }
    var o = openShift();
    if (o) {
      var os = (o.e.inTs || at(o.e.date, o.e.in).getTime());
      // Tengah kerja dalam waktu jadual (masuk lebih awal pun kira)
      if (((o.e.sched && o.e.sched.id === e.id) || os < ps[1]) && now >= ps[0] && now < ps[1] + 6 * 3600000) return { st: 'live' };
    }
    return { st: ps[1] < now ? 'absent' : '' };
  }
  function otLabel(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return h ? h + t('h') + (m ? ' ' + m + 'm' : '') : m + ' min'; }
  function diffLabel(min) {
    var a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
    return (min > 0 ? '+' : '\u2212') + (h ? h + t('h') + (m ? ' ' + m + 'm' : '') : m + ' min');
  }
  function planRow(e, today, done, now) {
    var c = C.calcEntry(e, state.settings), ps = planStatus(e, done, now);
    var main = e.type === 'off' ? 'OFF' : fmt12(e.in, true) + ' &ndash; ' + fmt12(e.out, true);
    var sub = e.type === 'off' ? t('dayOff') : e.brk === 'std' ? t('breakMin', state.settings.stdBreak) : t('noBreak');
    if (ps.st === 'done' || ps.st === 'early') sub = t('actualL', fmt12(ps.act.in, true) + ' &ndash; ' + fmt12(ps.act.out, true));
    var less = (ps.st === 'done' || ps.st === 'early') && ps.diff <= -5;
    var tags = (ps.st === 'done' ? '<span class="tag settled">' + ic('check') + t('doneTag') + '</span>' : '') +
      (ps.st === 'early' ? '<span class="tag adj">' + t('earlyTag') + '</span>' : '') +
      (less ? '<span class="tag adj less">' + diffLabel(ps.diff) + '</span>' : '') +
      (ps.ot ? '<span class="tag ot">+' + otLabel(ps.ot) + ' OT</span>' : '') +
      (ps.st === 'absent' ? '<span class="tag absent">' + ic('x') + t('absentTag') + '</span>' : '') +
      (ps.st === 'live' ? '<span class="tag live">LIVE</span>' : '') +
      (e.date === today && !ps.st ? '<span class="tag live">' + t('todayTag') + '</span>' : '') +
      (c.midnight && ps.st !== 'done' ? '<span class="tag mid">MIDNIGHT</span>' : '') + (e.type === 'off' ? '<span class="tag off">OFF</span>' : '');
    var cls = ps.st === 'done' ? ' settled' : ps.st === 'early' ? ' early' : ps.st === 'absent' ? ' absent' : '';
    if (!e.date) { cls = ' undated'; tags = '<span class="tag adj">' + t('noDateShort') + '</span>' + tags; }
    var dayTxt = e.date ? DAYS()[parseISO(e.date).getDay()] : t('tapSetDate');
    return '<button class="r' + (e.type === 'off' ? ' off' : '') + (e.date === today ? ' today' : '') + (e.date && e.date < today && !cls ? ' past' : '') + cls + '" data-plan="' + e.id + '">' +
      dateTile(e.date) +
      '<div class="r-mid"><b>' + main + '</b><span>' + dayTxt + ' &middot; ' + sub + '</span></div>' +
      '<div class="r-right"><b>' + (e.type === 'off' ? '0' : fmtH(c.minutes) + t('h')) + '</b>' + tags + '</div></button>';
  }
  function renderPlan() {
    var today = todayISO(), now = Date.now(), view = period(), list = planSorted(view.id), done = doneShifts(), old = view !== currentPeriod();
    var undated = list.filter(function (e) { return !e.date; });
    var next = list.filter(function (e) { return e.date && e.date >= today; }), past = list.filter(function (e) { return e.date && e.date < today; });
    var n = 0, min = 0, nDone = 0, nAbs = 0;
    list.forEach(function (e) {
      var st = planStatus(e, done, now).st;
      if (st === 'done' || st === 'early') nDone++; else if (st === 'absent') nAbs++;
    });
    next.forEach(function (e) { if (e.type !== 'time') return; var c = C.calcEntry(e, state.settings); n++; min += c.minutes; });
    var html = '<div class="list-head"><div><h2>' + t('planTitle') + '</h2><span>' + t('planSub', n) + '</span></div>' +
      '<div class="head-btns"><button class="btn-scan" id="scanBtn">' + ic('scan') + t('scan') + '</button>' +
      '<button class="btn-add" id="planAdd">' + ic('plus') + t('add') + '</button></div></div>';
    if (old) html += '<div class="r-msg warn" style="margin:0 0 12px">' + t('planOldPeriod', esc(view.name)) + '</div>';
    html += '<div class="sum3"><div><b>' + fmtH(min) + '</b><span>' + t('plannedHours') + '</span></div>' +
      '<div><b style="color:var(--green)">' + nDone + '</b><span>' + t('doneCount') + '</span></div>' +
      '<div><b style="color:var(--minus)">' + nAbs + '</b><span>' + t('absentCount') + '</span></div></div>';
    if (!list.length) html += '<div class="rows"><div class="empty">' + ic('cal') + '<br>' + t('planEmpty') + '</div></div>';
    else {
      if (undated.length) html += '<div class="strip-lbl" style="margin:0 4px 8px;color:var(--amber)">' + t('noDateSec') + '</div><div class="rows" style="margin-bottom:12px">' +
        undated.map(function (e) { return planRow(e, today, done, now); }).join('') + '</div>';
      if (next.length) html += '<div class="rows">' + next.map(function (e) { return planRow(e, today, done, now); }).join('') + '</div>';
      if (past.length) html += '<div class="strip-lbl" style="margin:16px 4px 8px">' + t('planPast') + '</div><div class="rows">' +
        past.reverse().map(function (e) { return planRow(e, today, done, now); }).join('') + '</div>';
    }
    $('v-plan').innerHTML = html;
  }
  // Syif seterusnya dalam jadual (untuk Utama)
  function nextPlan(now) {
    var today = todayISO(), nowMin = now.getHours() * 60 + now.getMinutes(), best = null;
    planSorted().forEach(function (e) {
      if (best || !e.date || e.type !== 'time' || e.date < today) return;
      if (e.date === today && C.toMin(e.in) <= nowMin) return;
      best = e;
    });
    return best;
  }

  function openPlanEditor(entry) {
    var isNew = !entry, d = entry ? clone(entry) : { date: todayISO(), type: 'time', in: '', out: '', brk: 'std' };
    var ps = isNew ? { st: '' } : planStatus(d, doneShifts(), Date.now()), stMsg = '';
    if (ps.st === 'done' || ps.st === 'early') stMsg = '<div class="r-msg ' + (ps.st === 'done' ? 'ok' : 'warn') + '">' + ic(ps.st === 'done' ? 'check' : 'clock') +
      t(ps.st === 'done' ? 'settledMsg' : 'earlyMsg', fmt12(ps.act.in, true) + ' &ndash; ' + fmt12(ps.act.out, true)) +
      (ps.diff <= -5 ? ' (' + diffLabel(ps.diff) + ')' : '') + '</div>' +
      (ps.ot ? '<div class="r-msg warn ot-msg">' + t('otLine') + ': +' + otLabel(ps.ot) + ' &middot; RM' + fmtRM(otPaySen(ps.ot)) + ' &mdash; ' + t('otUnsure') + '</div>' : '');
    else if (ps.st === 'absent') stMsg = '<div class="r-msg warn" style="color:var(--minus);background:var(--red-soft)">' + ic('x') + t('absentMsg') + '</div>';
    openSheet('<div id="plWrap"><h3>' + (isNew ? t('addPlan') : t('editPlan')) + '</h3>' + stMsg +
      '<label class="fld"><span>' + t('date') + '</span><input type="date" id="pDate" value="' + d.date + '"></label>' +
      segHTML('pType', [['time', t('segWork')], ['off', t('segOff')]], d.type === 'off' ? 'off' : 'time') +
      '<div id="pTimeBox"><div class="row2">' +
      '<label class="fld"><span>' + t('clockInL') + '</span><input type="time" id="pIn" value="' + (d.in || '') + '"></label>' +
      '<label class="fld"><span>' + t('clockOutL') + '</span><input type="time" id="pOut" value="' + (d.out || '') + '"></label></div>' +
      '<div class="fld-label">' + t('brk') + '</div>' +
      segHTML('pBrk', [['none', t('brkNone')], ['std', state.settings.stdBreak + ' min']], d.brk === 'std' ? 'std' : 'none') + '</div>' +
      '<div class="preview" id="pPrev"></div>' +
      '<div class="btn-row">' + (isNew ? '<button class="btn ghost" id="pCancel">' + t('cancel') + '</button>' : '<button class="btn danger" id="pDel">' + t('del') + '</button>') +
      '<button class="btn" id="pSave">' + t('save') + '</button></div></div>');
    function read() {
      var e = { id: d.id, date: $('pDate').value, type: segVal('pType'), src: d.src || 'manual', pid: d.pid || period().id };
      if (e.type === 'time') { e.in = $('pIn').value; e.out = $('pOut').value; e.brk = segVal('pBrk'); }
      return e;
    }
    function validate(e) {
      if (e.type === 'time') {
        if (!e.in) return t('vIn');
        if (!e.out) return t('vOut');
        var c = C.calcEntry(e, state.settings);
        if (!c.ok) return errText(c.error);
      }
      return '';
    }
    function refresh() {
      $('pTimeBox').style.display = segVal('pType') === 'time' ? '' : 'none';
      var e = read(), err = validate(e), pv = $('pPrev');
      pv.className = 'preview' + (err ? ' err' : '');
      if (err) { pv.textContent = err; return; }
      if (e.type === 'off') { pv.innerHTML = t('pvOff'); return; }
      var c = C.calcEntry(e, state.settings);
      pv.innerHTML = t('pvHours', fmtH(c.minutes)) + (c.midnight ? ' <span class="tag mid" style="margin:0">MIDNIGHT</span>' : '');
    }
    bindSeg('pType', refresh); bindSeg('pBrk', refresh);
    $('plWrap').addEventListener('input', refresh);
    $('plWrap').addEventListener('change', refresh);
    refresh();
    if ($('pCancel')) $('pCancel').onclick = closeSheet;
    if ($('pDel')) $('pDel').onclick = function () {
      snapshot();
      state.plan = state.plan.filter(function (x) { return x.id !== d.id; });
      save(); closeSheet(); renderAll(); toast(t('shiftDeleted'), undo);
    };
    $('pSave').onclick = function () {
      var e = read(), err = validate(e);
      if (err) { toast(err); return; }
      snapshot();
      if (isNew) { e.id = uid(); state.plan.push(e); }
      else state.plan = state.plan.map(function (x) { return x.id === d.id ? e : x; });
      save(); closeSheet(); renderAll(); toast(isNew ? t('shiftAdded') : t('saved'), undo);
    };
  }

  // ---------- Sheet ----------
  function openSheet(html, onClose) {
    clearTimeout(toastTimer); $('toast').classList.remove('on');
    $('sheet').innerHTML = '<div class="grab"></div>' + html;
    $('sheet').scrollTop = 0;
    $('scrim').classList.add('on'); $('sheet').classList.add('on');
    sheetClose = onClose || function () {};
  }
  function closeSheet() {
    if (!sheetClose) return false;
    var f = sheetClose; sheetClose = null; f();
    $('scrim').classList.remove('on'); $('sheet').classList.remove('on');
    if (document.activeElement) document.activeElement.blur();
    return true;
  }
  function confirmSheet(title, body, okLabel, danger, onOk) {
    openSheet('<h3>' + title + '</h3><p>' + body + '</p><div class="btn-row"><button class="btn ghost" id="cNo">' + t('cancel') + '</button><button class="btn' + (danger ? '' : ' go') + '" id="cYes">' + okLabel + '</button></div>');
    $('cNo').onclick = closeSheet;
    $('cYes').onclick = function () { closeSheet(); onOk(); };
  }

  function segHTML(id, opts, val) {
    return '<div class="seg" id="' + id + '">' + opts.map(function (o) { return '<button data-v="' + o[0] + '"' + (o[0] === val ? ' class="on"' : '') + '>' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function segVal(id) { var b = $(id).querySelector('.on'); return b ? b.getAttribute('data-v') : null; }
  function bindSeg(id, onChange) {
    $(id).addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      [].forEach.call($(id).children, function (x) { x.classList.toggle('on', x === b); });
      onChange();
    });
  }

  // Syif selesai dikunci: tunjuk butiran sahaja (tiada ubah / padam)
  function openShiftView(e) {
    var c = C.calcEntry(e, state.settings), d = parseISO(e.date), st = state.settings;
    function row(label, val) { return '<div class="li"><div><b>' + label + '</b></div><span>' + val + '</span></div>'; }
    var time = e.type === 'off' ? 'OFF' : e.type === 'manual' ? t('timeNotRec') : fmt12(e.in, true) + ' &ndash; ' + (e.out ? fmt12(e.out, true) : '...');
    var brk = '';
    if (e.type === 'time' && c.breakMin) {
      var ba = Math.round(c.breakActual != null ? c.breakActual : c.breakMin), bm = Math.round(c.breakMin);
      brk = ba < bm ? t('brkDeducted', bm, ba) : bm + ' min';
    }
    var src = e.inTs ? t('srcPunch') : e.src === 'plan' ? t('srcPlan') : t('srcOld');
    openSheet('<h3>' + t('shiftDetail') + '</h3><div class="slip">' +
      row(t('date'), DAYS()[d.getDay()] + ', ' + shortDate(e.date)) +
      row(t('timeL'), time) +
      (brk ? row(t('brk'), brk) : '') +
      (e.type !== 'off' && c.ok && !c.open ? row(t('hoursWorkedL'), fmtH(c.minutes) + ' ' + t('h')) : '') +
      (c.midnight ? row(t('midAllow'), '+RM' + fmtRM(Math.round(Number(st.midnight) * 100))) : '') +
      (e.type !== 'off' && c.ok && !c.open ? row(t('dayPayL'), 'RM' + fmtRM(dayPay(c))) : '') +
      (e.sched ? row(t('schedL'), fmt12(e.sched.in, true) + ' &ndash; ' + fmt12(e.sched.out, true)) : '') +
      (c.otMinutes ? '<div class="li ot-li"><div><b>' + t('otLine') + '</b><span>' + t('otUnsure') + '</span></div><span>+' + otLabel(c.otMinutes) + ' &middot; RM' + fmtRM(otPaySen(c.otMinutes)) + '</span></div>' : '') +
      row(t('sourceL'), src) + '</div>' +
      '<div class="lock-note" style="margin-top:12px">' + ic('lock') + '<span>' + t('lockedNote') + '</span></div>' +
      '<div class="btn-row"><button class="btn danger" id="svDel">' + t('del') + '</button><button class="btn ghost" id="svOk">OK</button></div>');
    $('svOk').onclick = closeSheet;
    $('svDel').onclick = function () {
      closeSheet();
      confirmSheet(t('delShiftT'), t('delShiftB', shortDate(e.date)), t('DELETE'), true, function () {
        snapshot();
        state.periods.forEach(function (p) { p.entries = p.entries.filter(function (x) { return x.id !== e.id; }); });
        save(); renderAll(); toast(t('shiftDeleted'), undo);
      });
    };
  }

  function viewPeriod(id) { state.activeId = id; save(); renderAll(); $('main').scrollTop = 0; }
  function openPeriods() {
    var html = '<h3>' + t('periods') + '</h3>' + state.periods.slice().reverse().map(function (p) {
      var s = C.summarize(p.entries, state.settings);
      return '<button class="opt' + (p.id === period().id ? ' on' : '') + '" data-pid="' + p.id + '"><span class="radio"></span><div><b>' + esc(p.name) + '</b>' +
        '<span>' + t('periodStat', s.workDays, fmtH(s.totalMin), fmtRM(s.net)) + '</span></div></button>';
    }).join('') + '<button class="btn ghost" id="pNew" style="width:100%;margin-top:4px">' + t('newPeriod') + '</button>';
    openSheet(html);
    [].forEach.call($('sheet').querySelectorAll('[data-pid]'), function (b) {
      b.onclick = function () { closeSheet(); viewPeriod(b.getAttribute('data-pid')); };
    });
    $('pNew').onclick = function () { closeSheet(); newPeriod(); };
  }
  function newPeriod() {
    openSheet('<h3>' + t('newPeriodT') + '</h3><p>' + t('newPeriodB') + '</p>' +
      '<label class="fld"><span>' + t('name') + '</span><input class="txt" id="npName" maxlength="40" value="' + esc(defaultPeriodName()) + '"></label>' +
      '<div class="btn-row"><button class="btn ghost" id="npNo">' + t('cancel') + '</button><button class="btn" id="npYes">' + t('create') + '</button></div>');
    $('npNo').onclick = closeSheet;
    $('npYes').onclick = function () {
      var name = $('npName').value.trim() || defaultPeriodName();
      var p = { id: uid(), name: name, entries: [] }, today = todayISO();
      state.plan.forEach(function (x) { if (x.date >= today) x.pid = p.id; });
      state.periods.push(p); state.activeId = p.id; save(); closeSheet(); renderAll(); toast(t('periodCreated'));
    };
  }

  // ---------- Toast ----------
  function toast(msg, action) {
    $('toastMsg').textContent = msg;
    var b = $('toastBtn');
    b.style.display = action ? '' : 'none'; b.textContent = t('undo');
    b.onclick = function () { $('toast').classList.remove('on'); action(); };
    $('toast').classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $('toast').classList.remove('on'); }, action ? 6000 : 2500);
  }

  // ---------- Tab ----------
  function setTab(k) {
    tab = k;
    [].forEach.call(document.querySelectorAll('nav button'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === k); });
    ['home', 'plan', 'list', 'set'].forEach(function (x) { $('v-' + x).classList.toggle('on', x === k); });
    $('main').scrollTop = 0;
  }

  // Butang Back Android: tutup sheet / balik ke Home. Pulang true kalau dah diurus.
  window.appBack = function () {
    if (!state.settings.lang) return false;
    if (closeSheet()) return true;
    if (tab !== 'home') { setTab('home'); return true; }
    return false;
  };

  // ---------- iPhone: buka dalam Safari (bukan dari skrin utama) -> tunjuk cara pasang dulu ----------
  // Data Safari & data app skrin utama ASING dalam iOS, jadi pasang dulu sebelum mula guna.
  function needInstall() {
    // ?ios=1 = uji skrin ni dalam browser lain
    var nav = window.navigator, ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1) || /[?&]ios=1/.test(location.search);
    var standalone = nav.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    var skipped = false;
    try { skipped = sessionStorage.getItem('tjSkipInstall') === '1'; } catch (e) { /* tiada storage */ }
    return ios && !standalone && !window.AndroidUI && !skipped;
  }
  function showInstallGate(next) {
    var g = $('langGate');
    function step(n, icon, title, sub) {
      return '<div class="inst-step"><span class="num">' + n + '</span><div>' + title + '<span>' + sub + '</span></div>' + ic(icon) + '</div>';
    }
    g.innerHTML = '<div class="gate-in"><div class="mark">TJ</div>' +
      '<div class="gate-brand">Texas<br>Jerantut</div>' +
      '<div class="gate-tag">Install the app first &middot; Pasang app dulu</div>' +
      '<div class="gate-q">iPhone &middot; 3 steps / langkah</div>' +
      step(1, 'share', 'Tap Share &middot; Tekan Kongsi', 'Bottom bar in Safari &middot; Bar bawah Safari') +
      step(2, 'addsq', 'Add to Home Screen', 'Tambah ke Skrin Utama') +
      step(3, 'chev', 'Open from the TJ icon', 'Buka dari ikon TJ di skrin utama') +
      '<div class="gate-note">Your pay data is saved in the home-screen app, not in Safari.<br>Data gaji disimpan dalam app skrin utama, bukan dalam Safari.</div>' +
      '<button class="inst-skip" id="instSkip">Continue in Safari &middot; Teruskan dalam Safari</button></div>';
    g.classList.add('on');
    g.onclick = null;
    $('instSkip').onclick = function () {
      try { sessionStorage.setItem('tjSkipInstall', '1'); } catch (e) { /* tiada storage */ }
      g.classList.remove('on');
      next();
    };
  }

  // ---------- Skrin pilih bahasa (kali pertama buka app) ----------
  function showLangGate() {
    var g = $('langGate');
    g.innerHTML = '<div class="gate-in"><div class="mark">TJ</div>' +
      '<div class="gate-brand">Texas<br>Jerantut</div>' +
      '<div class="gate-tag">Pay & time clock &middot; Gaji & punch kad</div>' +
      '<div class="gate-q">Choose language &middot; Pilih bahasa</div>' +
      '<button class="gate-btn" data-gl="en"><span class="code">EN</span><div><b>English</b><span>Continue in English</span></div>' + ic('chev') + '</button>' +
      '<button class="gate-btn" data-gl="ms"><span class="code">BM</span><div><b>Bahasa Melayu</b><span>Teruskan dalam Bahasa Melayu</span></div>' + ic('chev') + '</button>' +
      '<div class="gate-note">You can change this later in Settings &middot; Boleh tukar dalam Tetapan</div></div>';
    g.classList.add('on');
    g.onclick = function (ev) {
      var b = ev.target.closest('[data-gl]'); if (!b) return;
      state.settings.lang = b.getAttribute('data-gl');
      ensurePeriod(); localizeNames(); save(); renderAll();
      g.classList.remove('on');
    };
  }
  function setLang(lang) {
    state.settings.lang = lang; localizeNames(); save(); renderAll();
  }
  // Nama tempoh yang app jana sendiri (bukan yang user taip) ikut bahasa semasa
  function localizeNames() {
    var li = state.settings.lang === 'ms' ? 1 : 0;
    state.periods.forEach(function (p) {
      SEED.NAME_PAIRS.forEach(function (pair) { if (pair.indexOf(p.name) >= 0) p.name = pair[li]; });
      var m = /^(Pay|Gaji) (\w{3}) (\d{4})$/.exec(p.name);
      if (!m) return;
      var idx = I18N.L.en.MON.indexOf(m[2]);
      if (idx < 0) idx = I18N.L.ms.MON.indexOf(m[2]);
      if (idx >= 0) p.name = t('defaultPeriod', MON()[idx], m[3]);
    });
  }

  // ---------- Event ----------
  function bind() {
    document.querySelector('nav').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (b) setTab(b.getAttribute('data-tab'));
    });
    $('scrim').onclick = closeSheet;
    $('rosterFile').addEventListener('change', function () { rosterFiles(this.files); });
    $('periodChip').onclick = openPeriods;
    $('v-home').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-punch]'); if (b) { punch(b.getAttribute('data-punch')); return; }
      var h = ev.target.closest('[data-pid]'); if (h) { viewPeriod(h.getAttribute('data-pid')); return; }
      if (ev.target.closest('#toCurrent')) viewPeriod(currentPeriod().id);
    });
    $('v-plan').addEventListener('click', function (ev) {
      if (ev.target.closest('#scanBtn')) { startRoster(); return; }
      if (ev.target.closest('#planAdd')) { openPlanEditor(null); return; }
      var r = ev.target.closest('[data-plan]'); if (!r) return;
      var id = r.getAttribute('data-plan'), e = state.plan.filter(function (x) { return x.id === id; })[0];
      if (e) openPlanEditor(e);
    });
    $('v-list').addEventListener('click', function (ev) {
      var r = ev.target.closest('[data-edit]'); if (!r) return;
      var id = r.getAttribute('data-edit'), e = period().entries.filter(function (x) { return x.id === id; })[0];
      if (e) openShiftView(e);
    });
    var vs = $('v-set');
    vs.addEventListener('change', function (ev) {
      var el = ev.target, key = el.getAttribute('data-set');
      if (el.id === 'rosterNameIn') { state.settings.rosterName = el.value = titleName(el.value); save(); toast(t('settingsSaved')); return; }
      if (el.id === 'periodRename') {
        period().name = el.value.trim() || period().name; save(); renderStatic(); return;
      }
      if (!key) return;
      if (el.type === 'checkbox') state.settings[key] = el.checked;
      else {
        var n = num(el.value);
        if (n === null || n < 0) { el.value = state.settings[key]; toast(t('invalidNum')); return; }
        state.settings[key] = n;
      }
      save(); renderHome(); renderList(); toast(t('settingsSaved'));
    });
    vs.addEventListener('click', function (ev) {
      var lb = ev.target.closest('[data-lang]');
      if (lb) { setLang(lb.getAttribute('data-lang')); return; }
      var tb = ev.target.closest('[data-theme-set]');
      if (tb) { state.settings.theme = tb.getAttribute('data-theme-set'); save(); renderAll(); return; }
      var id = ev.target.id;
      if (id === 'newPeriod') newPeriod();
      else if (id === 'delPeriod') {
        var p = period();
        confirmSheet(t('delPeriodT'), t('delPeriodB', esc(p.name), p.entries.length), t('DELETE'), true, function () {
          state.periods = state.periods.filter(function (x) { return x.id !== p.id; });
          state.plan = state.plan.filter(function (x) { return x.pid !== p.id; });
          if (state.open && state.open.pid === p.id) state.open = null;
          ensurePeriod();
          state.activeId = currentPeriod().id;
          save(); renderAll(); toast(t('periodDeleted'));
        });
      } else if (id === 'wipeAll') {
        confirmSheet(t('wipeT'), t('wipeB'), t('DELETEALL'), true, function () {
          state = freshState(state.settings.lang); state.mine = 1; ensurePeriod(); save(); renderAll(); setTab('home'); toast(t('wiped'));
        });
      }
    });
  }

  state = load();
  var changed = SEED.migrate(state, uid);       // betulkan data v1.0 (APK peribadi sahaja)
  changed = SEED.ensureMine(state, uid) || changed; // masukkan gaji lama user kalau tiada (APK peribadi sahaja)
  // v1.9: jadual (rancangan) diasingkan dari syif selesai — import jadual lama dipindah ke state.plan
  if (!state.plan) { state.plan = []; changed = true; }
  if ((state.dv || 1) < 3) {
    state.dv = 3;
    state.periods.forEach(function (p) {
      p.entries = p.entries.filter(function (e) { if (e.src === 'roster') { state.plan.push(e); return false; } return true; });
    });
    changed = true;
  }
  if ((state.dv || 1) < 4 && state.periods.length) {
    state.dv = 4;
    var today0 = todayISO(), last = state.periods.map(function (p) {
      return p.entries.reduce(function (m, x) { return x.date > m ? x.date : m; }, '');
    });
    state.plan.forEach(function (x) {
      if (x.pid) return;
      x.pid = currentPeriod().id;
      if (x.date >= today0) return;
      for (var i = 0; i < state.periods.length - 1; i++) if (last[i] && last[i] >= x.date) { x.pid = state.periods[i].id; break; }
    });
    changed = true;
  }
  if (changed) save();
  bind();
  applyTheme();
  function start() {
    if (state.settings.lang) { ensurePeriod(); renderAll(); }
    else showLangGate();
  }
  if (needInstall()) showInstallGate(start); else start();
  setInterval(tick, 1000);
})();
