/* KALKULATOR POLIGRAFICZNY KHOREI — Copyright © 2026 Radosław Prośniak (KHOREI).
   Wszelkie prawa zastrzeżone. Licencja użytkowa: patrz LICENSE. */

// MAGAZYN PAPIERU
// Dwa segmenty:
//   • magazyn wewnętrzny — papiery z innych zleceń, zwyżki, „fuckupy”, zapas; z niego bierzemy w pierwszej kolejności,
//   • bufor — osobny regał: papier przypisany do konkretnego zlecenia (z magazynu albo z dostawy).
// Stan nie jest „liczbą w komórce”, tylko sumą RUCHÓW (przyjęcie, rezerwacja, dostawa, zużycie, zwrot, korekta).
// Dzięki temu każdy arkusz ma historię, a stan zawsze da się odtworzyć i sprawdzić.
// Wszystkie funkcje są czyste: dostają bazę i zwracają NOWĄ bazę — interfejs i przyszła wspólna baza danych
// (dla wszystkich pracowników Kolorów) używają tej samej logiki.

const nid = (p = "r") => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const teraz = () => new Date().toISOString();
const kopia = (db) => ({ papiery: [...db.papiery], ruchy: [...db.ruchy], zlecenia: db.zlecenia.map((z) => ({ ...z, pozycje: z.pozycje.map((p) => ({ ...p })) })), licznik: db.licznik || 0 });

export const pustaBaza = () => ({ papiery: [], ruchy: [], zlecenia: [], licznik: 0 });

// Baza startowa z przykładową kartoteką i stanami
export function bazaStartowa(papiery, stany) {
  let db = { ...pustaBaza(), papiery: papiery.map((p) => ({ ...p })) };
  for (const [id, n, opis] of stany) db = przyjmij(db, id, n, opis || "Stan początkowy");
  return db;
}

// ===== Stany =====
const ruch = (db, r) => { db.ruchy.push({ id: nid(), data: teraz(), ...r }); };
export const stanMagazynu = (db, papierId) => db.ruchy.reduce((a, r) => (r.segment === "magazyn" && r.papierId === papierId ? a + r.ilosc : a), 0);
export const stanBufora = (db, zlecenieId, papierId) => db.ruchy.reduce((a, r) => (r.segment === "bufor" && r.zlecenieId === zlecenieId && (!papierId || r.papierId === papierId) ? a + r.ilosc : a), 0);

// Wszystkie pozycje bufora: zlecenie × papier, tylko niezerowe
export function pozycjeBufora(db) {
  const m = new Map();
  for (const r of db.ruchy) if (r.segment === "bufor") { const k = `${r.zlecenieId}|${r.papierId}`; m.set(k, (m.get(k) || 0) + r.ilosc); }
  return [...m.entries()].filter(([, n]) => n !== 0).map(([k, ilosc]) => { const [zlecenieId, papierId] = k.split("|"); return { zlecenieId, papierId, ilosc }; });
}

// Ile mamy i ile trzeba domówić — bierzemy z magazynu wewnętrznego, ile się da
export function sprawdz(db, papierId, potrzeba) {
  const dostepne = Math.max(0, stanMagazynu(db, papierId));
  const zMagazynu = Math.min(dostepne, Math.max(0, potrzeba));
  return { dostepne, potrzeba, zMagazynu, domowic: Math.max(0, potrzeba - zMagazynu) };
}

// ===== Operacje =====
export function dodajPapier(db, p) {
  const n = kopia(db);
  const id = p.id || nid("p");
  n.papiery.push({ ...p, id });
  return n;
}
export function edytujPapier(db, id, patch) {
  const n = kopia(db);
  n.papiery = n.papiery.map((p) => (p.id === id ? { ...p, ...patch, id } : p));
  return n;
}

// Przyjęcie papieru do magazynu wewnętrznego (zapas, zwyżka, resztka spoza systemu)
export function przyjmij(db, papierId, ilosc, opis = "Przyjęcie") {
  const n = kopia(db);
  ruch(n, { segment: "magazyn", papierId, ilosc: Math.round(ilosc), typ: "przyjecie", opis });
  return n;
}
// Korekta stanu po inwentaryzacji (+ lub −), z opisem
export function korekta(db, papierId, delta, opis = "Korekta") {
  const n = kopia(db);
  ruch(n, { segment: "magazyn", papierId, ilosc: Math.round(delta), typ: "korekta", opis });
  return n;
}

