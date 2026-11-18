// Testy magazynu: przepływ magazyn wewnętrzny → bufor zlecenia → zwrot resztek.
import test from "node:test";
import assert from "node:assert/strict";
import { bazaStartowa, sprawdz, stanMagazynu, stanBufora, utworzZlecenie, przyjmijDostawe, zakonczZlecenie, anulujZlecenie, korekta, filtruj, pozycjeBufora } from "../engine/magazyn.js";
import { PAPIERY_PRZYKLADOWE, STANY_STARTOWE } from "../engine/papiery.js";

const start = () => bazaStartowa(PAPIERY_PRZYKLADOWE, STANY_STARTOWE);
const JB = "kk-jetblack-300"; // 42 ark. na starcie

test("Sprawdzenie dostępności: 42 w magazynie, potrzeba 50 → 42 z magazynu, 8 domówić", () => {
  assert.deepEqual(sprawdz(start(), JB, 50), { dostepne: 42, potrzeba: 50, zMagazynu: 42, domowic: 8 });
  assert.deepEqual(sprawdz(start(), JB, 7), { dostepne: 42, potrzeba: 7, zMagazynu: 7, domowic: 0 });
});

test("Zlecenie przenosi papier z magazynu wewnętrznego do bufora", () => {
  const { db, id, numer } = utworzZlecenie(start(), { nazwa: "Wizytówki", pozycje: [{ papierId: JB, potrzeba: 10 }] });
  assert.match(numer, /^ZL\/\d{4}\/001$/);
  assert.equal(stanMagazynu(db, JB), 32);
  assert.equal(stanBufora(db, id, JB), 10);
});

test("Dostawa domówionego papieru trafia do bufora zlecenia", () => {
  let { db, id } = utworzZlecenie(start(), { pozycje: [{ papierId: JB, potrzeba: 50 }] });
  assert.equal(db.zlecenia[0].pozycje[0].domowic, 8);
  db = przyjmijDostawe(db, id, JB, 8);
  assert.equal(stanBufora(db, id, JB), 50);
  assert.equal(stanMagazynu(db, JB), 0);
});

test("Zakończenie: „zostało +6” wraca do magazynu wewnętrznego, bufor pusty", () => {
  let { db, id } = utworzZlecenie(start(), { pozycje: [{ papierId: JB, potrzeba: 10 }] });
  db = zakonczZlecenie(db, id, { [JB]: 6 });
  assert.equal(stanBufora(db, id, JB), 0);
  assert.equal(stanMagazynu(db, JB), 32 + 6);
  const p = db.zlecenia[0].pozycje[0];
  assert.equal(p.zuzyto, 4);
  assert.equal(p.zwrot, 6);
  assert.equal(db.zlecenia[0].status, "zakończone");
  assert.equal(pozycjeBufora(db).length, 0);
});

test("Anulowanie: cały bufor wraca do magazynu", () => {
  let { db, id } = utworzZlecenie(start(), { pozycje: [{ papierId: JB, potrzeba: 10 }] });
  db = anulujZlecenie(db, id);
  assert.equal(stanMagazynu(db, JB), 42);
  assert.equal(stanBufora(db, id, JB), 0);
});

test("Korekta po inwentaryzacji i historia ruchów", () => {
  const db = korekta(start(), JB, -2, "Inwentaryzacja");
  assert.equal(stanMagazynu(db, JB), 40);
  assert.equal(db.ruchy.filter((r) => r.papierId === JB).length, 2);
});

test("Filtry: nazwa, format, kolor, gramatura, typ, tylko na stanie", () => {
  const db = start();
  const P = db.papiery;
  assert.equal(filtruj(P, { szukaj: "navy" }).length, 2);
  assert.equal(filtruj(P, { format: "700x1000" }).length, P.length);
  assert.equal(filtruj(P, { kolor: "Jet Black" }).length, 2);
  assert.equal(filtruj(P, { gramMin: 300, gramMax: 300 }).length, 9);
  assert.equal(filtruj(P, { typy: ["gładki"] }).length, 2);
  assert.equal(filtruj(P, { tylkoNaStanie: true }, (id) => stanMagazynu(db, id)).length, 6);
});
