/* KALKULATOR POLIGRAFICZNY KHOREI — Copyright © 2026 Radosław Prośniak (KHOREI).
   Wszelkie prawa zastrzeżone. Licencja użytkowa: patrz LICENSE. */

// WYCENA — formuły przeniesione 1:1 z arkusza „WunderWaffe” (zakładki Kalkulator, Papier, Sito, Tłoczenie,
// Letterpress, Cyfra Ceny, Sito Ceny, Sztancowanie Ceny). Komentarz przy każdej pozycji wskazuje komórkę źródłową.
// Jedyna zmiana względem arkusza: liczby arkuszy, formatek i użytków nie są wpisywane ręcznie („Użytki / B1”)
// ani zakładane („1 B1 = 4 SRA3”) — dostarcza je scenariusz z silnika cięcia (engine/cut.js).
// Miejsca, w których arkusz liczy podejrzanie, oznaczone „DO DECYZJI” — działają jak w arkuszu, dopóki Radek nie zdecyduje.

const r2 = (v) => Math.round(v * 100) / 100;

// Cena przelotu cyfry: wiersz = kolorystyka, kolumna = próg liczby arkuszy (Kalkulator!C32)
export function cenaPrzelotu(kolor, arkuszy, C) {
  const row = C.cyfra.kolory[kolor] || [0, 0, 0, 0];
  const p = C.cyfra.progi;
  const i = arkuszy <= p[0] ? 0 : arkuszy <= p[1] ? 1 : arkuszy <= p[2] ? 2 : 3;
  return row[i];
}

// Cena 1 arkusza B1 do wyceny: „B1 liczę po”, a gdy puste — cena dostawcy + marża 30% (Papier!C3, D3)
export const cenaArkusza = (p, C) => (p?.cenaLicze > 0 ? p.cenaLicze : (p?.cenaDostawcy || 0) * (1 + C.marzaPapier));

