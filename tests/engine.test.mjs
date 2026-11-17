// Testy silnika: każda liczba sprawdzona z arkuszem „WunderWaffe” albo policzona ręcznie w komentarzu.
// Uruchomienie: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { gilotyna, wymiarFormatki, ileWRzedzie, cyfraPrzyjmie, planuj, wariantFormatki } from "../engine/cut.js";
import { wycena, cenaPrzelotu } from "../engine/pricing.js";
import { MASZYNY, CENNIK } from "../engine/config.js";

const zl = (over = {}) => ({
  arkusz: { a: 700, b: 1000, wlokno: "dlugie" },
  papier: { gram: 350, mikrony: 405, cenaDostawcy: 0, cenaLicze: 0 },
  papier2: { cenaDostawcy: 0, cenaLicze: 0 },
  uzytek: { w: 90, h: 50, wlokno: "dowolne" },
  naklad: 1, wzory: 1, zwyzkaArkuszy: 0,
  technologie: { ciecie: { on: true } },
  ...over,
});
const scen = (over) => ({ arkuszy: 1, wydrukowane: 1, formatek: { zArkuszy: 1 }, ...over });

test("formatka sito 90×50, montaż 1 → 104 × 64 (Papier!H17)", () => {
  assert.deepEqual(wymiarFormatki(1, 1, 90, 50, 3, 7), { w: 104, h: 64 });
});

test("formatki 104×64 na B1 w siatce: 6×15 = 90 i 9×10 = 90 (Papier!H24, H27)", () => {
  assert.equal(ileWRzedzie(690, 104) * ileWRzedzie(990, 64), 90);
  assert.equal(ileWRzedzie(990, 104) * ileWRzedzie(690, 64), 90);
});

test("gilotyna łączy orientacje, gdy włókno pozwala: 104×64 na B1 → 100", () => {
  const g = gilotyna(690, 990, [{ w: 104, h: 64, rot: false }, { w: 64, h: 104, rot: true }]);
  assert.equal(g.count, 100);
  assert.equal(g.placements.length, 100);
  for (const p of g.placements) assert.ok(p.x + p.w <= 690 + 1e-6 && p.y + p.h <= 990 + 1e-6);
});

test("SRA3+ z B1 długie włókno: lekki papier 4 szt., karton 350 g tylko 3 szt.", () => {
  const z = (gram) => zl({ papier: { gram }, uzytek: { w: 316, h: 474, wlokno: "dowolne" }, technologie: { cyfra: { on: true, kolor: "4+0" } } });
  const std = (gram) => planuj(z(gram), MASZYNY).scenariusze.find((s) => s.formatka.w === 330 && s.formatka.h === 488);
  assert.equal(std(120).formatek.naArkusz, 4);
  assert.equal(std(350).formatek.naArkusz, 3);
});

test("PX300: karton 350 g wymaga włókna wzdłuż krawędzi wiodącej", () => {
  assert.equal(cyfraPrzyjmie(330, 488, "y", 350, MASZYNY.cyfra).ok, false);
  assert.equal(cyfraPrzyjmie(330, 488, "x", 350, MASZYNY.cyfra).ok, true);
  assert.equal(cyfraPrzyjmie(330, 488, "y", 120, MASZYNY.cyfra).ok, true);
  assert.equal(cyfraPrzyjmie(340, 488, "x", 120, MASZYNY.cyfra).ok, false);
});

test("wizytówki z włóknem wzdłuż długiego boku: każdy użytek ma włókno ∥ boku 90 mm", () => {
  const p = planuj(zl({ uzytek: { w: 90, h: 50, wlokno: "dlugi" }, technologie: { sito: { on: true } }, montaz: 1 }), MASZYNY);
  assert.ok(p.scenariusze.length > 0);
  assert.equal(Math.max(...p.scenariusze.map((s) => s.formatek.naArkusz)), 90);
});

test("kaszerowanie ręczne maks. 500×300: formatka SRA3+ odpada", () => {
  const p = planuj(zl({ technologie: { cyfra: { on: true, kolor: "4+0" }, kaszerowanie: { on: true } } }), MASZYNY);
  assert.ok(p.scenariusze.length > 0);
  for (const s of p.scenariusze) assert.ok(Math.min(s.formatka.w, s.formatka.h) <= 300 && Math.max(s.formatka.w, s.formatka.h) <= 500);
});

test("Kalkulator, wartości domyślne: 1 szt., tylko cięcie + wycena = 40 zł netto, 49,20 brutto", () => {
  const w = wycena(zl(), scen(), CENNIK);
  assert.equal(w.netto, 40);
  assert.equal(w.brutto, 49.2);
});

test("Cyfra: progi przelotu i minimalka (Cyfra Ceny, Kalkulator!C33)", () => {
  assert.equal(cenaPrzelotu("4+4", 20, CENNIK), 6);
  assert.equal(cenaPrzelotu("4+4", 21, CENNIK), 4.8);
  assert.equal(cenaPrzelotu("4+1", 101, CENNIK), 2.3);
  const w = (n) => wycena(zl({ technologie: { ciecie: { on: false }, cyfra: { on: true, kolor: "4+0" } } }), scen({ formatek: { zArkuszy: n } }), CENNIK).pozycje.find((l) => l.id === "cyfra").kwota;
  assert.equal(w(5), 30);       // 5 × 3,00 = 15 → minimalka 30
  assert.equal(w(60), 114);     // 60 × 1,90
});

