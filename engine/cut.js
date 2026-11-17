/* KALKULATOR POLIGRAFICZNY KHOREI — Copyright © 2026 Radosław Prośniak (KHOREI).
   Wszelkie prawa zastrzeżone. Licencja użytkowa: patrz LICENSE. */

// SILNIK CIĘCIA I IMPOZYCJI
// Droga papieru: arkusz bazowy (B1) → formatka robocza (to, co wchodzi do maszyny) → użytek netto.
// Każdy prostokąt zna kierunek włókna. Włókno nie zmienia się przy cięciu — zmienia się tylko to,
// do którego boku formatki / użytku jest równoległe, zależnie od tego, jak go obrócimy na arkuszu.
//
// Układ współrzędnych: oś X = bok A arkusza (szerokość), oś Y = bok B. Włókno opisujemy osią: "x" albo "y".
// Cięcie gilotynowe: każde cięcie przechodzi przez cały kawałek — dlatego formatki układamy algorytmem
// „gilotynowym” (rekurencyjny podział prostokąta), a nie dowolnym pakowaniem.

const EPS = 1e-6;
const flip = (g) => (g === "x" ? "y" : "x");

// Ile elementów o rozmiarze `size` zmieści się w `avail`, z odstępem `gap` tylko MIĘDZY nimi.
export function ileWRzedzie(avail, size, gap = 0) {
  if (size <= 0 || avail + EPS < size) return 0;
  return Math.floor((avail + gap + EPS) / (size + gap));
}

// Wymiar formatki dla siatki nx × ny użytków: użytki + wycinka między nimi + margines maszyny po obu stronach.
// (Ta sama formuła co w arkuszu „Papier”: n·użytek + (n−1)·3 + 14.)
export function wymiarFormatki(nx, ny, uw, uh, gap, margin) {
  return { w: nx * uw + (nx - 1) * gap + 2 * margin, h: ny * uh + (ny - 1) * gap + 2 * margin };
}

// Oś długiego boku prostokąta (null = kwadrat — włókno bez znaczenia).
const osDlugiego = (w, h) => (Math.abs(w - h) < EPS ? null : w > h ? "x" : "y");

// Czy użytek spełnia wymóg włókna produktu. wymog: "dowolne" | "dlugi" | "krotki" (względem użytku).
export function wloknoOK(uw, uh, grain, wymog) {
  if (!wymog || wymog === "dowolne") return true;
  const lng = osDlugiego(uw, uh);
  if (!lng) return true;
  return wymog === "dlugi" ? grain === lng : grain !== lng;
}

// Czy formatka (fw × fh, włókno `grain` w jej układzie) wejdzie do maszyny cyfrowej — i jak.
// Zwraca { ok, krawedz, dlugosc, bypass, powod }.
export function cyfraPrzyjmie(fw, fh, grain, gram, m, pozwolBypass = false) {
  const ciezki = gram >= m.progWloknaGram;
  const maxL = pozwolBypass ? m.dlugoscMaxBypass : m.dlugoscMax;
  // Dwie możliwe orientacje podawania: krawędzią fw albo krawędzią fh.
  const opcje = [
    { krawedz: fw, dlugosc: fh, wloknoWzdluzKrawedzi: grain === "x" },
    { krawedz: fh, dlugosc: fw, wloknoWzdluzKrawedzi: grain === "y" },
  ];
  let powod = "za duża na tor papieru";
  for (const o of opcje) {
    if (o.krawedz > m.krawedzMax + EPS) continue;
    if (o.dlugosc > maxL + EPS) { powod = "za długa"; continue; }
    if (o.krawedz + EPS < m.minKrawedz || o.dlugosc + EPS < m.minDlugosc) { powod = "za mała"; continue; }
    if (ciezki && !o.wloknoWzdluzKrawedzi) { powod = `przy ${gram} g włókno musi biec wzdłuż krawędzi wiodącej`; continue; }
    return { ok: true, krawedz: o.krawedz, dlugosc: o.dlugosc, bypass: o.dlugosc > m.dlugoscMax + EPS, powod: "" };
  }
  return { ok: false, powod };
}