export function wycena(z, s, C) {
  const T = z.technologie, W = C.wykonczenie;
  const kasz = !!T.kaszerowanie?.on;
  const naklad = z.naklad;
  const wzory = Math.max(1, z.wzory || 1);
  const wydr = s.wydrukowane;               // C7 = Papier!H7: arkusze × użytki na arkusz
  const naWzorZeZwyzka = wydr / wzory;      // C9 = C7 / C6
  const formatek = s.formatek.zArkuszy;     // jedna warstwa (C14)
  const formatekWszystkie = formatek * (kasz ? 2 : 1); // obie warstwy przy kaszerowaniu (C13)
  const grubosc = ((z.papier.mikrony || 0) / 1000) * (kasz ? 2 : 1); // C23 = Papier!K9, ×2 przy kaszerowaniu
  const L = [];
  // opisy po polsku: przecinek dziesiętny
  const add = (id, label, kwota, opis = "") => { if (kwota) L.push({ id, label, kwota: r2(kwota), opis: opis.replace(/(\d)\.(\d)/g, "$1,$2") }); };

  // Papier (Papier!H9): cena B1 × arkusze; przy kaszerowaniu (papier 1 + papier 2) × arkusze jednej warstwy
  const c1 = cenaArkusza(z.papier, C), c2 = kasz ? cenaArkusza(z.papier2, C) : 0;
  add("papier", "Papier", (c1 + c2) * s.arkuszy, `${s.arkuszy} ark. × ${r2(c1)} zł${kasz ? ` + papier 2 × ${r2(c2)} zł` : ""}`);

  // Druk cyfrowy (C32–C33): przelot wg progu, minimalka 30 zł
  if (T.cyfra?.on) {
    const p = cenaPrzelotu(T.cyfra.kolor, formatek, C);
    add("cyfra", `Druk cyfrowy ${T.cyfra.kolor}`, Math.max(C.cyfra.minimalka, formatek * p), `${formatek} przel. × ${r2(p)} zł, min. ${C.cyfra.minimalka} zł`);
  }

  // Sitodruk (Sito!C6–C11): klisze + świecenie + ustawienie·n, druk = przeloty × cena rodzaju; minimalka 325 zł.
  // DO DECYZJI: przy zleceniu z cyfrą sito drukuje na formatce cyfrowej — tu liczymy przelot na formatkę (jak w arkuszu
  // „wydrukowane / montaż”). Czy cena przelotu sita zależy od wielkości formatki?
  if (T.sito?.on) {
    const S = C.sito, n = T.sito.ustawien || 1;
    const stale = S.klisze * (T.sito.klisz || 1) + S.swiecenie * (T.sito.swiecen || 1) + S.ustawienie * n;
    const cena = S.przeloty[T.sito.rodzaj] ?? 1.5;
    const przelotow = formatek * n;
    add("sito", `Sitodruk — ${T.sito.rodzaj}`, Math.max(S.minimalka, stale + cena * przelotow), `stałe ${stale} zł + ${przelotow} przel. × ${cena} zł, min. ${S.minimalka} zł`);
  }

  // Tłoczenie (Tłoczenie!B9, B22): matryca = (a+1)(b+1) cm² × 1,65 × matryce + transport, × 1,5;
  // razem = matryca + ustawienie × n + strony × uderzenia × montaż × 0,70; minimalka 380 zł.
  if (T.tloczenie?.on) {
    const t = T.tloczenie, K = C.tloczenie;
    const pole = (t.a + K.zapasMatrycyCm) * (t.b + K.zapasMatrycyCm);
    const matryca = (pole * K.matrycaCm2 * (t.matryc ?? 1) + (t.transport ?? K.transport)) * K.marzaMatryca;
    const montaz = t.montaz || 1;
    const uderzen = wydr / montaz;
    const suma = matryca + K.ustawienie * (t.ustawien || 1) + (t.strony || 1) * uderzen * montaz * K.uderzenie;
    add("tloczenie", "Tłoczenie", Math.max(K.minimalka, suma), `matryca ${r2(matryca)} zł, ${Math.ceil(uderzen)} uderz. (montaż ${montaz}), min. ${K.minimalka} zł`);
  }

  // Letterpress (Letterpress!B14): matryca max(60, a·b·0,70) × matryce + klisze + ustawienie + farba + odbicia
  // DO DECYZJI: odbicia „kolejny kolor” liczą się od liczby USTAWIEŃ (B6), a nie od liczby KOLORÓW (B10) — jak w arkuszu.
  if (T.letterpress?.on) {
    const l = T.letterpress, K = C.letterpress;
    const a = z.uzytek.w / 10, b = z.uzytek.h / 10;
    const matryca = Math.max(K.matrycaMin, a * b * K.matrycaCm2) * (l.matryc ?? K.matryc);
    const klisze = (K.kliszaA5 * (l.klisz ?? 1) + K.kliszeTransport) * K.kliszeMarza;
    const ust = l.ustawien || 1;
    const odbicia = wydr * K.uderzeniePierwszy + wydr * Math.max(0, ust - 1) * K.uderzenieKolejny;
    add("letterpress", "Letterpress", matryca + klisze + K.ustawienie * ust + (l.farba ? 100 : K.mieszanieFarby) + odbicia, `matryca ${r2(matryca)} zł, klisze ${r2(klisze)} zł, ${wydr} odbić`);
  }

  // Wykończenie (Kalkulator!C46–C86)
  if (T.barwienie?.on) add("barwienie", "Barwienie krawędzi", Math.max(W.barwienieMin, wydr * (T.barwienie.koszt ?? W.barwienieSzt)), `${wydr} szt., min. ${W.barwienieMin} zł`);
  if (T.bigowanie?.on) { const n = T.bigowanie.big || 0; add("bigowanie", "Bigowanie", W.bigowanieUst * n + n * wydr * W.bigowanieSzt, `${n} big × ${wydr} szt.`); }
  // Cięcie (zamiast stałych 30 zł z Kalkulator!C54): stawka za linię cięcia × powtórzenia; minimalka 30 zł.
  if (T.ciecie?.on !== false) {
    const K = C.ciecie, c = s.ciecia || { arkusz: 0, formatka: 0, stosyArkusz: 1, stosyFormatka: 1 };
    const naStos = K.tryb !== "arkusz";
    const r1 = naStos ? c.stosyArkusz : s.arkuszy, r2_ = naStos ? c.stosyFormatka : formatek;
    const linii = c.arkusz * r1 + c.formatka * r2_;
    add("ciecie", "Cięcie", Math.max(K.minimalka, linii * K.stawkaLinia),
      `${c.arkusz} linii × ${r1} ${naStos ? "stos." : "ark."} + ${c.formatka} linii × ${r2_} ${naStos ? "stos." : "form."} = ${linii} × ${K.stawkaLinia} zł, min. ${K.minimalka} zł`);
  }
  if (T.foliowanie?.on) { const dwu = T.foliowanie.strony === 2; add("foliowanie", `Foliowanie ${dwu ? "dwustronne" : "jednostronne"}`, W.foliowanieUst + formatekWszystkie * W.foliowanieArk * (dwu ? 2 : 1), `${formatekWszystkie} formatek`); }
  if (kasz) { const k = formatek; add("kaszerowanie", "Kaszerowanie", k <= 20 ? W.kaszerowanieDo20 : (k - 20) * W.kaszerowanieKanapka + W.kaszerowanieDo20, `${k} kanapek`); }
  if (T.laser?.on) add("laser", "Cięcie laserem", W.laserUst + wydr * (T.laser.szt ?? W.laserSzt));
  if (T.ploter?.on) add("ploter", "Nacinanie ploterem", W.ploterArk * formatekWszystkie, `${formatekWszystkie} formatek`);
  if (T.oczkowanie?.on) add("oczkowanie", "Oczkowanie", W.oczkowanieUst + wydr * W.oczkowanieSzt);
  if (T.blona?.on) add("blona", "Podklejanie błony", formatekWszystkie * W.blonaArk);
  // DO DECYZJI: rożkowanie i szycie drutem liczą się od nakładu NA WZÓR (C9), nie od całego nakładu — jak w arkuszu.
  if (T.rozkowanie?.on) add("rozkowanie", "Rożkowanie", naWzorZeZwyzka * W.rozkowanieSzt);
  if (T.sztancowanie?.on) {
    // Sztancowanie Ceny + Kalkulator!C74. DO DECYZJI: powyżej 1000 uderzeń cała nadwyżka ponad 400 idzie po 0,30 zł,
    // więc 1001 uderzeń wychodzi taniej niż 1000 (380,30 zł < 440 zł).
    const K = C.sztancowanie, n = formatek;
    const kw = n <= K.prog1 ? K.minimalka : n <= K.prog2 ? K.minimalka + (n - K.prog1) * K.cena1 : K.minimalka + (n - K.prog1) * K.cena2;
    add("sztancowanie", "Sztancowanie", kw, `${n} uderzeń`);
    if (T.sztancowanie.wykrojnik) add("wykrojnik", "Wykrojnik", T.sztancowanie.wykrojnik);
  }
  if (T.szycie?.on) add("szycie", "Szycie drutem", naWzorZeZwyzka * W.szycieSzt * W.szycieZszywek + W.szycieUst);
  if (T.nfc?.on) add("nfc", "Tag NFC", naklad * W.nfcSzt);
  if (T.wiercenie?.on) { const o = T.wiercenie.otworow || 0; add("wiercenie", "Wiercenie", o * (W.wiercenieUst + ((W.wiercenieWsp * grubosc) / 10) * wydr), `${o} otw.`); }
  if (T.edycja?.on) add("edycja", "Edycja graficzna", W.edycjaGraficzna);
  add("wycena", "Wycena", W.wycena);

  const netto = r2(L.reduce((a, l) => a + l.kwota, 0));
  return {
    pozycje: L,
    netto, brutto: r2(netto * (1 + C.vat)),
    sztNetto: r2(netto / naklad), sztBrutto: r2((netto / naklad) * (1 + C.vat)),
    papier: L.find((l) => l.id === "papier")?.kwota || 0,
    wysylka: z.wysylka ? W.wysylka : 0,
  };
}

