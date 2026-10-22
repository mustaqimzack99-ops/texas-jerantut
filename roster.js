/*
 * Baca gambar "Manpower Profile" (jadual kerja manager): lajur = jam 7AM..6AM, X = kerja, B = rehat.
 * Langkah:
 *  1. Kesan grid jadual dengan analisis piksel (garisan menegak/mendatar) -> 24 lajur jam sama lebar
 *  2. OCR lajur nama sahaja (bersih tanpa grid) -> cari baris user
 *  3. Semak dakwat setiap petak dalam baris tu + OCR satu huruf untuk bezakan X / B
 */
(function (root) {
  'use strict';
  var N = 24; // slot 0 = 7AM ... slot 23 = 6AM

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function slotHour(i) { return (7 + i) % 24; }
  function slotHM(i) { return pad(slotHour(((i % N) + N) % N)) + ':00'; }

  // ---------- Slot -> syif ----------
  // Ambil julat yang bersambung (bulat 24 jam): jurang kosong paling besar = sempadan syif
  function shiftFromSlots(slots) {
    var marked = [];
    for (var i = 0; i < N; i++) if (slots[i]) marked.push(i);
    if (!marked.length) return null;
    var bestGap = -1, start = marked[0], end = marked[0];
    for (var k = 0; k < marked.length; k++) {
      var a = marked[k], b = marked[(k + 1) % marked.length];
      var gap = marked.length === 1 ? N - 1 : (b - a - 1 + N) % N;
      if (gap > bestGap) { bestGap = gap; start = b; end = a; }
    }
    var len = (end - start + N) % N + 1;
    var hasB = slots.some(function (s) { return s === 'B'; });
    return { in: slotHM(start), out: slotHM(start + len), brk: hasB ? 'std' : 'none', len: len, start: start };
  }

  // ---------- Teks ----------
  function parseHourTok(text) {
    var t = String(text).toUpperCase().replace(/O/g, '0').replace(/[IL|]/g, '1').replace(/[^0-9APM:]/g, '');
    var m = /^(\d{1,2})(?::?00)?(AM|PM)$/.exec(t);
    if (!m) return null;
    var h = +m[1];
    if (h < 1 || h > 12) return null;
    var h24 = (h % 12) + (m[2] === 'PM' ? 12 : 0);
    return (h24 - 7 + 24) % 24;
  }
  // Huruf besar sahaja; nombor yang OCR keliru dengan huruf ditukar dulu (2->Z, 0->O ...)
  var DIGIT = { '0': 'O', '1': 'I', '2': 'Z', '4': 'A', '5': 'S', '6': 'G', '8': 'B' };
  function normName(s) { return String(s).toUpperCase().replace(/[0124568]/g, function (c) { return DIGIT[c]; }).replace(/[^A-Z]/g, ''); }
  function lev(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[a.length][b.length];
  }
  function nameScore(word, target) {
    var w = normName(word);
    if (w.length < 2 || !target) return 99;
    if (w === target) return 0;
    if (target.length >= 3 && w.indexOf(target) === 0) return 0.5; // MUNIFAH(RQ), ERYSHA(LOBBY)
    return lev(w, target);
  }
  // Had ralat ikut panjang nama (dipilih baris paling hampir dalam jadual)
  function nameLimit(target) { return target.length <= 4 ? 1 : Math.ceil(target.length * 0.4); }
  function findDate(text) {
    var m = /(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(20\d{2})/.exec(text || '');
    if (!m) return null;
    var d = +m[1], mo = +m[2];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return m[3] + '-' + pad(mo) + '-' + pad(d);
  }
  function median(a) { if (!a.length) return 0; var s = a.slice().sort(function (p, q) { return p - q; }); return s[Math.floor(s.length / 2)]; }

  // ---------- Grid ----------
  // Garisan = baris/lajur piksel yang kebanyakannya gelap. Pulang pusat setiap garisan.
  function lines(counts, minCount) {
    var out = [], s = -1;
    for (var i = 0; i <= counts.length; i++) {
      var on = i < counts.length && counts[i] >= minCount;
      if (on && s < 0) s = i;
      if (!on && s >= 0) { out.push({ a: s, b: i - 1, c: (s + i - 1) / 2 }); s = -1; }
    }
    return out;
  }
  function mergeClose(ls, d) {
    var out = [];
    ls.forEach(function (l) {
      var p = out[out.length - 1];
      if (p && l.c - p.c <= d) { p.b = l.b; p.c = (p.a + p.b) / 2; } else out.push({ a: l.a, b: l.b, c: l.c });
    });
    return out;
  }
  function lumAt(d, i) { return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; }

  /*
   * Topeng gelap ikut cahaya setempat (foto ada bayang / latar gelap): piksel lebih gelap 22 dari purata
   * kawasan 31x31 sekelilingnya, atau sangat gelap. Integral image supaya laju.
   */
  function darkMask(ctx, W, H) {
    var d = ctx.getImageData(0, 0, W, H).data, n = W * H, lum = new Float32Array(n), W1 = W + 1;
    var ii = new Float64Array(W1 * (H + 1)), x, y, p;
    for (p = 0; p < n; p++) lum[p] = lumAt(d, p * 4);
    for (y = 0; y < H; y++) {
      var rs = 0;
      for (x = 0; x < W; x++) { rs += lum[y * W + x]; ii[(y + 1) * W1 + x + 1] = ii[y * W1 + x + 1] + rs; }
    }
    var R = 15, dark = new Uint8Array(n);
    for (y = 0; y < H; y++) {
      var ya = Math.max(0, y - R), yb = Math.min(H, y + R + 1);
      for (x = 0; x < W; x++) {
        var xa = Math.max(0, x - R), xb = Math.min(W, x + R + 1);
        var mean = (ii[yb * W1 + xb] - ii[ya * W1 + xb] - ii[yb * W1 + xa] + ii[ya * W1 + xa]) / ((xb - xa) * (yb - ya));
        var l = lum[y * W + x];
        dark[y * W + x] = (l < mean - 22 || l < 70) ? 1 : 0;
      }
    }
    return dark;
  }
  // Skor garisan = jumlah segmen gelap yang panjang (>= minSeg, boleh putus <= 2px).
  // Tulisan = segmen pendek (diabaikan); garisan grid yang terputus (sel bergabung) tetap dikira.
  function segSum(get, len, minSeg) {
    var sum = 0, run = 0, miss = 0;
    for (var i = 0; i <= len; i++) {
      if (i < len && get(i)) { run += miss + 1; miss = 0; }
      else if (run && (i === len || ++miss > 2)) { if (run >= minSeg) sum += run; run = 0; miss = 0; }
    }
    return sum;
  }

  /*
   * Cari grid jadual di mana-mana dalam gambar (screenshot penuh, screenshot phone ada latar hitam, foto kertas).
   * 1) Garisan = piksel gelap yang NIPIS (latar hitam / blok hitam / bar phone tak dikira)
   * 2) Garisan mendatar dulu -> kawasan jadual (kumpulan garisan rapat)
   * 3) Garisan menegak dalam kawasan tu sahaja -> 24 lajur jam = deretan >= 18 selang sama lebar
   * Pulang { cols[25], colW, name {x0,x1}, rows [{y0,y1}], rowH, vx, top, bot } atau null.
   */
  function detectGrid(ctx, W, H, dbg, opt) {
    dbg = dbg || {}; opt = opt || {};
    var dark = darkMask(ctx, W, H), T = 3, x, y, i, p, n = W * H;
    // Piksel garisan nipis; toleransi +/-1 piksel supaya garisan foto yang sedikit condong/berperspektif tetap bersambung
    var tH = new Uint8Array(n), tV = new Uint8Array(n);
    for (p = 0; p < n; p++) {
      if (!dark[p]) continue;
      var yy = (p / W) | 0, xx = p - yy * W;
      tH[p] = (yy >= T && yy < H - T && dark[p - T * W] && dark[p + T * W]) ? 0 : 1;
      tV[p] = (xx >= T && xx < W - T && dark[p - T] && dark[p + T]) ? 0 : 1;
    }
    function hThin(q) { return tH[q] || (q >= W && tH[q - W]) || (q + W < n && tH[q + W]); }
    // Menegak: toleransi lebih besar (foto berperspektif — garisan kanan condong)
    var VD = opt.vd || 1;
    function vThin(q) {
      if (tV[q]) return 1;
      var xx = q % W;
      for (var dx = 1; dx <= VD; dx++) if ((xx - dx >= 0 && tV[q - dx]) || (xx + dx < W && tV[q + dx])) return 1;
      return 0;
    }
    // 1) Garisan mendatar
    var rowC = [], segH = Math.max(20, Math.round(W * 0.04));
    for (y = 0; y < H; y++) rowC.push(segSum(function (k) { return hThin(y * W + k); }, W, segH));
    var maxRow = Math.max.apply(null, rowC);
    dbg.maxRow = maxRow;
    if (maxRow < W * 0.25) { dbg.fail = 'maxRow'; return null; }
    var hl = mergeClose(lines(rowC, Math.max(W * 0.22, maxRow * 0.55)), 4);
    dbg.hl = hl.length;
    if (hl.length < 4) { dbg.fail = 'hl'; return null; }
    // 2) Kawasan jadual: deretan garisan mendatar yang paling panjang dengan jarak rapat
    var hg = [];
    for (i = 1; i < hl.length; i++) hg.push(hl[i].c - hl[i - 1].c);
    var mg = median(hg), bs = 0, be = 0, cs = 0;
    for (i = 1; i < hl.length; i++) {
      if (hl[i].c - hl[i - 1].c > mg * 6) cs = i;
      if (i - cs > be - bs) { bs = cs; be = i; }
    }
    hl = hl.slice(bs, be + 1);
    var top = hl[0].a, bot = hl[hl.length - 1].b, bandH = bot - top;
    dbg.band = [top, bot, hl.length];
    if (hl.length < 4 || bandH < 40) { dbg.fail = 'band'; return null; }
    // 3) Garisan menegak dalam kawasan jadual sahaja
    var colC = [], segV = Math.max(8, Math.round(mg * 0.6));
    for (x = 0; x < W; x++) colC.push(segSum(function (k) { return vThin((top + k) * W + x); }, bandH, segV));
    var vl = mergeClose(lines(colC, bandH * 0.3), 4);
    dbg.vl = vl.length; dbg.maxCol = Math.max.apply(null, colC);
    if (vl.length < 8) { dbg.fail = 'vl'; return null; }
    // Deretan selang sama lebar = lajur jam. Jurang ~2x/3x lebar = garisan hilang (foto pudar) -> dikira 2/3 lajur
    var gaps = [];
    for (i = 1; i < vl.length; i++) gaps.push(vl[i].c - vl[i - 1].c);
    var wRef = median(gaps.filter(function (g) { return g > 6; })), best = null;
    for (var s = 0; s < gaps.length; s++) {
      var cnt = 0, unit = [];
      for (var k = s; k < gaps.length; k++) {
        var u = unit.length ? median(unit) : wRef, mult = Math.round(gaps[k] / u);
        if (mult < 1 || mult > 3 || Math.abs(gaps[k] - mult * u) > u * 0.22 * mult) break;
        // Jurang berganda hanya di tengah deretan (bukan di awal — lajur nama bukan lajur jam), dan tak lebih 24 lajur
        if ((mult > 1 && unit.length < 3) || cnt + mult > N) break;
        if (mult === 1) unit.push(gaps[k]);
        cnt += mult;
      }
      if (cnt >= 18 && unit.length >= 10 && (!best || cnt > best.len)) best = { s: s, len: cnt, w: median(unit) };
      if (best && best.len >= N) break;
    }
    dbg.gaps = gaps.map(Math.round).join(','); dbg.wRef = wRef;
    if (!best) { dbg.fail = 'run'; return null; }
    dbg.run = best;
    var x0 = vl[best.s].c, vx = vl.map(function (l) { return l.c; });
    // Hanya 23 lajur sama lebar = garisan nama|7AM tak dikesan (lajur 7AM tergabung dgn nama) -> anjak satu lajur
    if (best.len === N - 1) x0 -= best.w;
    var cols = snapCols(x0, best.w, vx);
    if (cols[N] > W + best.w * 0.5) { dbg.fail = 'cols>W'; return null; }
    // Lajur nama: garisan kiri terdekat yang cukup lebar (abaikan garisan grid Excel tambahan dalam lajur nama)
    var nameX0 = 0;
    for (var q = vx.length - 1; q >= 0; q--) if (vx[q] < x0 - best.w * 2.5) { nameX0 = vx[q]; break; }
    // Baris: selang antara garisan mendatar
    var rows = [];
    for (var r = 1; r < hl.length; r++) {
      var y0 = hl[r - 1].b + 1, y1 = hl[r].a - 1;
      if (y1 - y0 >= 5) rows.push({ y0: y0, y1: y1 });
    }
    var mh = median(rows.map(function (z) { return z.y1 - z.y0; })), split = [];
    rows.forEach(function (z) {
      var hgt = z.y1 - z.y0, k2 = Math.round((hgt + 2) / (mh + 2));
      if (k2 >= 2 && k2 <= 3 && Math.abs(hgt + 2 - k2 * (mh + 2)) <= (mh + 2) * 0.3 * k2) {
        var step = (hgt + 2) / k2;
        for (var j = 0; j < k2; j++) split.push({ y0: Math.round(z.y0 + j * step), y1: Math.round(z.y0 + (j + 1) * step - 2) });
      } else split.push(z);
    });
    rows = split.filter(function (z) { var h = z.y1 - z.y0; return h > mh * 0.6 && h < mh * 1.8; });
    dbg.rows = rows.length;
    if (rows.length < 3) { dbg.fail = 'rows'; return null; }
    return { cols: cols, colW: best.w, name: { x0: nameX0, x1: cols[0] }, rows: rows, rowH: mh, vx: vx, top: top, bot: bot };
  }
  // Sudut senget kertas (foto): sudut yang buat garisan mendatar paling "tajam" (histogram baris paling berpuncak)
  function estimateSkew(ctx, W, H) {
    var dark = darkMask(ctx, W, H), pts = [], x, y;
    for (y = 3; y < H - 3; y += 2) for (x = 0; x < W; x += 2) {
      var p = y * W + x;
      if (dark[p] && !(dark[p - 3 * W] && dark[p + 3 * W])) pts.push(x, y);
    }
    var bestA = 0, bestS = -1;
    for (var a = -4; a <= 4.001; a += 0.25) {
      var tn = Math.tan(a * Math.PI / 180), hist = new Float64Array(H + W), sc = 0;
      for (var i = 0; i < pts.length; i += 2) { var yy = Math.round(pts[i + 1] - pts[i] * tn) + W; if (yy >= 0 && yy < hist.length) hist[yy]++; }
      for (var j = 0; j < hist.length; j++) sc += hist[j] * hist[j];
      if (sc > bestS) { bestS = sc; bestA = a; }
    }
    return bestA;
  }
  function rotateCanvas(src, deg) {
    var c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.translate(c.width / 2, c.height / 2); g.rotate(deg * Math.PI / 180);
    g.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }
  // Sempadan 25 lajur: lekat pada garisan sebenar yang dekat, kalau tiada guna lebar purata
  function snapCols(x0, w, vx) {
    var cols = [];
    for (var c = 0; c <= N; c++) {
      var want = c === 0 ? x0 : cols[c - 1] + w, hit = null, bd = w * 0.3;
      vx.forEach(function (x) { var dd = Math.abs(x - want); if (dd < bd) { bd = dd; hit = x; } });
      cols.push(hit !== null ? hit : want);
    }
    return cols;
  }

  /*
   * Topeng dakwat dalam petak: piksel gelap / merah / biru berbanding latar.
   * Garisan grid (lajur/baris dakwat hampir penuh) dibuang dulu supaya tak disangka tanda / tiang B.
   * Pulang { mask, w, h, ratio, fill } — fill = petak penuh berwarna (hitam/kelabu), bukan tanda.
   */
  function cellMask(ctx, x0, y0, x1, y1) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    var w = Math.max(1, Math.round(x1) - x0), h = Math.max(1, Math.round(y1) - y0);
    var px = ctx.getImageData(x0, y0, w, h).data, lums = [], i, x, y;
    for (i = 0; i < px.length; i += 4) lums.push(lumAt(px, i));
    var sorted = lums.slice().sort(function (a, b) { return a - b; });
    var paper = sorted[Math.floor(lums.length * 0.85)], darkMed = sorted[Math.floor(lums.length * 0.5)];
    var mask = new Uint8Array(w * h), colN = new Array(w).fill(0), rowN = new Array(h).fill(0);
    for (i = 0; i < w * h; i++) {
      var r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], l = lums[i];
      if (l < paper - 70 || (r - (g + b) / 2 > 60 && r > 110) || (b - (r + g) / 2 > 35 && l < paper - 25)) {
        mask[i] = 1; x = i % w; colN[x]++; rowN[(i - x) / w]++;
      }
    }
    // Garisan grid: lajur dakwat >= 85% tinggi petak / baris >= 85% lebar petak
    // Di tepi petak (3px) garisan grid selalu putus-putus (JPEG / SS phone) -> ambang lebih rendah
    for (x = 0; x < w; x++) if (colN[x] >= h * ((x < 3 || x >= w - 3) ? 0.4 : 0.85)) for (y = 0; y < h; y++) mask[y * w + x] = 0;
    for (y = 0; y < h; y++) if (rowN[y] >= w * ((y < 2 || y >= h - 2) ? 0.4 : 0.85)) for (x = 0; x < w; x++) mask[y * w + x] = 0;
    var ink = 0;
    for (i = 0; i < w * h; i++) ink += mask[i];
    // Petak penuh hitam/kelabu (contoh lajur TOTAL) = latar gelap, bukan tanda
    var fill = paper < 110 || darkMed < 90;
    return { mask: mask, w: w, h: h, ratio: ink / (w * h), fill: fill };
  }
  function inkRatio(ctx, x0, y0, x1, y1) {
    var m = cellMask(ctx, x0, y0, x1, y1);
    return m.fill || m.ratio > 0.55 ? 0 : m.ratio;
  }

  // X atau B ikut bentuk: B ada tiang menegak penuh di sebelah kiri, X tiada
  function markType(ctx, x0, y0, x1, y1) {
    var m = cellMask(ctx, x0, y0, x1, y1), w = m.w, h = m.h, mask = m.mask, x, y;
    var minX = w, maxX = -1, minY = h, maxY = -1;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (mask[y * w + x]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    var bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (maxX < 0 || bh < 4 || bw < 3) return 'X';
    // 1) Baris atas & bawah huruf: X = dua hujung terpisah (##..##), B = satu garisan bersambung (####)
    function rowInfo(yy) {
      var n = 0, on = false, first = -1, last = -1;
      for (var xx = minX; xx <= maxX; xx++) {
        var v = mask[yy * w + xx];
        if (v) { if (!on) n++; if (first < 0) first = xx; last = xx; }
        on = !!v;
      }
      return { n: n, span: last - first + 1 };
    }
    // Baris paling hujung; kalau terlalu pendek (sisa anti-alias), guna baris sebelah dalam
    function edge(yy, dir) {
      var a = rowInfo(yy);
      if (a.n === 1 && a.span < bw * 0.5 && bh > 4) a = rowInfo(yy + dir);
      return a.n;
    }
    var top = edge(minY, 1), bot = edge(maxY, -1);
    if (top >= 2 && bot >= 2) return 'X';
    if (top === 1 && bot === 1) return 'B';
    // 2) Sandaran — jalur paling kiri: B = tiang penuh (termasuk tengah), X = hanya hujung atas & bawah
    var band = Math.max(1, Math.round(bw * 0.15)), all = 0, mid = 0, midN = 0;
    var m0 = minY + bh * 0.25, m1 = minY + bh * 0.75;
    for (y = minY; y <= maxY; y++) {
      var hit = 0;
      for (x = minX; x < minX + band; x++) if (mask[y * w + x]) hit = 1;
      all += hit;
      if (y >= m0 && y <= m1) { midN++; mid += hit; }
    }
    return all / bh >= 0.7 && midN && mid / midN >= 0.6 ? 'B' : 'X';
  }

  // Jalur header hitam (label jam putih): baris yang >60% gelap sepanjang lajur jam
  function headerBands(ctx, grid) {
    var x0 = Math.max(0, Math.round(grid.cols[0])), x1 = Math.min(ctx.canvas.width, Math.round(grid.cols[N])), W = x1 - x0, H = ctx.canvas.height;
    if (W < 10) return [];
    var d = ctx.getImageData(x0, 0, W, H).data, bands = [], s = -1;
    for (var y = 0; y <= H; y++) {
      var on = false;
      if (y < H) {
        var dk = 0, n = 0;
        for (var x = 0; x < W; x += 2) { n++; if (lumAt(d, (y * W + x) * 4) < 90) dk++; }
        on = dk / n > 0.6;
      }
      if (on && s < 0) s = y;
      if (!on && s >= 0) { if (y - s >= 6) bands.push({ y0: s, y1: y - 1 }); s = -1; }
    }
    return bands;
  }
  // Potong + besarkan + terbalikkan warna (tulisan putih atas hitam -> hitam atas putih)
  function invertedCrop(src, x0, y0, x1, y1, scale) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(src.width, x1); y1 = Math.min(src.height, y1);
    var w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), c = document.createElement('canvas');
    c.width = Math.round(w * scale) + 20; c.height = Math.round(h * scale) + 20;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(src, x0, y0, w, h, 10, 10, w * scale, h * scale);
    var id = g.getImageData(0, 0, c.width, c.height), dd = id.data;
    for (var i = 0; i < dd.length; i += 4) { var v = 255 - lumAt(dd, i); dd[i] = dd[i + 1] = dd[i + 2] = v < 128 ? 0 : 255; }
    g.putImageData(id, 0, 0);
    return c;
  }
  /*
   * Kunci kedudukan lajur dengan label jam dalam header (7AM, 8AM, ...).
   * Kalau label "8AM" jatuh di lajur 0, semua lajur dianjak satu ke kiri (dan sebaliknya).
   */
  function alignHeader(worker, cv, grid) {
    var bands = headerBands(cv.getContext('2d'), grid).slice(0, 3), w = grid.colW, S = 3;
    var xs = Math.max(0, grid.cols[0] - w * 1.5), xe = grid.cols[N] + w * 1.5;
    function tryBand(k) {
      if (k >= bands.length) return Promise.resolve(grid);
      var b = bands[k], c = invertedCrop(cv, xs, b.y0 - 1, xe, b.y1 + 2, S);
      return ocr(worker, c, { tessedit_pageseg_mode: '11', tessedit_char_whitelist: '0123456789AMP' }).then(function (data) {
        var votes = {}, bestOff = 0, bestN = 0;
        (data.words || []).forEach(function (wd) {
          var idx = parseHourTok(wd.text);
          if (idx === null) return;
          var cx = xs + ((wd.bbox.x0 + wd.bbox.x1) / 2 - 10) / S;
          var off = idx - Math.floor((cx - grid.cols[0]) / w);
          votes[off] = (votes[off] || 0) + 1;
        });
        Object.keys(votes).forEach(function (o) { if (votes[o] > bestN) { bestN = votes[o]; bestOff = +o; } });
        if (bestN >= 4) {
          if (bestOff) {
            grid.cols = snapCols(grid.cols[0] - bestOff * w, w, grid.vx);
            grid.name.x1 = grid.cols[0];
          }
          grid.aligned = true;
          return grid;
        }
        return tryBand(k + 1);
      });
    }
    return tryBand(0).catch(function () { return grid; });
  }

  // Potong kawasan, besarkan, hitam-putih (untuk OCR)
  function cropScaled(src, x0, y0, x1, y1, scale, pad2) {
    var w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0)), p = pad2 || 0;
    var c = document.createElement('canvas');
    c.width = Math.round(w * scale) + p * 2; c.height = Math.round(h * scale) + p * 2;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(src, x0, y0, w, h, p, p, w * scale, h * scale);
    var id = g.getImageData(0, 0, c.width, c.height), dd = id.data, ls = [], i;
    for (i = 0; i < dd.length; i += 4) ls.push(0.3 * dd[i] + 0.59 * dd[i + 1] + 0.11 * dd[i + 2]);
    var paper = ls.slice().sort(function (a, b) { return a - b; })[Math.floor(ls.length * 0.8)];
    var W2 = c.width, H2 = c.height, inkM = new Uint8Array(W2 * H2), cn = new Array(W2).fill(0), rn = new Array(H2).fill(0), x, y;
    for (i = 0; i < dd.length; i += 4) {
      var r = dd[i], gg = dd[i + 1], b = dd[i + 2], l = ls[i / 4];
      // dakwat = lebih gelap dari latar petak; merah/biru pun jadi hitam
      if (l < paper - 60 || (r - (gg + b) / 2 > 60 && r > 110) || (b - (r + gg) / 2 > 35 && l < paper - 25)) {
        var k = i / 4; inkM[k] = 1; x = k % W2; cn[x]++; rn[(k - x) / W2]++;
      }
    }
    // Garisan grid yang merentas crop (penuh tinggi / lebar) dibuang
    var ph = H2 - p * 2, pw = W2 - p * 2;
    for (x = 0; x < W2; x++) if (cn[x] >= ph * 0.95) for (y = 0; y < H2; y++) inkM[y * W2 + x] = 0;
    for (y = 0; y < H2; y++) if (rn[y] >= pw * 0.95) for (x = 0; x < W2; x++) inkM[y * W2 + x] = 0;
    for (i = 0; i < dd.length; i += 4) dd[i] = dd[i + 1] = dd[i + 2] = inkM[i / 4] ? 0 : 255;
    g.putImageData(id, 0, 0);
    return c;
  }

  // ---------- Gambar ----------
  function loadImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { res(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('image')); };
      img.src = url;
    });
  }
  function toCanvas(img, rot, scale) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var c = document.createElement('canvas');
    c.width = Math.round((rot % 180 ? h : w) * scale);
    c.height = Math.round((rot % 180 ? w : h) * scale);
    var g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.translate(c.width / 2, c.height / 2); g.rotate(rot * Math.PI / 180); g.scale(scale, scale);
    g.drawImage(img, -w / 2, -h / 2);
    return c;
  }

  // ---------- OCR (kolam enjin: 2 serentak pada phone yang cukup kuat, supaya 13 gambar laju) ----------
  var POOL_N = Math.max(1, Math.min(2, ((root.navigator && root.navigator.hardwareConcurrency) || 2) >> 1));
  var pool = [], waiting = [];
  function makeWorker() {
    var slot = { busy: true, log: null };
    slot.p = root.Tesseract.createWorker('eng', 1, {
      workerPath: 'ocr/worker.min.js', corePath: 'ocr', langPath: 'ocr', workerBlobURL: false, gzip: false,
      logger: function (m) { if (slot.log) slot.log(m); }
    }).then(function (w) { slot.w = w; return slot; }, function (e) { pool.splice(pool.indexOf(slot), 1); throw e; });
    pool.push(slot);
    return slot.p;
  }
  function acquire() {
    for (var i = 0; i < pool.length; i++) if (!pool[i].busy && pool[i].w) { pool[i].busy = true; return Promise.resolve(pool[i]); }
    if (pool.length < POOL_N) return makeWorker();
    return new Promise(function (res) { waiting.push(res); });
  }
  function release(slot) {
    slot.log = null;
    var next = waiting.shift();
    if (next) next(slot); else slot.busy = false;
  }
  // Panaskan enjin awal (masa user buka skrin Imbas) supaya imbasan pertama tak lambat
  function warm() { if (!pool.length && root.Tesseract) acquire().then(release, function () {}); }
  function ocr(worker, canvas, params) {
    return worker.setParameters(params).then(function () { return worker.recognize(canvas); }).then(function (r) { return r.data; });
  }

  // Grid sah: lajur jam mesti lebih lebar dari tinggi baris (kalau tak = gambar terbaring / salah arah)
  function okGrid(g) { return g && g.colW >= g.rowH * 1.25; }
  // Grid dari kanvas kecil -> koordinat kanvas OCR (besar)
  function scaleGrid(g, fx, fy, oy) {
    function X(v) { return v * fx; }
    function Y(v) { return (v - oy) * fy; }
    return { cols: g.cols.map(X), colW: g.colW * fx, name: { x0: g.name.x0 * fx, x1: g.name.x1 * fx },
      rows: g.rows.map(function (r) { return { y0: Math.round(Y(r.y0)), y1: Math.round(Y(r.y1)) }; }),
      rowH: g.rowH * fy, vx: g.vx.map(X), top: Y(g.top), bot: Y(g.bot) };
  }
  // Lukis semula kawasan jadual sahaja (y0..y1 kanvas kecil) dari gambar asal, dibesarkan untuk OCR
  function renderRegion(img, rot, ang, s, ds, y0, y1) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, k = s / ds;
    var c = document.createElement('canvas');
    c.width = Math.round((rot % 180 ? h : w) * s);
    var fullH = Math.round((rot % 180 ? w : h) * s), oy = Math.round(y0 * k);
    c.height = Math.max(1, Math.min(fullH - oy, Math.round((y1 - y0) * k)));
    var g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.translate(c.width / 2, fullH / 2 - oy); g.rotate((rot - ang) * Math.PI / 180); g.scale(s, s);
    g.drawImage(img, -w / 2, -h / 2);
    return c;
  }
  /*
   * Cari grid: arah biasa dulu (screenshot), kemudian pusing (kertas diambil tegak), luruskan senget foto.
   * Garisan dicari pada saiz ASAL (tak dibesarkan — garisan kelabu Excel kabur kalau dibesarkan),
   * kemudian grid dipetakan ke kanvas OCR yang lebih besar (tulisan kecil lebih jelas untuk OCR).
   * Foto berperspektif: cuba lagi dengan toleransi garisan menegak lebih besar.
   */
  function findGrid(img) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, mx = Math.max(w, h);
    var ds = Math.min(1, 2400 / mx);
    if (mx * ds < 900) ds = 900 / mx; // gambar kecil: besarkan sikit
    var rots = h > w * 1.15 ? [0, 270, 90] : [0, 180];
    for (var k = 0; k < rots.length; k++) {
      var dcv = toCanvas(img, rots[k], ds), W = dcv.width, H = dcv.height, ctx = dcv.getContext('2d');
      var tries = [{ cv: dcv, ang: 0, opt: null }, { cv: dcv, ang: 0, opt: { vd: Math.max(2, Math.round(W / 450)) } }];
      var g = null, t = null, ang = null;
      for (var j = 0; j < 4 && !g; j++) {
        if (j === 2) {
          ang = estimateSkew(ctx, W, H);
          if (Math.abs(ang) < 0.25) break;
          var rc = rotateCanvas(dcv, -ang);
          tries.push({ cv: rc, ang: ang, opt: null }, { cv: rc, ang: ang, opt: tries[1].opt });
        }
        t = tries[j];
        var gg = detectGrid(t.cv.getContext('2d'), W, H, null, t.opt);
        if (okGrid(gg)) g = gg;
      }
      if (!g) continue;
      // Kanvas OCR: kawasan jadual (+ ruang atas untuk tarikh) dibesarkan supaya tinggi baris ~15px.
      // SS phone: jadual kecil dalam skrin besar -> dipotong & dibesarkan (OCR nama lebih tepat, lebih laju)
      var f = Math.max(1, Math.min(2.5, 15 / g.rowH));
      var y0 = Math.max(0, Math.floor(g.top - g.rowH * 12)), y1 = Math.min(H, Math.ceil(g.bot + g.rowH * 2));
      f = Math.min(f, Math.sqrt(9e6 / (W * (y1 - y0)))); // had saiz kanvas (memori phone)
      var cv = renderRegion(img, rots[k], t.ang, ds * f, ds, y0, y1);
      return { cv: cv, grid: scaleGrid(g, f, f, y0), rot: rots[k] };
    }
    return null;
  }
  // Tarikh dari tajuk atas jadual ("Date :02.10.2026"), kalau gambar ada bahagian tu
  function readDate(worker, cv, grid) {
    if (!grid.top || grid.top < 25) return Promise.resolve(null);
    var y0 = Math.max(0, grid.top - Math.round(grid.rowH * 9)), x1 = Math.round(cv.width * 0.6);
    var c = cropScaled(cv, 0, y0, x1, grid.top, 2, 8);
    return ocr(worker, c, { tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' })
      .then(function (d) { return findDate(d.text); }, function () { return null; });
  }

  /*
   * scan(file, name, onProgress) -> { ok, reason, slots[24], found, nameText, crop, rot, names[], date }
   * reason: 'noTable' (grid tak jumpa) | 'noName' (nama tak jumpa)
   */
  function scan(file, name, onProgress) {
    var target = normName(name);
    return Promise.all([acquire(), loadImage(file)]).then(function (r) {
      var slot = r[0], worker = slot.w, img = r[1];
      slot.log = function (m) { if (onProgress) onProgress(m); };
      var found = findGrid(img);
      var res = { ok: false, slots: [], rot: found ? found.rot : 0, found: false, names: [], date: null };
      for (var i = 0; i < N; i++) res.slots.push('');
      if (!found) { release(slot); res.reason = 'noTable'; return res; }
      var cv = found.cv, grid = found.grid;
      last = { cv: cv, grid: grid, rot: found.rot };
      res.ctx = last;
      return alignHeader(worker, cv, grid)
        .then(function () { return readDate(worker, cv, grid); })
        .then(function (dt) { res.date = dt; return readName(worker, cv, grid, target, res); })
        .then(function (out) { release(slot); return out; }, function (e) { release(slot); throw e; });
    });
  }

  var last = null; // { cv, grid } imbasan terakhir — untuk pilih baris secara manual

  // Gambar kecil petak nama setiap baris (latar putih sahaja: abaikan baris kelabu/tajuk seksyen)
  function rowChoices(cv, grid, texts) {
    var ctx = cv.getContext('2d'), out = [];
    // Kertas rujukan = median kecerahan latar petak nama semua baris (foto lebih gelap dari screenshot)
    var papers = grid.rows.map(function (row) {
      var x0 = Math.round(grid.name.x0 + 2), x1 = Math.round(grid.name.x1 - 2), y0 = Math.round(row.y0 + 1), y1 = Math.round(row.y1);
      var px = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data, ls = [];
      for (var k = 0; k < px.length; k += 16) ls.push(lumAt(px, k));
      ls.sort(function (a, b) { return a - b; });
      return ls[Math.floor(ls.length * 0.85)];
    });
    var paperRef = median(papers);
    grid.rows.forEach(function (row, i) {
      var x0 = Math.round(grid.name.x0 + 2), x1 = Math.round(grid.name.x1 - 2), y0 = Math.round(row.y0 + 1), y1 = Math.round(row.y1);
      var px = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data, ls = [];
      for (var k = 0; k < px.length; k += 4) ls.push(lumAt(px, k));
      ls.sort(function (a, b) { return a - b; });
      var paper = ls[Math.floor(ls.length * 0.85)], darkest = ls[Math.floor(ls.length * 0.03)];
      if (paper < paperRef - 35 || paper - darkest < 50) return; // baris kelabu / kosong
      var c = document.createElement('canvas'), sc = Math.min(3, 360 / (x1 - x0));
      c.width = Math.round((x1 - x0) * sc); c.height = Math.round((y1 - y0) * sc);
      var g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high';
      g.drawImage(cv, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
      out.push({ i: i, text: (texts[i] || []).join(' '), img: c.toDataURL('image/png') });
    });
    return out;
  }
  // Baca baris pilihan user (dari imbasan terakhir)
  function readRowAt(i, label, ctx) {
    var L = ctx || last;
    if (!L || !L.grid.rows[i]) return Promise.reject(new Error('noScan'));
    var res = { ok: false, slots: [], rot: L.rot, found: true, names: [], nameText: label || '', ctx: L };
    for (var k = 0; k < N; k++) res.slots.push('');
    return Promise.resolve(readRow(null, L.cv, L.grid, L.grid.rows[i], res));
  }

  // Teks setiap baris lajur nama. mode 'rows' = petak disusun berjarak (garisan mendatar terbuang);
  // mode 'column' = seluruh lajur sekali gus (untuk nama besar yang melimpah keluar baris)
  function nameTexts(worker, cv, grid, mode) {
    var nx0 = grid.name.x0 + 2, nx1 = grid.name.x1 - 2, S = 3, gapPx = 8, rows = grid.rows;
    var strip, map;
    if (mode === 'rows') {
      var rowH = grid.rowH;
      strip = document.createElement('canvas');
      strip.width = Math.round((nx1 - nx0) * S) + 20;
      strip.height = rows.length * (Math.round(rowH * S) + gapPx) + 20;
      var g = strip.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, strip.width, strip.height);
      var slots = rows.map(function (row, i) {
        var cell = cropScaled(cv, nx0, row.y0 + 1, nx1, row.y1, S, 0), top = 10 + i * (Math.round(rowH * S) + gapPx);
        g.drawImage(cell, 10, top);
        return { top: top, bot: top + cell.height };
      });
      map = function (cy) {
        for (var i = 0; i < slots.length; i++) if (cy >= slots[i].top - gapPx / 2 && cy <= slots[i].bot + gapPx / 2) return i;
        return -1;
      };
    } else {
      var top0 = Math.max(0, rows[0].y0 - 3), bot0 = Math.min(cv.height, rows[rows.length - 1].y1 + 3), P = 10;
      strip = cropScaled(cv, nx0, top0, nx1, bot0, S, P);
      map = function (cy) {
        var y = top0 + (cy - P) / S, bi = -1, bd = 1e9;
        rows.forEach(function (r, i) { var d = Math.abs(y - (r.y0 + r.y1) / 2); if (d < bd) { bd = d; bi = i; } });
        return bd < grid.rowH * 0.9 ? bi : -1;
      };
    }
    return ocr(worker, strip, { tessedit_pageseg_mode: mode === 'rows' ? '6' : '4', tessedit_char_whitelist: '' }).then(function (data) {
      var texts = rows.map(function () { return []; });
      (data.words || []).forEach(function (w) {
        var i = map((w.bbox.y0 + w.bbox.y1) / 2);
        if (i >= 0) texts[i].push(w.text);
      });
      return texts;
    });
  }
  function matchName(texts, target) {
    var best = null, second = 99;
    texts.forEach(function (ws, i) {
      var full = ws.join(' '), rowBest = 99;
      ws.concat([full]).forEach(function (t) { rowBest = Math.min(rowBest, nameScore(t, target)); });
      if (!best || rowBest < best.sc) { if (best) second = Math.min(second, best.sc); best = { sc: rowBest, i: i, text: full }; }
      else second = Math.min(second, rowBest);
    });
    // Tolak kalau terlalu jauh, atau ada baris lain sama dekat (tak pasti orang mana)
    if (!best || best.sc > nameLimit(target) || (best.sc > 0 && second <= best.sc)) return null;
    return best;
  }

  function readName(worker, cv, grid, target, res) {
    function done(m, texts) {
      texts.forEach(function (ws) { var f = ws.join(' '); if (normName(f).length >= 2) res.names.push(f); });
      if (!m) { res.reason = 'noName'; res.ok = true; res.rows = rowChoices(cv, grid, texts); return res; }
      res.found = true; res.nameText = m.text.replace(/[^A-Za-z() ]/g, '').trim();
      return readRow(worker, cv, grid, grid.rows[m.i], res);
    }
    return nameTexts(worker, cv, grid, 'rows').then(function (texts) {
      var m = matchName(texts, target);
      if (m) return done(m, texts);
      // Cubaan kedua: seluruh lajur (nama besar/tebal yang melimpah keluar garisan baris)
      return nameTexts(worker, cv, grid, 'column').then(function (t2) {
        var m2 = matchName(t2, target);
        return m2 ? done(m2, t2) : done(null, texts);
      }, function () { return done(null, texts); });
    });
  }

  function readRow(worker, cv, grid, row, res) {
    res.row = row;
    var ctx = cv.getContext('2d'), cols = grid.cols, marked = [];
    for (var i = 0; i < N; i++) {
      var ink = inkRatio(ctx, cols[i] + 3, row.y0, cols[i + 1] - 3, row.y1 + 1);
      if (ink > 0.025) { res.slots[i] = 'X'; marked.push(i); } // tanda kecil (x huruf kecil) pun dikira
    }
    // Gambar petak nama (untuk user sahkan baris betul)
    var x0 = grid.name.x0 + 2, x1 = grid.name.x1 - 2, y0 = Math.max(0, row.y0), y1 = Math.min(cv.height, row.y1 + 1);
    var prev = document.createElement('canvas'), ps = Math.min(3, 680 / (x1 - x0));
    prev.width = Math.round((x1 - x0) * ps); prev.height = Math.round((y1 - y0) * ps);
    var pg = prev.getContext('2d'); pg.imageSmoothingQuality = 'high';
    pg.drawImage(cv, x0, y0, x1 - x0, y1 - y0, 0, 0, prev.width, prev.height);
    res.crop = prev.toDataURL('image/png');
    marked.forEach(function (i) { res.slots[i] = markType(ctx, cols[i] + 2, row.y0, cols[i + 1] - 2, row.y1 + 1); });
    res.ok = true;
    return res;
  }

  /*
   * Baca SEMUA baris sekali (untuk ujian ketepatan): nama + slot + nilai TOTAL dalam jadual.
   * Pulang [{ name, slots, total }] atau null kalau grid tak jumpa.
   */
  function scanAll(file) {
    return Promise.all([acquire(), loadImage(file)]).then(function (r) {
      var slot = r[0], worker = slot.w, img = r[1], found = findGrid(img);
      if (!found) { release(slot); return null; }
      var cv = found.cv, grid = found.grid;
      setTimeout(function () { release(slot); }, 0);
      return alignHeader(worker, cv, grid).then(function () { return nameTexts(worker, cv, grid, 'rows'); }).then(function (texts) {
        // Lajur TOTAL = selepas lajur 6AM sampai garisan seterusnya
        var tx0 = grid.cols[N] + 1, tx1 = tx0 + grid.colW * 1.6;
        grid.vx.forEach(function (x) { if (x > grid.cols[N] + grid.colW * 0.6 && x < tx1) tx1 = x; });
        var rows = grid.rows, top0 = rows[0].y0 - 2, bot0 = rows[rows.length - 1].y1 + 2, S = 3, P = 10;
        var strip = cropScaled(cv, tx0 + 1, top0, tx1 - 1, bot0, S, P);
        return ocr(worker, strip, { tessedit_pageseg_mode: '6', tessedit_char_whitelist: '0123456789.' }).then(function (data) {
          var totals = rows.map(function () { return ''; });
          (data.words || []).forEach(function (w) {
            var y = top0 + ((w.bbox.y0 + w.bbox.y1) / 2 - P) / S, bi = -1, bd = 1e9;
            rows.forEach(function (rr, i) { var dd = Math.abs(y - (rr.y0 + rr.y1) / 2); if (dd < bd) { bd = dd; bi = i; } });
            if (bi >= 0 && bd < grid.rowH) totals[bi] += w.text;
          });
          return rows.map(function (row, i) {
            var res = { slots: [] };
            for (var k = 0; k < N; k++) res.slots.push('');
            readRow(worker, cv, grid, row, res);
            return { name: texts[i].join(' '), slots: res.slots, total: totals[i] };
          });
        });
      });
    });
  }

  var api = { N: N, slotHour: slotHour, slotHM: slotHM, shiftFromSlots: shiftFromSlots, parseHourTok: parseHourTok,
    nameScore: nameScore, normName: normName, nameLimit: nameLimit, markType: markType, cellMask: cellMask, cropScaled: cropScaled, findDate: findDate, scan: scan, scanAll: scanAll, readRowAt: readRowAt, warm: warm, findGrid: findGrid, _dbg: { darkMask: darkMask, segSum: segSum, lines: lines, estimateSkew: estimateSkew, rotateCanvas: rotateCanvas }, detectGrid: detectGrid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GajiRoster = api;
})(this);