// Mieści się w stacji o maks. formacie A × B (bez względu na włókno, w dowolnej orientacji).
export const miesciSie = (w, h, s) => !s || !s.maxA || ((w <= s.maxA + EPS && h <= s.maxB + EPS) || (h <= s.maxA + EPS && w <= s.maxB + EPS));

// ===== Cięcie gilotynowe =====
// Maksymalna liczba formatek (w jednej lub dwóch orientacjach) na prostokącie W × H.
// Programowanie dynamiczne po „pozycjach normalnych” (sumy wymiarów elementów) — tylko tam ma sens ciąć.
// pieces: [{ w, h, rot }] — dopuszczalne orientacje (już przefiltrowane przez reguły włókna).
export function gilotyna(W, H, pieces) {
  const P = pieces.filter((p) => p.w <= W + EPS && p.h <= H + EPS);
  if (!P.length) return { count: 0, placements: [], ciec: 0 };
  const S = 10; // obliczenia w dziesiątych częściach mm — liczby całkowite, bez błędów zaokrągleń
  const Wi = Math.floor(W * S + EPS), Hi = Math.floor(H * S + EPS);
  const Pi = P.map((p) => ({ ...p, wi: Math.round(p.w * S), hi: Math.round(p.h * S) }));

  const normal = (max, dims) => {
    const set = new Set([0]); let fr = [0];
    while (fr.length && set.size < 400) {
      const nf = [];
      for (const v of fr) for (const d of dims) { const n = v + d; if (n <= max && !set.has(n)) { set.add(n); nf.push(n); } }
      fr = nf;
    }
    if (set.size >= 400) { // za dużo kombinacji — zostają wielokrotności każdego wymiaru osobno
      set.clear(); set.add(0);
      for (const d of dims) for (let v = d; v <= max; v += d) set.add(v);
    }
    return [...set].sort((a, b) => a - b);
  };
  const NX = normal(Wi, [...new Set(Pi.map((p) => p.wi))]);
  const NY = normal(Hi, [...new Set(Pi.map((p) => p.hi))]);
  const floorN = (arr, v) => { let lo = 0, hi = arr.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arr[mid] <= v) lo = mid; else hi = mid - 1; } return arr[lo]; };

  const memo = new Map();
  const best = (X, Y) => {
    const key = X * 100003 + Y;
    const c = memo.get(key); if (c) return c;
    let r = { n: 0 };
    for (const p of Pi) {
      const n = Math.floor(X / p.wi) * Math.floor(Y / p.hi);
      if (n > r.n) r = { n, kind: "grid", p };
    }
    for (const x of NX) {
      if (x <= 0) continue; if (x > X / 2) break;
      const a = best(x, Y), b = best(floorN(NX, X - x), Y);
      if (a.n + b.n > r.n) r = { n: a.n + b.n, kind: "v", x, X, Y };
    }
    for (const y of NY) {
      if (y <= 0) continue; if (y > Y / 2) break;
      const a = best(X, y), b = best(X, floorN(NY, Y - y));
      if (a.n + b.n > r.n) r = { n: a.n + b.n, kind: "h", y, X, Y };
    }
    memo.set(key, r);
    return r;
  };

  const placements = [];
  let ciec = 0;
  const build = (X, Y, ox, oy) => {
    const r = best(X, Y);
    if (!r.n) return;
    if (r.kind === "grid") {
      const nx = Math.floor(X / r.p.wi), ny = Math.floor(Y / r.p.hi);
      ciec += (nx - 1) + (ny - 1) + (nx * r.p.wi < X ? 1 : 0) + (ny * r.p.hi < Y ? 1 : 0);
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++)
        placements.push({ x: (ox + i * r.p.wi) / S, y: (oy + j * r.p.hi) / S, w: r.p.w, h: r.p.h, rot: r.p.rot });
    } else if (r.kind === "v") {
      ciec++; build(r.x, Y, ox, oy); build(floorN(NX, X - r.x), Y, ox + r.x, oy);
    } else {
      ciec++; build(X, r.y, ox, oy); build(X, floorN(NY, Y - r.y), ox, oy + r.y);
    }
  };
  const top = best(floorN(NX, Wi), floorN(NY, Hi));
  build(floorN(NX, Wi), floorN(NY, Hi), 0, 0);
  return { count: top.n, placements, ciec };
}