// Scenariusze z wyceną, posortowane od najtańszego. Do każdego dopisujemy różnicę względem najtańszego
// i względem „jak dziś” (standardowa formatka SRA3+ / pierwsza z brzegu), żeby matryca decyzji miała punkt odniesienia.
export function porownaj(z, plan, C, wybrana = null) {
  const lista = plan.scenariusze.map((s) => ({ ...s, wycena: wycena(z, s, C) }));
  const rec = wybrana && !wybrana.pusty ? { ...wybrana, wycena: wycena(z, wybrana, C) } : null;
  // remis cenowy: mniej formatek, mniej arkuszy, więcej użytków z arkusza (zapas na makulaturę), na końcu znana formatka standardowa
  lista.sort((a, b) => a.wycena.netto - b.wycena.netto || a.formatek.zArkuszy - b.formatek.zArkuszy || a.arkuszy - b.arkuszy
    || b.uzytkiNaArkusz - a.uzytkiNaArkusz || (b.formatka.standard ? 1 : 0) - (a.formatka.standard ? 1 : 0));
  const best = lista[0];
  const ref = lista.find((s) => s.formatka.standard) || null;
  if (rec) lista.push(rec); // wybrana formatka nie bierze udziału w wyborze „najtańszego” — porównujemy ją z sugestiami
  for (const s of lista) {
    s.roznica = best ? r2(s.wycena.netto - best.wycena.netto) : 0;
    s.wzgledemStandardu = ref ? { netto: r2(s.wycena.netto - ref.wycena.netto), arkuszy: s.arkuszy - ref.arkuszy, formatek: s.formatek.zArkuszy - ref.formatek.zArkuszy } : null;
  }
  return { lista, best, ref, wybrana: rec };
}

// Krótkie scenariusze do matrycy decyzji: najtańszy, najmniej papieru, najmniej formatek (przelotów / pracy ręcznej), standard.
export function wyroznione(cmp) {
  const { best, ref } = cmp;
  const lista = cmp.lista.filter((s) => !s.wybrana);
  if (!lista.length) return cmp.wybrana ? [{ s: cmp.wybrana, role: ["wybrana"] }] : [];
  const minBy = (f) => lista.reduce((a, b) => (f(b) < f(a) || (f(b) === f(a) && b.wycena.netto < a.wycena.netto) ? b : a));
  const out = [];
  const push = (s, rola) => { if (!s) return; const e = out.find((o) => o.s === s); if (e) e.role.push(rola); else out.push({ s, role: [rola] }); };
  push(cmp.wybrana, "wybrana");
  push(best, "najtańsza sugestia");
  push(minBy((s) => s.arkuszy), "najmniej papieru");
  push(minBy((s) => s.formatek.zArkuszy), "najmniej formatek");
  push(ref, "standard SRA3+");
  return out;
}
