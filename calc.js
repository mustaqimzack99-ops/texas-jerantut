/* Logik kiraan gaji part-time. r.error = kod (diterjemah dalam i18n.js sebagai e_<kod>). Semua duit dikira dalam SEN (integer) supaya tak ada ralat titik perpuluhan. */
(function (root) {
  'use strict';

  var DEFAULT_SETTINGS = {
    rate: 8.72,        // RM sejam
    midnight: 5,       // RM elaun midnight
    stdBreak: 30,      // minit rehat "standard"
    kwsp: true,
    kwspRate: 11,      // % pekerja (bawah 60 tahun)
    socso: true,
    eis: true
  };

  function toMin(hhmm) {
    if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
    var p = hhmm.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  // Tindih antara dua julat [a1,a2) dan [b1,b2)
  function overlap(a1, a2, b1, b2) {
    return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  }

  /*
   * Kira satu entri. Pulang { ok, minutes, midnight, open, error, spanMin, breakMin }
   * entry.type: 'time' | 'manual' | 'off'
   * entry.brk:  'none' | 'std' | 'actual'
   */
  function calcEntry(e, settings) {
    var s = settings || DEFAULT_SETTINGS;
    var r = { ok: true, minutes: 0, midnight: false, open: false, error: '', spanMin: 0, breakMin: 0 };
    if (!e || e.type === 'off') return r;

    if (e.type === 'manual') {
      var h = Number(e.hours);
      if (!(h >= 0) || h > 24) { r.ok = false; r.error = 'badHours'; return r; }
      r.minutes = Math.round(h * 60);
      r.midnight = !!e.midnight && r.minutes > 0;
      return r;
    }

    var start = toMin(e.in);
    if (start === null) { r.ok = false; r.error = 'noIn'; return r; }

    // Syif belum tamat (punch masih terbuka) — tak masuk jumlah lagi
    if (!e.out) { r.open = true; return r; }

    var end = toMin(e.out);
    if (end === null) { r.ok = false; r.error = 'badOut'; return r; }
    // Masuk & balik minit sama (contoh tekan in/out dalam beberapa saat) = 0 jam, bukan ralat
    if (end < start) end += 1440; // lepas tengah malam
    r.spanMin = end - start;
    // Punch ada cap masa tepat (saat) -> guna tu supaya sama dengan kiraan live
    var precise = e.inTs > 0 && e.outTs >= e.inTs;
    if (precise) r.spanMin = (e.outTs - e.inTs) / 60000;

    var brk = 0;
    if (e.brk === 'std') {
      brk = Number(s.stdBreak) || 0;
    } else if (e.brk === 'actual') {
      var bo = toMin(e.brkOut), bi = toMin(e.brkIn);
      if (bo === null || bi === null) { r.ok = false; r.error = 'brkIncomplete'; return r; }
      if (bo < start) bo += 1440;
      if (bi < bo) bi += 1440;
      if (bo > end || bi > end) { r.ok = false; r.error = 'brkOutside'; return r; }
      // Rehat diberi penuh (contoh 30 min): masuk awal pun tetap tolak 30; lebih lama = tolak masa sebenar
      r.breakActual = (precise && e.brkOutTs > 0 && e.brkInTs >= e.brkOutTs) ? (e.brkInTs - e.brkOutTs) / 60000 : bi - bo;
      brk = Math.max(r.breakActual, Number(s.stdBreak) || 0);
    }
    /*
     * Syif ikut jadual (e.sched: minit mula/tamat jadual, relatif dari masa punch masuk):
     * - masuk awal tak dikira (gaji mula pada masa jadual), gaji berhenti pada tamat jadual
     * - masa dibundar ke bawah blok 30 minit
     * - lebih masa lepas tamat jadual diasingkan (blok 30 min, belum pasti dapat) — tak masuk gaji
     */
    var winStart = 0, winEnd = r.spanMin;
    r.otMinutes = 0;
    if (e.sched && isFinite(e.sched.s) && isFinite(e.sched.e)) {
      r.sched = true;
      winStart = Math.max(0, e.sched.s);
      winEnd = Math.max(winStart, Math.min(r.spanMin, e.sched.e));
      // Lebih masa = kerja sebelum jadual mula + selepas jadual tamat (setiap satu blok 30 min; < 30 min = tak dikira)
      var early = Math.min(r.spanMin, Math.max(0, e.sched.s)), late = r.spanMin - Math.max(e.sched.e, winStart);
      r.otMinutes = (early > 0 ? Math.floor(early / 30 + 1e-9) * 30 : 0) + (late > 0 ? Math.floor(late / 30 + 1e-9) * 30 : 0);
    }
    var paid = winEnd - winStart;
    // Syif lebih pendek dari rehat = 0 jam (tak negatif)
    r.breakMin = Math.min(brk, paid);
    r.minutes = paid - r.breakMin;
    if (r.sched) r.minutes = Math.floor(r.minutes / 30 + 1e-9) * 30;

    // Midnight: masa dibayar tindih slot 12AM-1AM (habis tepat 12AM = tiada)
    var ms = start + winStart, me = start + winEnd;
    r.midnight = overlap(ms, me, 1440, 1500) > 0 || overlap(ms, me, 0, 60) > 0;
    return r;
  }

  // KWSP Jadual Ketiga: julat RM20 (<=5k), RM100 (<=20k); caruman = kadar x had atas, bundar naik ke ringgit
  function kwspEmployee(wSen, ratePct) {
    var rate = Number(ratePct) || 0;
    if (wSen <= 1000 || rate <= 0) return 0;
    var upper;
    if (wSen <= 500000) upper = Math.ceil(wSen / 2000) * 20;
    else if (wSen <= 2000000) upper = Math.ceil(wSen / 10000) * 100;
    else upper = wSen / 100;
    var sen = Math.round(upper * rate * 100) / 100; // RM x % = sen
    return Math.ceil(sen / 100 - 1e-9) * 100;
  }

  // PERKESO Kategori Pertama (bahagian pekerja ~0.5%), had gaji RM6,000
  var SOCSO_LOW = [[3000, 10], [5000, 20], [7000, 30], [10000, 40], [14000, 60], [20000, 85]];
  // SIP/EIS (bahagian pekerja 0.2%), had gaji RM6,000
  var EIS_LOW = [[3000, 5], [5000, 10], [7000, 15], [10000, 20], [14000, 25], [20000, 35]];

  function bracketMid(wSen) {
    var w = Math.min(wSen, 600000);
    return Math.ceil(w / 10000) * 100 - 50; // titik tengah julat RM100
  }
  function lowTable(table, wSen) {
    for (var i = 0; i < table.length; i++) if (wSen <= table[i][0]) return table[i][1];
    return null;
  }
  function socsoEmployee(wSen) {
    if (wSen <= 0) return 0;
    var low = lowTable(SOCSO_LOW, wSen);
    return low !== null ? low : bracketMid(wSen) / 2;
  }
  function eisEmployee(wSen) {
    if (wSen <= 0) return 0;
    var low = lowTable(EIS_LOW, wSen);
    return low !== null ? low : bracketMid(wSen) / 5;
  }

  function summarize(entries, settings) {
    var s = settings || DEFAULT_SETTINGS;
    var totalMin = 0, workDays = 0, midnightCount = 0, offDays = 0, openCount = 0, otMin = 0;
    (entries || []).forEach(function (e) {
      var c = calcEntry(e, s);
      if (e.type === 'off') { offDays++; return; }
      if (c.open) { openCount++; return; }
      if (!c.ok) return;
      totalMin += c.minutes;
      otMin += c.otMinutes || 0;
      if (c.minutes > 0) workDays++;
      if (c.midnight) midnightCount++;
    });
    var rateSen = Math.round(Number(s.rate) * 100);
    var midSen = Math.round(Number(s.midnight) * 100);
    var basePay = Math.round(totalMin * rateSen / 60);
    var midnightPay = midnightCount * midSen;
    var gross = basePay + midnightPay;
    var kwsp = s.kwsp ? kwspEmployee(gross, s.kwspRate) : 0;
    var socso = s.socso ? socsoEmployee(gross) : 0;
    var eis = s.eis ? eisEmployee(gross) : 0;
    return {
      totalMin: totalMin, workDays: workDays, offDays: offDays, openCount: openCount,
      midnightCount: midnightCount, rateSen: rateSen, midSen: midSen,
      basePay: basePay, midnightPay: midnightPay, gross: gross,
      kwsp: kwsp, socso: socso, eis: eis,
      net: gross - kwsp - socso - eis,
      // purata jam sehari (hari kerja), dalam perseratus jam
      avgHundredths: workDays ? Math.round(totalMin * 100 / (60 * workDays)) : 0,
      // Lebih masa (belum pasti dapat) — asing, tak masuk gaji kasar/bersih
      otMin: otMin, otPay: Math.round(otMin * rateSen / 60)
    };
  }

  var api = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, toMin: toMin, calcEntry: calcEntry, summarize: summarize,
    kwspEmployee: kwspEmployee, socsoEmployee: socsoEmployee, eisEmployee: eisEmployee
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GajiCalc = api;
})(this);