// ===== Planowanie: od zlecenia do listy scenariuszy =====
// z — zlecenie (patrz app/state.js → zlecenieDomyslne), M — maszyny (config.MASZYNY).
// Zwraca listę scenariuszy z pełną drogą cięcia i metrykami; posortowaną później przez wycenę.
export function planuj(z, M, gap = 3) {
  const arkusz = { w: z.arkusz.a, h: z.arkusz.b, grain: z.arkusz.wlokno === "dlugie" ? (z.arkusz.b >= z.arkusz.a ? "y" : "x") : (z.arkusz.b >= z.arkusz.a ? "x" : "y") };
  const ob = M.gilotyna.obciecieArkusza;
  const uzW = arkusz.w - 2 * ob, uzH = arkusz.h - 2 * ob; // pole użyteczne arkusza po obcięciu krawędzi
  const T = z.technologie;
  let ctx;
  const maCyfre = T.cyfra?.on;
  const gram = z.papier.gram;
  const u = { w: z.uzytek.w, h: z.uzytek.h };

  // Ograniczenia formatki wynikające ze ścieżki technologicznej
  const stacje = [];
  if (T.kaszerowanie?.on) stacje.push(M.kaszerowanie);
  if (T.sztancowanie?.on) stacje.push(M.sztancowanie);
  if (T.sito?.on && !maCyfre) stacje.push(M.sito);
  // Bez cyfry formatka służy situ / tłoczeniu — montaż od 1 do 4 użytków (arkusz: „jedynki, dwójki, trójki, czwórki”)
  const analog = !maCyfre && (T.sito?.on || T.tloczenie?.on || T.letterpress?.on);
  const maxUzytkow = analog ? Math.min(...[T.sito?.on && M.sito.montazMax, T.tloczenie?.on && M.tloczenie.montazMax, T.letterpress?.on && M.letterpress.montazMax].filter(Boolean)) : Infinity;
  const margin = maCyfre ? M.cyfra.margines : analog ? M.sito.margines : 0;

  // Kandydaci na formatkę: siatki nx × ny użytków, w obu orientacjach użytku.
  const kandydaci = [];
  const orient = [{ uw: u.w, uh: u.h, urot: false }];
  if (Math.abs(u.w - u.h) > EPS) orient.push({ uw: u.h, uh: u.w, urot: true });
  const limit = maCyfre ? Math.max(M.cyfra.dlugoscMaxBypass, M.cyfra.krawedzMax) : Math.max(uzW, uzH);
  for (const o of orient) {
    const nxMax = ileWRzedzie(limit - 2 * margin, o.uw, gap), nyMax = ileWRzedzie(limit - 2 * margin, o.uh, gap);
    for (let nx = 1; nx <= nxMax; nx++) for (let ny = 1; ny <= nyMax; ny++) {
      if (nx * ny > maxUzytkow) continue;
      if (analog && z.montaz && nx * ny !== z.montaz) continue; // montaż wybrany ręcznie (jedynki…czwórki)
      const f = wymiarFormatki(nx, ny, o.uw, o.uh, gap, margin);
      kandydaci.push({ ...o, nx, ny, fw: f.w, fh: f.h, standard: false });
    }
  }
  // Formatka „bez formatki”: cięcie od razu na użytki netto (np. same uszlachetnienia po cięciu)
  if (!maCyfre && !analog) for (const o of orient) kandydaci.push({ ...o, nx: 1, ny: 1, fw: o.uw, fh: o.uh, standard: false, netto: true });
  // Standard SRA3+ 330 × 488 — tak liczy dziś arkusz, zawsze pokazujemy go dla porównania
  if (maCyfre) for (const o of orient) {
    const nx = ileWRzedzie(330 - 2 * margin, o.uw, gap), ny = ileWRzedzie(488 - 2 * margin, o.uh, gap);
    if (nx && ny) kandydaci.push({ ...o, nx, ny, fw: 330, fh: 488, standard: true });
  }

  const wyniki = [];
  ctx = { arkusz, uzW, uzH, stacje, maCyfre, gram, margin };
  for (const k of kandydaci) {
    if (!stacje.every((s) => miesciSie(k.fw, k.fh, s))) continue;
    // Dwie orientacje formatki na arkuszu: rot=false (fw wzdłuż X arkusza), rot=true (obrócona o 90°).
    const dozw = [];
    let cyfraInfo = null;
    for (const rot of [false, true]) {
      // włókno w układzie formatki
      const g = rot ? flip(arkusz.grain) : arkusz.grain;
      if (!wloknoOK(k.uw, k.uh, g, z.uzytek.wlokno)) continue;
      if (maCyfre) {
        const c = cyfraPrzyjmie(k.fw, k.fh, g, gram, M.cyfra, z.pozwolBypass);
        if (!c.ok) continue;
        cyfraInfo = cyfraInfo || c;
      }
      dozw.push({ w: rot ? k.fh : k.fw, h: rot ? k.fw : k.fh, rot });
    }
    if (!dozw.length) continue;
    const g = gilotyna(uzW, uzH, dozw);
    if (!g.count) continue;
    wyniki.push(metryki(z, M, arkusz, k, g, cyfraInfo));
  }
  // Duplikaty (ta sama formatka z dwóch dróg) i scenariusze zdominowane wypadają
  const uniq = new Map();
  for (const w of wyniki) {
    // ta sama formatka obrócona o 90° to fizycznie ta sama formatka — klucz bez kolejności boków
    const a = Math.round(Math.min(w.formatka.w, w.formatka.h) * 10), b = Math.round(Math.max(w.formatka.w, w.formatka.h) * 10);
    const key = `${a}x${b}|${w.formatka.uzytkow}|${w.formatek.naArkusz}`;
    if (!uniq.has(key) || w.formatka.standard) uniq.set(key, w);
  }
  return { arkusz, scenariusze: [...uniq.values()], ctx };
}


