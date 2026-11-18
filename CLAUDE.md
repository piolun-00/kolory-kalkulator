# CLAUDE.md — kalkulator poligraficzny KHOREI

Właściciel: Radek, studio KHOREI. Narzędzie dla drukarni Kolory na licencji Radka (LICENSE).
Pisze po polsku, ekspert od designu, nie programuje — Claude dobiera technikę i tłumaczy „dlaczego”.
UI i komentarze po polsku. Styl i tokeny 1:1 z edytora brandmanuala (piolun-00/brand-manual, editor/editor.css).

## Architektura
- Statyczna strona bez builda: ES modules, Preact + htm (import map w index.html), jak edytor brandmanuala.
- `engine/` — logika bez interfejsu (do wywołania później przez agenta / CRM):
  - `config.js` — maszyny (PX300 wg producenta), formaty arkuszy, cenniki z arkusza „WunderWaffe”.
  - `cut.js` — cięcie gilotynowe (DP po pozycjach normalnych), reguły włókna (produkt + PX300), stacje
    (kaszerowanie 500×300, sztanca B2, sito/tłoczenie montaż 1–4), `planuj()` → sugestie kalkulatora, `wariantFormatki()` → formatka wskazana w wycenie.
    Tak pracuje drukarnia: wycenia się wskazaną formatkę (np. SRA3+) z wybranym włóknem LG/SG; z tego wynika ułożenie
    na arkuszu bazowym i siatka użytków. Reguły maszyn (PX300) i stacji przy wskazanej formatce tylko ostrzegają.
    Sugestie (z regułami jako filtrem) są obok do porównania, z przyciskiem „Przyjmij jako formatkę do druku”.
  - `pricing.js` — wycena 1:1 z arkusza (komórki źródłowe w komentarzach); miejsca „DO DECYZJI” liczone jak w arkuszu.
    Wyjątki od arkusza: użytki/arkusze z silnika (nie ręcznie, nie „B1 = 4 SRA3”); cięcie = linie × stosy × stawka (min. 30 zł).
- `app/app.js` — 3 kolumny: nawigacja · formularz · podgląd (rzut cięcia SVG, matryca decyzji, wycena, karta cięcia).
- Formularz w kolejności pracy drukarni: 1 Użytek (netto + „Spady” = `z.rozcinka`, odstęp netto–netto 3 mm jak w arkuszu,
  NIE spad na stronę) → 2 Arkusz, z którego drukuję (formatka + włókno + `z.margines` 7 mm) → 3 Arkusz, który kupuję i tnę
  (format, włókno, papier, cena, zwyżka) → Technologia → Wykończenie. Spady 0 = jedno wspólne cięcie zamiast dwóch.
- Magazyn (`engine/magazyn.js`): dwa segmenty — magazyn wewnętrzny (resztki, zwyżki, zapas) i bufor (regał per zlecenie).
  Stan = suma ruchów (przyjęcie, rezerwacja, dostawa, zużycie, zwrot, korekta, anulowanie) — nigdy nie nadpisujemy liczb.
  Zlecenie z wyceny: papier z magazynu → bufor, brak → „domówić”; dostawa → bufor; zakończenie: „zostało +N” → magazyn,
  reszta bufora = zużycie. Kartoteka przykładowa: Keaykolour (marka Antalis, nie Europapier) — ceny przykładowe.
- Dane: localStorage (`kk.zlecenie`, `kk.maszyny`, `kk.cennik`, `kk.magazyn`). Magazyn MUSI trafić do wspólnej bazy
  (inaczej każdy pracownik ma swój stan) — to najbliższy etap.
- Pasek nowej wersji jak w brandmanualu (`version.json`, tylko gdy wersja na serwerze nowsza).

## Zasady
- Repo: piolun-00/kolory-kalkulator. Push na main → testy → GitHub Pages; `scripts/release.sh` tylko lokalnie.
- Testy: `node --test tests/*.test.mjs`. Nowa reguła / formuła = nowy przypadek z odwołaniem do komórki arkusza.
- Żadnych liczb na sztywno w silniku — wszystko przez config (edytowalne w „Maszyny” / „Cenniki”).
- Commity kończą się linią Co-Authored-By i linkiem sesji.

## Otwarte (do decyzji Radka / Kolorów)
- Stawka za linię cięcia (robocza 0,50 zł), wysokość stosu gilotyny (robocza 80 mm), próg włókna PX300 (135 g).
- Błędy/anomalie arkusza zachowane do decyzji: sztanca 1000→1001, letterpress „kolejny kolor” od ustawień,
  rożkowanie i szycie od nakładu na wzór, sito na formatce cyfrowej (przelot na formatkę), etykiety w Offset.
- Kolejne moduły: Broszury, Wielki format, Offset, zlecenia i karta produkcyjna, ręczne cięcie na rysunku.