// Nowe zlecenie: dla każdego papieru przenosimy z magazynu do bufora tyle, ile jest; resztę oznaczamy „do domówienia”.
// pozycje: [{ papierId, potrzeba }]
export function utworzZlecenie(db, { nazwa, klient, pozycje, wycena = null }) {
  const n = kopia(db);
  n.licznik = (n.licznik || 0) + 1;
  const rok = new Date().getFullYear();
  const id = nid("z");
  const numer = `ZL/${rok}/${String(n.licznik).padStart(3, "0")}`;
  const poz = pozycje.filter((p) => p.papierId && p.potrzeba > 0).map((p) => {
    const s = sprawdz(n, p.papierId, Math.ceil(p.potrzeba));
    if (s.zMagazynu > 0) {
      ruch(n, { segment: "magazyn", papierId: p.papierId, ilosc: -s.zMagazynu, typ: "rezerwacja", zlecenieId: id, opis: `Do bufora — ${numer}` });
      ruch(n, { segment: "bufor", papierId: p.papierId, ilosc: s.zMagazynu, typ: "rezerwacja", zlecenieId: id, opis: `Z magazynu wewnętrznego` });
    }
    return { papierId: p.papierId, potrzeba: s.potrzeba, zMagazynu: s.zMagazynu, domowic: s.domowic, przyjeto: 0 };
  });
  n.zlecenia.push({ id, numer, nazwa: nazwa || "", klient: klient || "", status: "w realizacji", utworzone: teraz(), pozycje: poz, wycena });
  return { db: n, id, numer };
}

// Dostawa domówionego papieru — prosto do bufora zlecenia
export function przyjmijDostawe(db, zlecenieId, papierId, ilosc) {
  const n = kopia(db);
  const z = n.zlecenia.find((x) => x.id === zlecenieId);
  if (!z) return n;
  const p = z.pozycje.find((x) => x.papierId === papierId);
  if (p) p.przyjeto = (p.przyjeto || 0) + Math.round(ilosc);
  ruch(n, { segment: "bufor", papierId, ilosc: Math.round(ilosc), typ: "dostawa", zlecenieId, opis: `Dostawa — ${z.numer}` });
  return n;
}

// Koniec zlecenia: to, co zostało (np. +6 ark.), wraca do magazynu wewnętrznego; reszta bufora = zużycie.
// zostalo: { [papierId]: liczba }
export function zakonczZlecenie(db, zlecenieId, zostalo = {}) {
  const n = kopia(db);
  const z = n.zlecenia.find((x) => x.id === zlecenieId);
  if (!z || z.status === "zakończone") return n;
  const ids = new Set([...z.pozycje.map((p) => p.papierId), ...Object.keys(zostalo)]);
  for (const papierId of ids) {
    const wBuforze = stanBufora(n, zlecenieId, papierId);
    const zwrot = Math.max(0, Math.round(zostalo[papierId] || 0));
    if (wBuforze) ruch(n, { segment: "bufor", papierId, ilosc: -wBuforze, typ: "zuzycie", zlecenieId, opis: `Zamknięcie bufora — ${z.numer}` });
    if (zwrot) ruch(n, { segment: "magazyn", papierId, ilosc: zwrot, typ: "zwrot", zlecenieId, opis: `Zostało po ${z.numer}` });
    const p = z.pozycje.find((x) => x.papierId === papierId);
    if (p) { p.zuzyto = Math.max(0, wBuforze - zwrot); p.zwrot = zwrot; }
  }
  z.status = "zakończone";
  z.zakonczone = teraz();
  return n;
}

// Anulowanie zlecenia: cały bufor wraca do magazynu wewnętrznego
export function anulujZlecenie(db, zlecenieId) {
  const n = kopia(db);
  const z = n.zlecenia.find((x) => x.id === zlecenieId);
  if (!z || z.status !== "w realizacji") return n;
  for (const p of z.pozycje) {
    const wBuforze = stanBufora(n, zlecenieId, p.papierId);
    if (wBuforze) {
      ruch(n, { segment: "bufor", papierId: p.papierId, ilosc: -wBuforze, typ: "anulowanie", zlecenieId, opis: `Anulowanie — ${z.numer}` });
      ruch(n, { segment: "magazyn", papierId: p.papierId, ilosc: wBuforze, typ: "anulowanie", zlecenieId, opis: `Powrót z bufora — ${z.numer}` });
    }
  }
  z.status = "anulowane";
  return n;
}

// ===== Filtry kartoteki / magazynu =====
// f = { szukaj, format: "700x1000" | "", kolor, gramMin, gramMax, typy: [] , tylkoNaStanie }
export const kluczFormatu = (p) => `${Math.min(p.a, p.b)}x${Math.max(p.a, p.b)}`;
export function filtruj(papiery, f = {}, stanFn = null) {
  const q = (f.szukaj || "").trim().toLowerCase();
  return papiery.filter((p) =>
    (!q || `${p.nazwa} ${p.kolor} ${p.producent} ${p.dostawca}`.toLowerCase().includes(q)) &&
    (!f.format || kluczFormatu(p) === f.format) &&
    (!f.kolor || p.kolor === f.kolor) &&
    (!f.gramMin || p.gram >= f.gramMin) &&
    (!f.gramMax || p.gram <= f.gramMax) &&
    (!f.typy?.length || f.typy.includes(p.typ)) &&
    (!f.tylkoNaStanie || !stanFn || stanFn(p.id) > 0));
}