function metryki(z, M, arkusz, k, g, cyfraInfo) {
  const upf = k.nx * k.ny;
  const naArkusz = g.count;
  const uzytkiNaArkusz = upf * naArkusz;
  const wzory = Math.max(1, z.wzory || 1);
  const naWzor = Math.ceil(z.naklad / wzory);
  // Formatki: na cyfrze wzory można mieszać na jednym arkuszu; w sicie / tłoczeniu każdy wzór to osobne formatki.
  const mieszaj = !!z.technologie.cyfra?.on;
  const formatekPotrzeba = mieszaj ? Math.ceil(z.naklad / upf) : Math.ceil(naWzor / upf) * wzory;
  const arkuszyNetto = Math.ceil(formatekPotrzeba / naArkusz);
  const zwyzka = z.zwyzkaArkuszy || 0;
  const arkuszy = arkuszyNetto + zwyzka;
  const formatek = arkuszy * naArkusz;
  const poleArk = arkusz.w * arkusz.h;
  const poleUz = z.uzytek.w * z.uzytek.h;
  const wykorzystanie = (uzytkiNaArkusz * poleUz) / poleArk;
  // Cięcia: arkusz → formatki (+4 obcięcia krawędzi) i formatka → użytki (siatka + obcięcie marginesów),
  // na stosie — liczymy operacje na jeden stos, nie na arkusz.
  const cieciaArkusz = g.ciec + 4;
  // (pasy przekładane na jeden stos — tak pracuje introligatornia; wycinka = 2 cięcia).
  const cieciaFormatka = k.netto ? 0 : 2 * (k.nx - 1) + 2 * (k.ny - 1) + 4;
  // Stosy: ile razy trzeba powtórzyć każde cięcie, bo cały nakład nie mieści się pod nożem naraz.
  const grub = (z.papier.mikrony || 300) / 1000;
  const kasz = z.technologie.kaszerowanie?.on ? 2 : 1;
  const wys = M.gilotyna.wysokoscStosu || 80;
  const stosyArkusz = Math.max(1, Math.ceil((arkuszy * grub) / wys));
  const stosyFormatka = Math.max(1, Math.ceil((formatek * grub * kasz) / wys));
  return {
    id: `${k.fw}x${k.fh}-${k.nx}x${k.ny}${k.urot ? "r" : ""}${k.standard ? "-std" : ""}`,
    formatka: { w: k.fw, h: k.fh, nx: k.nx, ny: k.ny, uw: k.uw, uh: k.uh, uzytkow: upf, standard: k.standard, netto: !!k.netto },
    cyfra: cyfraInfo,
    uklad: g.placements,
    formatek: { naArkusz, potrzeba: formatekPotrzeba, zArkuszy: formatek },
    arkuszy, arkuszyNetto, zwyzka,
    uzytkiNaArkusz,
    wydrukowane: formatek * upf,
    wykorzystanie,
    ciecia: { arkusz: cieciaArkusz, formatka: cieciaFormatka, stosyArkusz, stosyFormatka },
  };
}