test("Sito: minimalka 325 zł; 200 zł stałych + 150 przelotów × 1,50 = 425 zł (Sito!C11)", () => {
  const z = zl({ technologie: { ciecie: { on: false }, sito: { on: true, rodzaj: "Jeden przelot", ustawien: 1 } } });
  assert.equal(wycena(z, scen({ formatek: { zArkuszy: 10 } }), CENNIK).pozycje.find((l) => l.id === "sito").kwota, 325);
  assert.equal(wycena(z, scen({ formatek: { zArkuszy: 150 } }), CENNIK).pozycje.find((l) => l.id === "sito").kwota, 425);
});

test("Tłoczenie: matryca 9×5 cm = 178,50 zł, minimalka 380 zł (Tłoczenie!B22, B9)", () => {
  const z = zl({ technologie: { ciecie: { on: false }, tloczenie: { on: true, a: 9, b: 5, matryc: 1, montaz: 1 } } });
  const l = wycena(z, scen({ wydrukowane: 1 }), CENNIK).pozycje.find((x) => x.id === "tloczenie");
  assert.match(l.opis, /matryca 178.5 zł/);
  assert.equal(l.kwota, 380);
  // 1000 szt.: 178,50 + 50 + 1000 × 0,70 = 928,50
  assert.equal(wycena(z, scen({ wydrukowane: 1000 }), CENNIK).pozycje.find((x) => x.id === "tloczenie").kwota, 928.5);
});

test("Letterpress 90×50, 3 matryce, 1 szt.: 180 + 50,00 + 75 + 2,50 = 307,50 zł (Letterpress!B14)", () => {
  const z = zl({ technologie: { ciecie: { on: false }, letterpress: { on: true, matryc: 3, ustawien: 1 } } });
  assert.equal(wycena(z, scen({ wydrukowane: 1 }), CENNIK).pozycje.find((l) => l.id === "letterpress").kwota, 307.5);
});

test("Sztancowanie: progi jak w arkuszu, z zachowaną anomalią 1000 → 1001", () => {
  const k = (n) => wycena(zl({ technologie: { ciecie: { on: false }, sztancowanie: { on: true } } }), scen({ formatek: { zArkuszy: n } }), CENNIK).pozycje.find((l) => l.id === "sztancowanie").kwota;
  assert.equal(k(400), 200);
  assert.equal(k(1000), 440);
  assert.equal(k(1001), 380.3);
});

test("Kaszerowanie: do 20 kanapek 45 zł, potem 1,80 zł/szt. (Kalkulator!C61)", () => {
  const k = (n) => wycena(zl({ technologie: { ciecie: { on: false }, kaszerowanie: { on: true } } }), scen({ formatek: { zArkuszy: n } }), CENNIK).pozycje.find((l) => l.id === "kaszerowanie").kwota;
  assert.equal(k(20), 45);
  assert.equal(k(30), 63);
});

test("Cięcie: linie × stosy × stawka, minimalka 30 zł", () => {
  const z = zl();
  const s = scen({ arkuszy: 100, formatek: { zArkuszy: 1000 }, ciecia: { arkusz: 20, formatka: 30, stosyArkusz: 1, stosyFormatka: 5 } });
  // 20 × 1 + 30 × 5 = 170 linii × 0,50 = 85 zł
  assert.equal(wycena(z, s, CENNIK).pozycje.find((l) => l.id === "ciecie").kwota, 85);
  const C2 = { ...CENNIK, ciecie: { ...CENNIK.ciecie, tryb: "arkusz" } };
  // 20 × 100 + 30 × 1000 = 32 000 linii × 0,50 — dlatego domyślnie liczymy na stos
  assert.equal(wycena(z, s, C2).pozycje.find((l) => l.id === "ciecie").kwota, 16000);
});

test("Stosy: 1000 ark. × 0,405 mm = 405 mm → 6 stosów po 80 mm", () => {
  const z = zl({ naklad: 100000, uzytek: { w: 90, h: 50, wlokno: "dowolne" }, technologie: { cyfra: { on: true, kolor: "4+0" } } });
  const s = planuj(z, MASZYNY).scenariusze[0];
  assert.equal(s.ciecia.stosyArkusz, Math.ceil((s.arkuszy * 0.405) / 80));
});

