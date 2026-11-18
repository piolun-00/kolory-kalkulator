/* KALKULATOR POLIGRAFICZNY KHOREI — Copyright © 2026 Radosław Prośniak (KHOREI).
   Wszelkie prawa zastrzeżone. Licencja użytkowa: patrz LICENSE. */

// Przykładowa kartoteka papierów i stany startowe magazynu — do zastąpienia prawdziwymi danymi Kolorów.
// Keaykolour: marka Antalis (od 2023, przejęta od Arjowiggins), w Polsce przez Antalis Poland.
// Grubości (µm) wg karty technicznej Keaykolour Original: 120 g → 175, 250 g → 360, 300 g → 435, 450 g → 650;
// Parchment 170 g → 245. Format B1 700 × 1000, długie włókno (LG).
// CENY SĄ PRZYKŁADOWE — do podmiany na cennik dostawcy.

export const TYPY_PAPIERU = ["gładki", "tekstura", "bawełna", "metaliczny", "kreda", "offset"];

const kk = (id, kolor, gram, um, cena, typ = "tekstura") => ({
  id, nazwa: `Keaykolour ${kolor} ${gram} g`, producent: "Keaykolour", dostawca: "Antalis",
  kolor, gram, mikrony: um, typ, a: 700, b: 1000, wlokno: "dlugie", cenaDostawcy: cena,
});

export const PAPIERY_PRZYKLADOWE = [
  kk("kk-jetblack-300", "Jet Black", 300, 435, 9.8, "gładki"),
  kk("kk-jetblack-120", "Jet Black", 120, 175, 4.1, "gładki"),
  kk("kk-navy-300", "Navy Blue", 300, 435, 9.8),
  kk("kk-navy-450", "Navy Blue", 450, 650, 14.2),
  kk("kk-chinawhite-300", "China White", 300, 435, 8.9),
  kk("kk-chinawhite-120", "China White", 120, 175, 3.6),
  kk("kk-purewhite-250", "Pure White", 250, 360, 7.4),
  kk("kk-basalt-300", "Basalt", 300, 435, 9.8),
  kk("kk-matcha-300", "Matcha Tea", 300, 435, 9.8),
  kk("kk-pastelpink-300", "Pastel Pink", 300, 435, 9.8),
  kk("kk-oldrose-250", "Old Rose", 250, 360, 8.2),
  kk("kk-biscuit-300", "Biscuit", 300, 435, 9.8),
  kk("kk-cobblestone-250", "Cobblestone", 250, 360, 8.2),
  kk("kk-baltic-300", "Baltic Blue", 300, 435, 9.8),
  kk("kk-pumpkin-300", "Pumpkin", 300, 435, 9.8),
  kk("kk-parchment-170", "Parchment Natural", 170, 245, 5.6),
];

// Stany startowe magazynu wewnętrznego (resztki z innych zleceń, zwyżki) — przykład
export const STANY_STARTOWE = [
  ["kk-jetblack-300", 42, "Resztki po zleceniu wizytówek"],
  ["kk-navy-300", 8, "Zwyżka"],
  ["kk-chinawhite-300", 120, "Zapas"],
  ["kk-matcha-300", 3, "Resztka"],
  ["kk-parchment-170", 25, "Zapas"],
  ["kk-oldrose-250", 15, "Zwyżka po zaproszeniach"],
];