// ===== Wybrana formatka =====
// Tak pracuje drukarnia: w wycenie wskazuje się formatkę druku (np. SRA3+ 330 × 488) i jej włókno — długie albo krótkie.
// Z tego wynika reszta: jak położyć formatki na arkuszu bazowym, żeby dostać to włókno, i ile użytków zmieści się
// na formatce przy wymogu włókna produktu. Reguły maszyn i stacji nie odrzucają wariantu — dają ostrzeżenia.
// f = { w, h, wlokno: "dlugie" | "krotkie", nx, ny (0 = najwięcej), urot: "auto" | true | false }
export function wariantFormatki(z, M, plan, f, gap = 3) {
  const { arkusz, uzW, uzH, stacje, maCyfre, gram, margin } = plan.ctx;
  const fw = f.w, fh = f.h, ostrz = [];
  // Arkusz bazowy = formatka (np. kupione SRA3): bez cięcia arkusza, włókno takie jak arkusza.
  const toSamo = (Math.abs(arkusz.w - fw) < 0.5 && Math.abs(arkusz.h - fh) < 0.5) || (Math.abs(arkusz.w - fh) < 0.5 && Math.abs(arkusz.h - fw) < 0.5);
  let g, placement;
  if (toSamo) {
    const rot = Math.abs(arkusz.w - fw) >= 0.5;
    g = rot ? flip(arkusz.grain) : arkusz.grain;
    placement = { count: 1, placements: [{ x: 0, y: 0, w: rot ? fh : fw, h: rot ? fw : fh, rot }], ciec: 0 };
  } else {
    // oś włókna w układzie formatki: długie = wzdłuż dłuższego boku
    const lng = osDlugiego(fw, fh) || "y";
    g = f.wlokno === "krotkie" ? flip(lng) : lng;
    // jedyna orientacja na arkuszu, która daje to włókno (kwadrat — obie)
    const rots = !osDlugiego(fw, fh) ? [false, true] : [arkusz.grain === g ? false : true];
    placement = gilotyna(uzW, uzH, rots.map((rot) => ({ w: rot ? fh : fw, h: rot ? fw : fh, rot })));
    if (!placement.count) return { pusty: true, ostrzezenia: [`Formatka ${fw} × ${fh} mm z włóknem ${f.wlokno === "krotkie" ? "krótkim" : "długim"} nie mieści się na arkuszu ${arkusz.w} × ${arkusz.h} (po obcięciu krawędzi). Spróbuj drugiego kierunku włókna.`] };
    placement.ciec += 4;
  }
  // Użytki na formatce: orientacja zgodna z włóknem produktu, najwięcej sztuk; ręczna siatka nadpisuje
  const avW = fw - 2 * margin, avH = fh - 2 * margin;
  const opcje = [false, true].map((urot) => {
    const uw = urot ? z.uzytek.h : z.uzytek.w, uh = urot ? z.uzytek.w : z.uzytek.h;
    return { urot, uw, uh, nx: ileWRzedzie(avW, uw, gap), ny: ileWRzedzie(avH, uh, gap), wl: wloknoOK(uw, uh, g, z.uzytek.wlokno) };
  });
  let o = f.urot === true || f.urot === false ? opcje.find((x) => x.urot === f.urot) : null;
  if (!o) {
    const zgodne = opcje.filter((x) => x.wl && x.nx * x.ny > 0);
    o = (zgodne.length ? zgodne : opcje).reduce((a, b) => (b.nx * b.ny > a.nx * a.ny ? b : a));
  }
  if (!o.wl) ostrz.push(`Włókno w użytku niezgodne z wymogiem produktu (${z.uzytek.wlokno === "dlugi" ? "wzdłuż dłuższego boku" : "wzdłuż krótszego boku"}) — przy tej formatce i tym włóknie nie da się tego spełnić.`);
  let nx = o.nx, ny = o.ny;
  if (f.nx > 0 || f.ny > 0) {
    const rx = f.nx > 0 ? Math.round(f.nx) : nx, ry = f.ny > 0 ? Math.round(f.ny) : ny;
    const need = wymiarFormatki(rx, ry, o.uw, o.uh, gap, margin);
    if (need.w > fw + EPS || need.h > fh + EPS) ostrz.push(`Siatka ${rx} × ${ry} nie mieści się w formatce — potrzeba ${need.w} × ${need.h} mm (z marginesem ${margin} mm i wycinką ${gap} mm).`);
    nx = rx; ny = ry;
  }
  if (!nx || !ny) return { pusty: true, ostrzezenia: [...ostrz, `Użytek ${z.uzytek.w} × ${z.uzytek.h} mm nie mieści się na formatce ${fw} × ${fh} mm z marginesem ${margin} mm.`] };
  if (maCyfre) {
    const c = cyfraPrzyjmie(fw, fh, g, gram, M.cyfra, z.pozwolBypass);
    if (!c.ok) ostrz.push(`${M.cyfra.nazwa}: ${c.powod}${c.powod.includes("włókno") ? " (zalecenie producentów maszyn — decyzja operatora)" : ""}.`);
  }
  for (const st of stacje) if (!miesciSie(fw, fh, st)) ostrz.push(`${st.nazwa}: formatka większa niż ${st.maxA} × ${st.maxB} mm.`);
  const cInfo = maCyfre ? (() => { const a = cyfraPrzyjmie(fw, fh, g, 0, M.cyfra, true); return a.ok ? a : null; })() : null;
  const k = { uw: o.uw, uh: o.uh, urot: o.urot, nx, ny, fw, fh, standard: false, wybrana: true };
  const m = metryki(z, M, arkusz, k, placement, cInfo);
  if (toSamo) m.ciecia.arkusz = 0;
  m.id = "wybrana"; m.wybrana = true; m.ostrzezenia = ostrz;
  m.formatka.wlokno = osDlugiego(fw, fh) && g !== osDlugiego(fw, fh) ? "krotkie" : "dlugie";
  return m;
}

// Kierunek włókna formatki z sugestii (dla przycisku „przyjmij”): wg większości formatek na arkuszu
export function wloknoFormatki(plan, s) {
  const rot = s.uklad.filter((p) => p.rot).length > s.uklad.length / 2;
  const g = rot ? flip(plan.arkusz.grain) : plan.arkusz.grain;
  const lng = osDlugiego(s.formatka.w, s.formatka.h);
  return !lng || g === lng ? "dlugie" : "krotkie";
}