test("Wybrana formatka SRA3+ z B1 LG: włókno długie → 4 szt., krótkie → 3 szt.", () => {
  const z = zl({ papier: { gram: 350, mikrony: 405 }, uzytek: { w: 90, h: 50, wlokno: "dowolne" }, technologie: { cyfra: { on: true, kolor: "4+0" } } });
  const plan = planuj(z, MASZYNY);
  const lg = wariantFormatki(z, MASZYNY, plan, { w: 330, h: 488, wlokno: "dlugie" });
  const sg = wariantFormatki(z, MASZYNY, plan, { w: 330, h: 488, wlokno: "krotkie" });
  assert.equal(lg.formatek.naArkusz, 4);
  assert.equal(sg.formatek.naArkusz, 3);
  assert.equal(lg.formatka.uzytkow, 30);                       // 6 × 5 użytków obróconych (50 wzdłuż 330: 6·50+5·3 = 315 ≤ 316)
  assert.ok(lg.ostrzezenia.some((o) => o.includes("PX300")));  // karton 350 g na LG — ostrzeżenie, nie blokada
  assert.equal(sg.ostrzezenia.length, 0);
});

test("Wybrana formatka: wizytówki z włóknem wzdłuż dłuższego boku obracają się na formatce", () => {
  const z = zl({ uzytek: { w: 90, h: 50, wlokno: "dlugi" }, technologie: { cyfra: { on: true, kolor: "4+0" } } });
  const plan = planuj(z, MASZYNY);
  const sg = wariantFormatki(z, MASZYNY, plan, { w: 330, h: 488, wlokno: "krotkie" }); // włókno ∥ 330 → 90 wzdłuż 330
  assert.equal(sg.formatka.uw, 90);
  const lg = wariantFormatki(z, MASZYNY, plan, { w: 330, h: 488, wlokno: "dlugie" });  // włókno ∥ 488 → 90 wzdłuż 488
  assert.equal(lg.formatka.uw, 50);
});

test("Arkusz bazowy = formatka (kupione SRA3+): 1 z arkusza, bez cięcia arkusza", () => {
  const z = zl({ arkusz: { a: 330, b: 488, wlokno: "krotkie" }, technologie: { cyfra: { on: true, kolor: "4+0" } } });
  const plan = planuj(z, MASZYNY);
  const w = wariantFormatki(z, MASZYNY, plan, { w: 330, h: 488, wlokno: "dlugie" });
  assert.equal(w.formatek.naArkusz, 1);
  assert.equal(w.ciecia.arkusz, 0);
  assert.equal(w.formatka.wlokno, "krotkie");                  // włókno dyktuje kupiony arkusz
});

test("Ręczna siatka większa niż formatka → ostrzeżenie", () => {
  const z = zl({ technologie: { cyfra: { on: true, kolor: "4+0" } } });
  const w = wariantFormatki(z, MASZYNY, planuj(z, MASZYNY), { w: 330, h: 488, wlokno: "krotkie", nx: 4, ny: 9 });
  assert.ok(w.ostrzezenia.some((o) => o.includes("nie mieści się w formatce")));
});

test("Rozcinka i margines ze zlecenia: SRA3+ SG, 90×50 wzdłuż dłuższego", () => {
  const base = { uzytek: { w: 90, h: 50, wlokno: "dlugi" }, technologie: { cyfra: { on: true, kolor: "4+0" } } };
  const f = { w: 330, h: 488, wlokno: "krotkie" };
  const run = (over) => { const z = zl({ ...base, ...over }); return wariantFormatki(z, MASZYNY, planuj(z, MASZYNY), f); };
  // domyślnie 3 / 7: 330−14 = 316 → 3 × 90; 488−14 = 474 → 9 × 50 (9·50 + 8·3 = 474)
  assert.equal(run({ rozcinka: 3, margines: 7 }).formatka.uzytkow, 27);
  // margines 10: 468 → 8 rzędów
  assert.equal(run({ rozcinka: 3, margines: 10 }).formatka.uzytkow, 24);
  // rozcinka 0, margines 7: 474 / 50 = 9 rzędów; cięcia: 1 na przerwę → (3−1) + (9−1) + 4 = 14
  const r0 = run({ rozcinka: 0, margines: 7 });
  assert.equal(r0.formatka.uzytkow, 27);
  assert.equal(r0.ciecia.formatka, 14);
  assert.equal(run({ rozcinka: 3, margines: 7 }).ciecia.formatka, 24); // 2·2 + 2·8 + 4
});

test("Rozcinka zmienia wymiar formatki w sugestiach (sito, montaż 1: 104 × 64 → 100 × 60 przy marginesie 5)", () => {
  const z = zl({ uzytek: { w: 90, h: 50, wlokno: "dlugi" }, technologie: { sito: { on: true } }, montaz: 1, rozcinka: 3, margines: 5 });
  const s = planuj(z, MASZYNY).scenariusze[0];
  assert.deepEqual([Math.max(s.formatka.w, s.formatka.h), Math.min(s.formatka.w, s.formatka.h)], [100, 60]);
});

test("Wskazana formatka liczy cięcia arkusza tak samo jak ta sama sugestia", () => {
  const z = zl({ uzytek: { w: 90, h: 50, wlokno: "dlugi" }, technologie: { cyfra: { on: true, kolor: "4+0" } }, rozcinka: 3, margines: 7 });
  const plan = planuj(z, MASZYNY);
  const w = wariantFormatki(z, MASZYNY, plan, { w: 330, h: 488, wlokno: "krotkie" });
  const s = plan.scenariusze.find((x) => x.formatka.standard);
  assert.equal(w.ciecia.arkusz, s.ciecia.arkusz);
});
