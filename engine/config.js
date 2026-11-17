/* KALKULATOR POLIGRAFICZNY KHOREI — Copyright © 2026 Radosław Prośniak (KHOREI).
   Wszelkie prawa zastrzeżone. Licencja użytkowa: patrz LICENSE. */

// Ustawienia domyślne: maszyny, papiery, cenniki.
// Wszystko, co pracownik może zmienić w zakładkach „Maszyny” i „Cenniki”, siedzi tutaj — silnik nie ma liczb na sztywno.
// Wartości cenowe przeniesione 1:1 z arkusza „WunderWaffe” (wersja Mateusza, XI 2026).

export const MASZYNY = {
  // Xerox Proficio PX300 — dane producenta (broszura PX300, 2026):
  // arkusz standardowy maks. 330 × 488 mm, bypass do 330 × 660 mm, min. 98 × 148 mm (bypass) / 140 × 182 mm (szuflady 1–3),
  // gramatura 52–256 g (szuflady 1–3), 52–400 g (bypass, OHCF), dupleks automatyczny do 350 g, pasowanie ±0,5 mm do 300 g.
  // Arkusz wchodzi krótszym bokiem (SEF): krawędź wiodąca maks. 330 mm, długość w kierunku przebiegu maks. 488 mm.
  cyfra: {
    nazwa: "Xerox Proficio PX300",
    krawedzMax: 330,          // krawędź wiodąca (szerokość toru papieru)
    dlugoscMax: 488,          // długość arkusza w kierunku przebiegu — szuflady
    dlugoscMaxBypass: 660,    // bypass — wolniej, ręcznie, do 250 ark.
    minKrawedz: 98, minDlugosc: 148,
    gramMax: 400, gramMaxSzuflady: 256, gramMaxDupleks: 350,
    // Reguła włókna: od tej gramatury włókno musi biec RÓWNOLEGLE do krawędzi wiodącej (prostopadle do przebiegu, „krótkie włókno”).
    // Źródła: Xerox (Iridesse, dupleks na kartonie: włókno prostopadle do przebiegu), Lexmark (podawanie krótszym bokiem:
    // powyżej 135 g krótkie włókno). Próg do potwierdzenia przez operatora PX300.
    progWloknaGram: 135,
    margines: 7,              // margines formatki na każdym boku (arkusz: 14 mm łącznie — niedruk + znaczniki cięcia)
  },
  kaszerowanie: { nazwa: "Kaszerowanie ręczne", maxA: 500, maxB: 300 },
  sztancowanie: { nazwa: "Sztanca", maxA: 700, maxB: 500 },              // do B2
  sito:         { nazwa: "Sitodruk ręczny", maxA: 700, maxB: 500, montazMax: 4, margines: 7 },
  tloczenie:    { nazwa: "Hot stamping / suchy tłok", montazMax: 4, margines: 7 },
  letterpress:  { nazwa: "Letterpress", montazMax: 4, margines: 7 },
  // obcięcie krawędzi arkusza bazowego na bok (arkusz: 10 mm łącznie); wysokość stosu, który gilotyna tnie naraz — do potwierdzenia
  gilotyna:     { nazwa: "Gilotyna", obciecieArkusza: 5, wysokoscStosu: 80 },
};

export const PAPIER_FORMATY = [
  { id: "b1", nazwa: "B1 700 × 1000", a: 700, b: 1000 },
  { id: "b1+", nazwa: "B1+ 720 × 1020", a: 720, b: 1020 },
  { id: "sra3", nazwa: "SRA3 320 × 450", a: 320, b: 450 },
  { id: "sra3+", nazwa: "SRA3+ 330 × 488", a: 330, b: 488 },
  { id: "inny", nazwa: "Własny format", a: 700, b: 1000 },
];

export const WYCINKA = 3; // odstęp między użytkami (spady + rzaz), mm

// ===== Cenniki (arkusz „WunderWaffe”) =====
export const CENNIK = {
  marzaPapier: 0.3,
  vat: 0.23,
  cyfra: {
    minimalka: 30,
    progi: [20, 50, 100],                    // liczba arkuszy: ≤20 · ≤50 · ≤100 · więcej
    kolory: {                                // cena przelotu (arkusza) w każdym progu
      "0+0": [0, 0, 0, 0],
      "1+0": [1.5, 1.3, 1.0, 0.8],
      "1+1": [3.0, 2.6, 2.0, 1.6],
      "4+0": [3.0, 2.4, 1.9, 1.5],
      "4+1": [4.5, 3.7, 2.9, 2.3],
      "4+4": [6.0, 4.8, 3.8, 3.0],
    },
  },
  sito: {
    klisze: 70, swiecenie: 100, ustawienie: 30, minimalka: 325,
    przeloty: { "Jeden przelot": 1.5, "Dwa przeloty": 2, "Przelot, schnięcie, przelot": 2.5, "2× przelot i 1× przelot": 3.5, "4× przelot": 4.5 },
  },
  tloczenie: { matrycaCm2: 1.65, zapasMatrycyCm: 1, transport: 20, marzaMatryca: 1.5, ustawienie: 50, uderzenie: 0.7, minimalka: 380 },
  letterpress: { matrycaCm2: 0.7, matrycaMin: 60, matryc: 3, kliszaA5: 14, kliszeTransport: 17, kliszeMarza: 1.613, ustawienie: 75, mieszanieFarby: 0, uderzeniePierwszy: 2.5, uderzenieKolejny: 1.5 },
  // Cięcie: stała kwota za linię cięcia. Tryb "stos": linie × liczba stosów (gilotyna tnie stos naraz);
  // tryb "arkusz": linie × liczba arkuszy. Minimalka 30 zł = dotychczasowa stała kwota z arkusza.
  // DO USTALENIA: stawka za linię — 0,50 zł to wartość robocza.
  ciecie: { tryb: "stos", stawkaLinia: 0.5, minimalka: 30 },
  sztancowanie: { minimalka: 200, prog1: 400, prog2: 1000, cena1: 0.4, cena2: 0.3 },
  wykonczenie: {
    barwienieMin: 300, barwienieSzt: 1.7,
    bigowanieUst: 20, bigowanieSzt: 0.4,
    foliowanieUst: 30, foliowanieArk: 1.2,
    kaszerowanieDo20: 45, kaszerowanieKanapka: 1.8,
    laserUst: 50, laserSzt: 1,
    ploterArk: 10,
    oczkowanieUst: 20, oczkowanieSzt: 0.3,
    blonaArk: 4,
    rozkowanieSzt: 0.4,
    szycieUst: 20, szycieSzt: 0.4, szycieZszywek: 3,
    nfcSzt: 2.5,
    wiercenieUst: 20, wiercenieWsp: 1.5,
    edycjaGraficzna: 120,
    wycena: 10,
    wysylka: 20,
  },
};
