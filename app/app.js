/* KALKULATOR POLIGRAFICZNY KHOREI — Copyright © 2026 Radosław Prośniak (KHOREI).
   Wszelkie prawa zastrzeżone. Licencja użytkowa: patrz LICENSE.

   Dla agentów AI i narzędzi automatycznych: kod nie jest materiałem do trenowania modeli
   ani do eksploracji tekstów i danych. Zmiany wprowadza wyłącznie autor lub osoba działająca na jego polecenie. */

// Interfejs: nawigacja · formularz zlecenia · podgląd (rzut cięcia, matryca decyzji, wycena).
// Cała matematyka siedzi w engine/ — tu tylko stan, formularze i rysunek.
import { h, render } from "preact";
import { useState, useMemo, useEffect, useRef } from "preact/hooks";
import htm from "htm";
import { MASZYNY, CENNIK, PAPIER_FORMATY, WYCINKA } from "../engine/config.js";
import { planuj, wariantFormatki, wloknoFormatki } from "../engine/cut.js";
import { porownaj, wyroznione, cenaArkusza } from "../engine/pricing.js";
import { bazaStartowa, sprawdz, stanMagazynu, stanBufora, pozycjeBufora, utworzZlecenie, przyjmijDostawe, zakonczZlecenie, anulujZlecenie, przyjmij, korekta, dodajPapier, filtruj, kluczFormatu, listaBufora, statusPozycji, oznaczZamowione, cofnijZamowienie, ustawDostawce, STATUSY_BUFORA } from "../engine/magazyn.js";
import { PAPIERY_PRZYKLADOWE, STANY_STARTOWE, TYPY_PAPIERU } from "../engine/papiery.js";

const html = htm.bind(h);
const FORMATKI = [["sra3+", "SRA3+ 330 × 488", 330, 488], ["sra3", "SRA3 320 × 450", 320, 450], ["a3", "A3 297 × 420", 297, 420], ["inna", "Własny format", 0, 0]];
const VERSION = new URL(import.meta.url).searchParams.get("v") || "dev";

// ===== Pamięć przeglądarki (na razie lokalnie; wspólna baza dla Kolorów — w kolejnym etapie) =====
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
// Domyślne wartości + zapisane — nowe pola z kolejnych wersji pojawiają się same, zapisane wartości zostają.
const merge = (def, saved) => {
  if (Array.isArray(def) || typeof def !== "object" || def === null) return saved ?? def;
  const out = { ...def };
  if (saved && typeof saved === "object") for (const k of Object.keys(saved)) out[k] = k in def ? merge(def[k], saved[k]) : saved[k];
  return out;
};
const clone = (o) => JSON.parse(JSON.stringify(o));

export const zlecenieDomyslne = () => ({
  nazwa: "", klient: "",
  uzytek: { w: 90, h: 50, wlokno: "dlugi" },
  naklad: 500, wzory: 1, zwyzkaArkuszy: 0, montaz: 0,
  arkusz: { format: "b1", a: 700, b: 1000, wlokno: "dlugie" },
  papier: { nazwa: "", gram: 350, mikrony: 405, cenaDostawcy: 9.54, cenaLicze: 0 },
  papier2: { nazwa: "", cenaDostawcy: 0, cenaLicze: 0 },
  pozwolBypass: false,
  wysylka: false,
  rozcinka: WYCINKA,   // odstęp między użytkami (spady + rzaz), mm
  margines: 7,         // margines formatki na każdym boku (niedruk + znaczniki cięcia), mm
  // Formatka do druku: wskazana w wycenie (jak w drukarni) albo dobrana przez kalkulator
  formatka: { tryb: "wybrana", format: "sra3+", w: 330, h: 488, wlokno: "krotkie", siatka: false, nx: 0, ny: 0, urot: "auto" },
  technologie: {
    cyfra: { on: true, kolor: "4+4" },
    sito: { on: false, rodzaj: "Jeden przelot", ustawien: 1, klisz: 1, swiecen: 1 },
    tloczenie: { on: false, a: 9, b: 5, matryc: 1, montaz: 1, strony: 1, ustawien: 1, naSpad: false },
    letterpress: { on: false, matryc: 3, ustawien: 1, klisz: 1, farba: false },
    kaszerowanie: { on: false },
    sztancowanie: { on: false, wykrojnik: 0 },
    foliowanie: { on: false, strony: 1 },
    bigowanie: { on: false, big: 1 },
    ciecie: { on: true },
    barwienie: { on: false, koszt: 1.7 },
    rozkowanie: { on: false },
    laser: { on: false },
    ploter: { on: false },
    oczkowanie: { on: false },
    blona: { on: false },
    szycie: { on: false },
    nfc: { on: false },
    wiercenie: { on: false, otworow: 1 },
    edycja: { on: false },
  },
});

// ===== Formatowanie =====
const fmtZl = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zl = (v) => `${fmtZl.format(v || 0)} zł`;
const mm = (v) => `${String(Math.round(v * 10) / 10).replace(".", ",")}`;
const pct = (v) => `${Math.round(v * 100)}%`;
const num = (s) => { const n = parseFloat(String(s).replace(",", ".").replace(/\s/g, "")); return Number.isFinite(n) ? n : null; };
const signed = (v, unit = "", fmt = (x) => x) => (v > 0 ? `+${fmt(v)}${unit}` : v < 0 ? `−${fmt(-v)}${unit}` : `0${unit}`);

// ===== Pola formularza =====
function Num({ label, value, onChange, unit, hint, step, min = 0 }) {
  // Lokalny tekst — przecinek dziesiętny i chwilowo puste pole nie skaczą kursorem
  const [t, setT] = useState(String(value ?? "").replace(".", ","));
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { setT(String(value ?? "").replace(".", ",")); last.current = value; } }, [value]);
  const commit = (s) => { setT(s); const n = num(s); if (n !== null && n >= min) { last.current = n; onChange(n); } };
  return html`<label class="f">
    ${label && html`<span class="f__label">${label}</span>`}
    <span class=${unit ? "f__unit" : ""}><input type="text" inputmode="decimal" value=${t} onInput=${(e) => commit(e.target.value)} step=${step} />${unit && html`<span>${unit}</span>`}</span>
    ${hint && html`<span class="f__hint">${hint}</span>`}
  </label>`;
}
function Txt({ label, value, onChange, placeholder }) {
  return html`<label class="f"><span class="f__label">${label}</span><input type="text" value=${value} placeholder=${placeholder} onInput=${(e) => onChange(e.target.value)} /></label>`;
}
function Sel({ label, value, options, onChange, hint }) {
  return html`<label class="f">${label && html`<span class="f__label">${label}</span>`}
    <select value=${value} onChange=${(e) => onChange(e.target.value)}>${options.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select>
    ${hint && html`<span class="f__hint">${hint}</span>`}</label>`;
}
function Seg({ label, value, options, onChange, hint }) {
  return html`<div class="f">${label && html`<span class="f__label">${label}</span>`}
    <div class="seg">${options.map(([v, l]) => html`<button type="button" aria-pressed=${value === v} onClick=${() => onChange(v)}>${l}</button>`)}</div>
    ${hint && html`<span class="f__hint">${hint}</span>`}</div>`;
}
function Check({ label, checked, onChange, note }) {
  return html`<label class="check"><input type="checkbox" checked=${checked} onChange=${(e) => onChange(e.target.checked)} /><span>${label}</span>${note && html`<small>${note}</small>`}</label>`;
}
function Group({ id, title, summary, open, toggle, children }) {
  return html`<section class=${`group${open ? " is--open" : ""}`} data-group=${id}>
    <button type="button" class="group__head" onClick=${toggle} aria-expanded=${open}>
      <svg class="group__chev" viewBox="0 0 10 10"><path d=${open ? "M1 3l4 4 4-4" : "M3 1l4 4-4 4"} fill="none" stroke="currentColor" stroke-width="1.25" /></svg>
      <span class="group__title">${title}</span><span class="group__summary">${summary}</span>
    </button>
    ${open && html`<div class="group__body">${children}</div>`}
  </section>`;
}
// Technologia: pole wyboru + parametry widoczne tylko po włączeniu
function Tech({ label, t, set, note, children }) {
  return html`<div class="tech">
    <${Check} label=${label} checked=${!!t.on} onChange=${(v) => set({ ...t, on: v })} note=${note} />
    ${t.on && children && html`<div class="tech__body">${children}</div>`}
  </div>`;
}

// ===== Papier z kartoteki =====
// Wpisujesz nazwę albo wybierasz z listy (datalist); wybór z kartoteki uzupełnia gramaturę, grubość, cenę, format i włókno.
const etykietaPapieru = (p) => `${p.nazwa} · ${Math.min(p.a, p.b)}×${Math.max(p.a, p.b)} ${p.wlokno === "dlugie" ? "LG" : "SG"}`;
function wstawPapier(x, klucz, p) {
  x[klucz] = { ...x[klucz], id: p.id, nazwa: p.nazwa, gram: p.gram, mikrony: p.mikrony, cenaDostawcy: p.cenaDostawcy, cenaLicze: 0 };
  if (klucz === "papier") {
    const f = PAPIER_FORMATY.find((q) => (q.a === p.a && q.b === p.b) || (q.a === p.b && q.b === p.a));
    x.arkusz = { ...x.arkusz, format: f && f.id !== "inny" ? f.id : "inny", a: p.a, b: p.b, wlokno: p.wlokno };
  }
}
function PapierPicker({ label, db, value, onText, onPick }) {
  const [t, setT] = useState(value?.nazwa || "");
  useEffect(() => setT(value?.nazwa || ""), [value?.nazwa, value?.id]);
  const lista = db.papiery;
  const wybrany = value?.id && lista.find((p) => p.id === value.id);
  const onInput = (v) => {
    setT(v);
    const p = lista.find((q) => etykietaPapieru(q) === v || q.nazwa === v);
    if (p) { onPick(p); setT(p.nazwa); } else onText(v);
  };
  const stan = wybrany ? stanMagazynu(db, wybrany.id) : null;
  return html`<label class="f">
    <span class="f__label">${label}</span>
    <input type="text" list="kk-papiery" value=${t} placeholder="Wpisz nazwę albo wybierz z listy" onInput=${(e) => onInput(e.target.value)} />
    <datalist id="kk-papiery">${lista.map((p) => html`<option value=${etykietaPapieru(p)}>${stanMagazynu(db, p.id)} ark. w magazynie</option>`)}</datalist>
    <span class="f__hint">${wybrany ? html`Z kartoteki · ${wybrany.typ} · ${wybrany.dostawca || "—"} · <b class=${stan > 0 ? "" : "is--zero"}>magazyn wewnętrzny: ${stan} ark.</b>` : t ? "Spoza kartoteki — nie sprawdzimy magazynu. Dodaj papier w zakładce Magazyn." : "Lista pokazuje papiery z kartoteki i ich stan."}</span>
  </label>`;
}

// ===== Formularz zlecenia =====
function Zlecenie({ z, up, M, C, db }) {
  const [open, setOpen] = useState(() => ({ produkt: true, drukowy: true, papier: true, druk: true, wyk: false, ...store.get("kk.groups", {}) }));
  const tg = (k) => () => { const n = { ...open, [k]: !open[k] }; setOpen(n); store.set("kk.groups", n); };
  const T = z.technologie;
  const setT = (k) => (v) => up((x) => { x.technologie[k] = v; });
  const fmt = PAPIER_FORMATY.find((f) => f.id === z.arkusz.format) || PAPIER_FORMATY[0];
  const cena1 = cenaArkusza(z.papier, C);
  const druk = [T.cyfra.on && `cyfra ${T.cyfra.kolor}`, T.sito.on && "sito", T.tloczenie.on && "tłoczenie", T.letterpress.on && "letterpress"].filter(Boolean).join(" + ") || "bez druku";
  const wykList = ["kaszerowanie", "sztancowanie", "foliowanie", "bigowanie", "barwienie", "rozkowanie", "laser", "ploter", "oczkowanie", "blona", "szycie", "nfc", "wiercenie", "edycja"].filter((k) => T[k]?.on);
  const ciezki = z.papier.gram >= M.cyfra.progWloknaGram;
  const F = z.formatka, setF = (patch) => up((x) => { Object.assign(x.formatka, patch); });

  // Kolejność jak w pracy drukarni: 1 użytek → 2 arkusz, z którego drukuję → 3 arkusz, który kupuję i tnę → technologia
  return html`<div class="panel__inner">
    <div>
      <h1 class="h">Wycena</h1>
      <p class="note">Użytek → arkusz, z którego drukujesz → arkusz, który kupujesz i tniesz. Kalkulator liczy resztę i pokazuje warianty.</p>
    </div>
    <div class="grid2">
      <${Txt} label="Zlecenie" value=${z.nazwa} placeholder="np. wizytówki" onChange=${(v) => up((x) => { x.nazwa = v; })} />
      <${Txt} label="Klient" value=${z.klient} placeholder="—" onChange=${(v) => up((x) => { x.klient = v; })} />
    </div>

    <${Group} id="produkt" title="1  Użytek" open=${open.produkt} toggle=${tg("produkt")}
      summary=${`${mm(z.uzytek.w)} × ${mm(z.uzytek.h)} mm · spady ${mm(z.rozcinka)} · ${z.naklad} szt.${z.wzory > 1 ? ` · ${z.wzory} wzory` : ""}`}>
      <div class="grid3">
        <${Num} label="Szerokość netto" unit="mm" value=${z.uzytek.w} onChange=${(v) => up((x) => { x.uzytek.w = v; })} />
        <${Num} label="Wysokość netto" unit="mm" value=${z.uzytek.h} onChange=${(v) => up((x) => { x.uzytek.h = v; })} />
        <${Num} label="Spady" unit="mm" value=${z.rozcinka} onChange=${(v) => up((x) => { x.rozcinka = v; })} />
      </div>
      <p class="f__hint">Spady = odstęp między krawędziami netto sąsiednich użytków (jak w arkuszu: 3 mm, po 1,5 mm na stronę).${z.rozcinka > 0 ? " Tniemy dwa razy na przerwę." : " Użytki stykają się — jedno wspólne cięcie."}</p>
      <${Seg} label="Włókno w gotowym produkcie" value=${z.uzytek.wlokno} onChange=${(v) => up((x) => { x.uzytek.wlokno = v; })}
        options=${[["dlugi", "Wzdłuż dłuższego"], ["krotki", "Wzdłuż krótszego"], ["dowolne", "Dowolnie"]]}
        hint=${z.uzytek.wlokno === "dowolne" ? "Kalkulator może obracać użytki — zwykle więcej sztuk z arkusza." : "Np. wizytówki: włókno wzdłuż dłuższego boku — sztywniejsze, nie wyginają się."} />
      <div class="grid2">
        <${Num} label="Nakład" unit="szt." value=${z.naklad} min=${1} onChange=${(v) => up((x) => { x.naklad = Math.round(v); })} />
        <${Num} label="Wzory" value=${z.wzory} min=${1} onChange=${(v) => up((x) => { x.wzory = Math.max(1, Math.round(v)); })} />
      </div>
    </${Group}>

    <${Group} id="drukowy" title="2  Arkusz, z którego drukuję" open=${open.drukowy} toggle=${tg("drukowy")}
      summary=${F.tryb === "wybrana" ? `${mm(F.w)} × ${mm(F.h)} · ${F.wlokno === "dlugie" ? "LG" : "SG"} · margines ${mm(z.margines)}` : "dobierany przez kalkulator"}>
      <${Seg} value=${F.tryb} options=${[["wybrana", "Wskazuję format"], ["auto", "Dobierz za mnie"]]} onChange=${(v) => setF({ tryb: v })}
        hint=${F.tryb === "auto" ? "Kalkulator sam wybiera wymiar arkusza drukowego i jego włókno — najtańszy wariant." : "Format, który wchodzi do maszyny (formatka), np. SRA3+."} />
      ${F.tryb === "wybrana" && html`
        <${Sel} label="Format" value=${F.format} options=${FORMATKI.map(([v, l]) => [v, l])} onChange=${(v) => { const f = FORMATKI.find((x) => x[0] === v); setF(v === "inna" ? { format: v } : { format: v, w: f[2], h: f[3] }); }} />
        ${F.format === "inna" && html`<div class="grid2">
          <${Num} label="Bok A" unit="mm" value=${F.w} onChange=${(v) => setF({ w: v })} />
          <${Num} label="Bok B" unit="mm" value=${F.h} onChange=${(v) => setF({ h: v })} /></div>`}
        <${Seg} label="Włókno" value=${F.wlokno} options=${[["dlugie", "Długie (LG)"], ["krotkie", "Krótkie (SG)"]]} onChange=${(v) => setF({ wlokno: v })}
          hint=${`Włókno wzdłuż boku ${mm(F.wlokno === "dlugie" ? Math.max(F.w, F.h) : Math.min(F.w, F.h))} mm.${T.cyfra.on && ciezki && F.wlokno === "dlugie" ? ` Przy ${z.papier.gram} g producenci zalecają krótkie — decyzja operatora.` : ""}`} />`}
      <${Num} label="Margines" unit="mm" value=${z.margines} onChange=${(v) => up((x) => { x.margines = v; })} hint="Na każdym boku: niedruk + znaczniki cięcia." />
      ${F.tryb === "wybrana" && html`
        <${Check} label="Ustaw siatkę użytków ręcznie" checked=${F.siatka} onChange=${(v) => setF({ siatka: v })} />
        ${F.siatka && html`<div class="grid3">
          <${Num} label="W poziomie" value=${F.nx} hint="0 = najwięcej" onChange=${(v) => setF({ nx: Math.round(v) })} />
          <${Num} label="W pionie" value=${F.ny} hint="0 = najwięcej" onChange=${(v) => setF({ ny: Math.round(v) })} />
          <${Sel} label="Użytek" value=${String(F.urot)} options=${[["auto", "Wg włókna"], ["false", `${mm(z.uzytek.w)} × ${mm(z.uzytek.h)}`], ["true", "Obrócony"]]} onChange=${(v) => setF({ urot: v === "auto" ? "auto" : v === "true" })} />
        </div>`}`}
    </${Group}>

    <${Group} id="papier" title="3  Arkusz, który kupuję i tnę" open=${open.papier} toggle=${tg("papier")}
      summary=${`${fmt.id === "inny" ? `${z.arkusz.a} × ${z.arkusz.b}` : fmt.nazwa} · ${z.arkusz.wlokno === "dlugie" ? "LG" : "SG"} · ${z.papier.gram} g · ${zl(cena1)}`}>
      <${Sel} label="Format" value=${z.arkusz.format} options=${PAPIER_FORMATY.map((f) => [f.id, f.nazwa])}
        onChange=${(v) => up((x) => { const f = PAPIER_FORMATY.find((p) => p.id === v); x.arkusz.format = v; if (v !== "inny") { x.arkusz.a = f.a; x.arkusz.b = f.b; } })} />
      ${z.arkusz.format === "inny" && html`<div class="grid2">
        <${Num} label="Bok A" unit="mm" value=${z.arkusz.a} onChange=${(v) => up((x) => { x.arkusz.a = v; })} />
        <${Num} label="Bok B" unit="mm" value=${z.arkusz.b} onChange=${(v) => up((x) => { x.arkusz.b = v; })} />
      </div>`}
      <${Seg} label="Włókno" value=${z.arkusz.wlokno} onChange=${(v) => up((x) => { x.arkusz.wlokno = v; })}
        options=${[["dlugie", "Długie (LG)"], ["krotkie", "Krótkie (SG)"]]}
        hint=${`Włókno równoległe do ${z.arkusz.wlokno === "dlugie" ? "dłuższego" : "krótszego"} boku. Papiery ozdobne B1 — najczęściej długie. Jeśli kupujesz od razu arkusz drukowy (np. SRA3+), wybierz ten sam format co w punkcie 2.`} />
      <${PapierPicker} label="Papier" db=${db} value=${z.papier} onText=${(v) => up((x) => { x.papier.nazwa = v; x.papier.id = null; })} onPick=${(p) => up((x) => wstawPapier(x, "papier", p))} />
      <div class="grid3">
        <${Num} label="Gramatura" unit="g" value=${z.papier.gram} onChange=${(v) => up((x) => { x.papier.gram = v; })} />
        <${Num} label="Grubość" unit="µm" value=${z.papier.mikrony} onChange=${(v) => up((x) => { x.papier.mikrony = v; })} />
        <${Num} label="Zwyżka" unit="ark." value=${z.zwyzkaArkuszy} onChange=${(v) => up((x) => { x.zwyzkaArkuszy = Math.round(v); })} />
      </div>
      <div class="grid2">
        <${Num} label="Cena dostawcy / ark." unit="zł" value=${z.papier.cenaDostawcy} onChange=${(v) => up((x) => { x.papier.cenaDostawcy = v; })} hint=${`z marżą ${pct(C.marzaPapier)}: ${zl(z.papier.cenaDostawcy * (1 + C.marzaPapier))}`} />
        <${Num} label="Liczę po" unit="zł" value=${z.papier.cenaLicze} onChange=${(v) => up((x) => { x.papier.cenaLicze = v; })} hint="0 = cena z marżą" />
      </div>
      ${T.cyfra.on && ciezki && html`<p class="f__hint">Od ${M.cyfra.progWloknaGram} g producenci zalecają na ${M.cyfra.nazwa} włókno wzdłuż krawędzi wiodącej (krótkie włókno na SRA3).</p>`}
      ${T.cyfra.on && z.papier.gram > M.cyfra.gramMaxSzuflady && z.papier.gram <= M.cyfra.gramMax && html`<p class="f__hint">Powyżej ${M.cyfra.gramMaxSzuflady} g tylko bypass lub podajnik OHCF${z.papier.gram > M.cyfra.gramMaxDupleks ? `; powyżej ${M.cyfra.gramMaxDupleks} g dupleks ręczny` : ""}.</p>`}
      ${T.cyfra.on && z.papier.gram > M.cyfra.gramMax && html`<p class="f__warn">${M.cyfra.nazwa} przyjmuje maks. ${M.cyfra.gramMax} g.</p>`}
      ${T.kaszerowanie.on && html`<div class="group__sub">Papier 2 (kaszerowanie)</div>
        <${PapierPicker} label="Papier 2" db=${db} value=${z.papier2} onText=${(v) => up((x) => { x.papier2.nazwa = v; x.papier2.id = null; })} onPick=${(p) => up((x) => wstawPapier(x, "papier2", p))} />
        <div class="grid2">
          <${Num} label="Cena dostawcy / ark." unit="zł" value=${z.papier2.cenaDostawcy} onChange=${(v) => up((x) => { x.papier2.cenaDostawcy = v; })} />
          <${Num} label="Liczę po" unit="zł" value=${z.papier2.cenaLicze} onChange=${(v) => up((x) => { x.papier2.cenaLicze = v; })} />
        </div>`}
    </${Group}>

    <${Group} id="druk" title="Technologia" open=${open.druk} toggle=${tg("druk")} summary=${druk}>
      <${Tech} label="Druk cyfrowy" note=${M.cyfra.nazwa} t=${T.cyfra} set=${setT("cyfra")}>
        <${Sel} label="Kolorystyka" value=${T.cyfra.kolor} options=${Object.keys(C.cyfra.kolory).map((k) => [k, k])} onChange=${(v) => setT("cyfra")({ ...T.cyfra, kolor: v })} />
        <${Check} label=${`Dopuść bypass (arkusz do ${M.cyfra.dlugoscMaxBypass} mm, wolniej, ręcznie)`} checked=${z.pozwolBypass} onChange=${(v) => up((x) => { x.pozwolBypass = v; })} />
      </${Tech}>
      <${Tech} label="Sitodruk" note=${T.cyfra.on ? "na formatce z cyfry" : "formatki 1–4 użytki"} t=${T.sito} set=${setT("sito")}>
        <${Sel} label="Rodzaj druku" value=${T.sito.rodzaj} options=${Object.keys(C.sito.przeloty).map((k) => [k, `${k} — ${fmtZl.format(C.sito.przeloty[k])} zł`])} onChange=${(v) => setT("sito")({ ...T.sito, rodzaj: v })} />
        <div class="grid3">
          <${Num} label="Ustawienia" value=${T.sito.ustawien} min=${1} onChange=${(v) => setT("sito")({ ...T.sito, ustawien: v })} />
          <${Num} label="Klisze" value=${T.sito.klisz} onChange=${(v) => setT("sito")({ ...T.sito, klisz: v })} />
          <${Num} label="Świecenia" value=${T.sito.swiecen} onChange=${(v) => setT("sito")({ ...T.sito, swiecen: v })} />
        </div>
      </${Tech}>
      <${Tech} label="Tłoczenie / hot stamping" t=${T.tloczenie} set=${setT("tloczenie")}>
        <div class="grid2">
          <${Num} label="Matryca A" unit="cm" value=${T.tloczenie.a} onChange=${(v) => setT("tloczenie")({ ...T.tloczenie, a: v })} />
          <${Num} label="Matryca B" unit="cm" value=${T.tloczenie.b} onChange=${(v) => setT("tloczenie")({ ...T.tloczenie, b: v })} />
        </div>
        <div class="grid3">
          <${Num} label="Matryce" value=${T.tloczenie.matryc} onChange=${(v) => setT("tloczenie")({ ...T.tloczenie, matryc: v })} />
          <${Num} label="Montaż" value=${T.tloczenie.montaz} min=${1} onChange=${(v) => setT("tloczenie")({ ...T.tloczenie, montaz: Math.min(M.tloczenie.montazMax, Math.max(1, Math.round(v))) })} />
          <${Num} label="Strony" value=${T.tloczenie.strony} min=${1} onChange=${(v) => setT("tloczenie")({ ...T.tloczenie, strony: v })} />
        </div>
        <${Check} label="Element tłoczony na spad" checked=${T.tloczenie.naSpad} onChange=${(v) => setT("tloczenie")({ ...T.tloczenie, naSpad: v })} />
        ${T.tloczenie.naSpad && html`<p class="f__hint">Tłoczymy na formatce z zapasem, dopiero potem gilotyna — patrz karta cięcia.</p>`}
      </${Tech}>
      <${Tech} label="Letterpress" t=${T.letterpress} set=${setT("letterpress")}>
        <div class="grid3">
          <${Num} label="Matryce" value=${T.letterpress.matryc} onChange=${(v) => setT("letterpress")({ ...T.letterpress, matryc: v })} />
          <${Num} label="Ustawienia" value=${T.letterpress.ustawien} min=${1} onChange=${(v) => setT("letterpress")({ ...T.letterpress, ustawien: v })} />
          <${Num} label="Klisze A5" value=${T.letterpress.klisz} onChange=${(v) => setT("letterpress")({ ...T.letterpress, klisz: v })} />
        </div>
        <${Check} label="Mieszanie farby (100 zł)" checked=${T.letterpress.farba} onChange=${(v) => setT("letterpress")({ ...T.letterpress, farba: v })} />
      </${Tech}>
      ${!T.cyfra.on && (T.sito.on || T.tloczenie.on || T.letterpress.on) && html`
        <${Sel} label="Montaż na formatce" value=${String(z.montaz || 0)} onChange=${(v) => up((x) => { x.montaz = +v; })}
          options=${[["0", "Dobierz najtaniej (1–4)"], ["1", "Jedynki"], ["2", "Dwójki"], ["3", "Trójki"], ["4", "Czwórki"]]} />`}
    </${Group}>

    <${Group} id="wyk" title="Wykończenie" open=${open.wyk} toggle=${tg("wyk")} summary=${wykList.length ? `${wykList.length} operacji` : "tylko cięcie"}>
      <${Tech} label="Kaszerowanie" note=${`maks. ${M.kaszerowanie.maxA} × ${M.kaszerowanie.maxB}`} t=${T.kaszerowanie} set=${setT("kaszerowanie")} />
      <${Tech} label="Sztancowanie" note=${`maks. ${M.sztancowanie.maxA} × ${M.sztancowanie.maxB}`} t=${T.sztancowanie} set=${setT("sztancowanie")}>
        <${Num} label="Wykrojnik (jeśli nowy)" unit="zł" value=${T.sztancowanie.wykrojnik} onChange=${(v) => setT("sztancowanie")({ ...T.sztancowanie, wykrojnik: v })} />
      </${Tech}>
      <${Tech} label="Foliowanie" t=${T.foliowanie} set=${setT("foliowanie")}>
        <${Seg} value=${T.foliowanie.strony} options=${[[1, "Jednostronne"], [2, "Dwustronne"]]} onChange=${(v) => setT("foliowanie")({ ...T.foliowanie, strony: v })} />
      </${Tech}>
      <${Tech} label="Bigowanie" t=${T.bigowanie} set=${setT("bigowanie")}>
        <${Num} label="Liczba big" value=${T.bigowanie.big} onChange=${(v) => setT("bigowanie")({ ...T.bigowanie, big: v })} />
      </${Tech}>
      <${Tech} label="Barwienie krawędzi" t=${T.barwienie} set=${setT("barwienie")}>
        <${Num} label="Folia / farba / szt." unit="zł" value=${T.barwienie.koszt} onChange=${(v) => setT("barwienie")({ ...T.barwienie, koszt: v })} />
      </${Tech}>
      <${Tech} label="Wiercenie" t=${T.wiercenie} set=${setT("wiercenie")}>
        <${Num} label="Otworów" value=${T.wiercenie.otworow} onChange=${(v) => setT("wiercenie")({ ...T.wiercenie, otworow: v })} />
      </${Tech}>
      <div class="checks">
        ${[["ciecie", "Cięcie"], ["rozkowanie", "Rożkowanie"], ["laser", "Cięcie laserem"], ["ploter", "Nacinanie ploterem"], ["oczkowanie", "Oczkowanie"], ["blona", "Podklejanie błony"], ["szycie", "Szycie drutem"], ["nfc", "Tag NFC"], ["edycja", "Edycja graficzna"]].map(([k, l]) =>
          html`<${Check} label=${l} checked=${!!T[k].on} onChange=${(v) => setT(k)({ ...T[k], on: v })} />`)}
        <${Check} label="Wysyłka" checked=${z.wysylka} onChange=${(v) => up((x) => { x.wysylka = v; })} />
      </div>
    </${Group}>
  </div>`;
}

// ===== Rysunek: arkusz z formatkami =====
function GrainLines({ w, h, axis, step = 22 }) {
  const L = [];
  if (axis === "y") for (let x = step / 2; x < w; x += step) L.push(html`<line x1=${x} y1=${0} x2=${x} y2=${h} />`);
  else for (let y = step / 2; y < h; y += step) L.push(html`<line x1=${0} y1=${y} x2=${w} y2=${y} />`);
  return html`<g stroke="#111" stroke-opacity=".07" vector-effect="non-scaling-stroke" pointer-events="none">${L}</g>`;
}
function ArkuszSVG({ plan, s, M }) {
  const A = plan.arkusz, f = s.formatka;
  const ob = s.ciecia.arkusz === 0 ? 0 : M.gilotyna.obciecieArkusza; // arkusz = formatka → bez obcinania
  const showItems = s.uzytkiNaArkusz <= 2500;
  return html`<svg viewBox=${`-2 -2 ${A.w + 4} ${A.h + 4}`} role="img" aria-label="Rzut arkusza bazowego">
    <defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#d6d6d0" stroke-width="1.6" /></pattern></defs>
    <rect x="0" y="0" width=${A.w} height=${A.h} fill="url(#hatch)" stroke="#111" vector-effect="non-scaling-stroke" />
    <rect x=${ob} y=${ob} width=${A.w - 2 * ob} height=${A.h - 2 * ob} fill="none" stroke="#77776f" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
    ${s.uklad.map((p) => {
      const x = ob + p.x, y = ob + p.y;
      // w układzie formatki: rot = obrócona o 90° → kolumny/rzędy użytków zamieniają się
      const nx = p.rot ? f.ny : f.nx, ny = p.rot ? f.nx : f.ny, uw = p.rot ? f.uh : f.uw, uh = p.rot ? f.uw : f.uh;
      const G = f.gap;
      const m = (p.w - nx * uw - (nx - 1) * G) / 2;
      const items = [];
      if (showItems && !f.netto) for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++)
        items.push(html`<rect x=${x + m + i * (uw + G)} y=${y + (p.h - ny * uh - (ny - 1) * G) / 2 + j * (uh + G)} width=${uw} height=${uh} fill="none" stroke="#111" stroke-opacity=".35" vector-effect="non-scaling-stroke" />`);
      return html`<g><rect x=${x} y=${y} width=${p.w} height=${p.h} fill=${p.rot ? "#e9e9e4" : "#fff"} stroke="#111" vector-effect="non-scaling-stroke" />${items}</g>`;
    })}
    <${GrainLines} w=${A.w} h=${A.h} axis=${A.grain} />
  </svg>`;
}
function FormatkaSVG({ s, grainAxis }) {
  const f = s.formatka;
  const G = f.gap;
  const m = (f.w - f.nx * f.uw - (f.nx - 1) * G) / 2, my = (f.h - f.ny * f.uh - (f.ny - 1) * G) / 2;
  const items = [];
  for (let i = 0; i < f.nx; i++) for (let j = 0; j < f.ny; j++)
    items.push(html`<rect x=${m + i * (f.uw + G)} y=${my + j * (f.uh + G)} width=${f.uw} height=${f.uh} fill="#f0f0ec" stroke="#111" vector-effect="non-scaling-stroke" />`);
  return html`<svg viewBox=${`-2 -2 ${f.w + 4} ${f.h + 4}`} role="img" aria-label="Rzut formatki">
    <rect x="0" y="0" width=${f.w} height=${f.h} fill="#fff" stroke="#111" vector-effect="non-scaling-stroke" />
    ${!f.netto && html`<rect x=${m} y=${my} width=${f.w - 2 * m} height=${f.h - 2 * my} fill="none" stroke="#77776f" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`}
    ${items}
    <${GrainLines} w=${f.w} h=${f.h} axis=${grainAxis} step=${Math.max(6, Math.min(f.w, f.h) / 14)} />
  </svg>`;
}

// Kierunek włókna w formatce (w jej własnym układzie): formatki nieobrócone dziedziczą oś arkusza
const grainInFormatka = (plan, s) => { const p = s.uklad.find((q) => !q.rot) || s.uklad[0]; return p.rot ? (plan.arkusz.grain === "x" ? "y" : "x") : plan.arkusz.grain; };
const bokWlokna = (w, h, axis) => (axis === "x" ? w : h);

// ===== Karta cięcia: kroki dla operatora =====
function Karta({ z, plan, s, M }) {
  const f = s.formatka, A = plan.arkusz, T = z.technologie;
  const g = grainInFormatka(plan, s);
  const kroki = [];
  const bezCiecia = s.ciecia.arkusz === 0;
  kroki.push([`Arkusz ${A.w} × ${A.h} mm, włókno ∥ boku ${A.grain === "x" ? A.w : A.h} mm${bezCiecia ? " — drukujemy na całym arkuszu" : ` — obciąć krawędzie po ${M.gilotyna.obciecieArkusza} mm`}`, `${s.arkuszy} ark.`]);
  if (!f.netto && !bezCiecia) kroki.push([`Pociąć na formatki ${mm(f.w)} × ${mm(f.h)} mm (${s.formatek.naArkusz} z arkusza${s.uklad.some((p) => p.rot) && s.uklad.some((p) => !p.rot) ? ", w dwóch orientacjach" : ""}); włókno ∥ boku ${mm(bokWlokna(f.w, f.h, g))} mm`, `${s.ciecia.arkusz} cięć / stos`]);
  if (T.cyfra.on && s.cyfra) kroki.push([`${M.cyfra.nazwa}: krawędź wiodąca ${mm(s.cyfra.krawedz)} mm, przebieg ${mm(s.cyfra.dlugosc)} mm${s.cyfra.bypass ? " — bypass" : z.papier.gram > M.cyfra.gramMaxSzuflady ? " — bypass / OHCF" : ""}`, `${s.formatek.zArkuszy} przel.`]);
  if (T.sito.on) kroki.push([`Sitodruk na formatce (${f.uzytkow} uż.), ${T.sito.rodzaj.toLowerCase()}`, `${s.formatek.zArkuszy * (T.sito.ustawien || 1)} przel.`]);
  if (T.kaszerowanie.on) kroki.push([`Kaszerowanie formatek ${mm(f.w)} × ${mm(f.h)} mm (papier 1 + papier 2)`, `${s.formatek.zArkuszy} kanapek`]);
  if (T.tloczenie.on) {
    const mt = T.tloczenie.montaz || 1;
    if (T.tloczenie.naSpad || f.uzytkow <= M.tloczenie.montazMax) kroki.push([f.uzytkow <= M.tloczenie.montazMax ? `Tłoczenie na formatce (${f.uzytkow} uż.) — przed cięciem na netto` : `Impozycja w impozycji: dociąć formatkę na pola po ${mt} uż. z zapasem (przez środek wycinki), tłoczyć, potem cięcie na netto`, `${Math.ceil(s.wydrukowane / Math.min(mt, f.uzytkow))} uderz.`]);
    else kroki.push([`Tłoczenie na gotowych użytkach netto (po cięciu)`, `${s.wydrukowane} uderz.`]);
  }
  if (T.letterpress.on) kroki.push([`Letterpress`, `${s.wydrukowane} odb.`]);
  if (T.sztancowanie.on) kroki.push([`Sztancowanie formatek`, `${s.formatek.zArkuszy} uderz.`]);
  if (!f.netto) kroki.push([`Formatka → użytki: siatka ${f.nx} × ${f.ny}, ${f.margin > 0 ? `odciąć margines ${mm(f.margin)} mm, ` : ""}${f.gap > 0 ? `cięcie przez rozcinkę ${mm(f.gap)} mm (2 cięcia na przerwę)` : "użytki bez rozcinki — jedno cięcie na styku"}`, `${s.ciecia.formatka} cięć / stos`]);
  kroki.push([`Gotowe użytki ${mm(z.uzytek.w)} × ${mm(z.uzytek.h)} mm`, `${s.wydrukowane} szt. (zamówione ${z.naklad})`]);
  return html`<ol class="steps">${kroki.map(([t, n], i) => html`<li><span>${i + 1}</span><span>${t}</span><span>${n}</span></li>`)}</ol>`;
}

// ===== Matryca decyzji =====
function Macierz({ cmp, sel, setSel, all, setAll }) {
  const wyr = wyroznione(cmp);
  const rows = all ? cmp.lista.map((s) => ({ s, role: wyr.find((w) => w.s === s)?.role || [] })) : wyr;
  // wybrana formatka zawsze na górze listy
  if (all && cmp.wybrana) { const i = rows.findIndex((r) => r.s === cmp.wybrana); const [w] = rows.splice(i, 1); rows.unshift(w); }
  const best = cmp.best;
  return html`<table class="tbl">
    <thead><tr><th>Formatka</th><th>Z arkusza</th><th>Arkuszy</th><th>Formatek</th><th>Cięć</th><th>Papier</th><th>Netto</th><th>Różnica</th></tr></thead>
    <tbody>${rows.map(({ s, role }) => html`<tr class=${s.id === sel ? "is--on" : ""} onClick=${() => setSel(s.id)}>
      <td>${role.map((r) => html`<span class=${`tag${r === "najtańsza sugestia" ? " is--best" : r === "wybrana" ? " is--manual" : ""}`}>${r}</span>`)}<span>${mm(s.formatka.w)} × ${mm(s.formatka.h)}</span>
        <small>${s.wybrana ? `${s.formatka.wlokno === "dlugie" ? "LG" : "SG"} · ` : ""}${s.formatka.netto ? "cięcie od razu na netto" : `${s.formatka.nx} × ${s.formatka.ny} = ${s.formatka.uzytkow} uż.`}${s.cyfra?.bypass ? " · bypass" : ""}</small></td>
      <td>${s.formatek.naArkusz} × ${s.formatka.uzytkow}<small>${s.uzytkiNaArkusz} uż. · ${pct(s.wykorzystanie)}</small></td>
      <td>${s.arkuszy}</td>
      <td>${s.formatek.zArkuszy}</td>
      <td>${s.ciecia.arkusz + s.ciecia.formatka}<small>${s.ciecia.stosyArkusz + s.ciecia.stosyFormatka > 2 ? `stosy ${s.ciecia.stosyArkusz} + ${s.ciecia.stosyFormatka}` : "1 stos"}</small></td>
      <td>${zl(s.wycena.papier)}</td>
      <td><b>${zl(s.wycena.netto)}</b></td>
      <td><span class=${`delta${s.roznica > 0 ? " is--plus" : ""}`}>${s.id === best.id || !s.roznica ? "—" : signed(s.roznica, " zł", (v) => fmtZl.format(v))}</span></td>
    </tr>`)}</tbody>
  </table>
  <p class="note" style="margin-top:10px">${all ? html`Wszystkie warianty: ${cmp.lista.length}. ` : ""}<button class="link" onClick=${() => setAll(!all)}>${all ? "Pokaż tylko wyróżnione" : `Pokaż wszystkie (${cmp.lista.length})`}</button></p>`;
}
// Opis kompromisu: wskazana formatka względem najtańszej sugestii (z przyciskiem „przyjmij”), sugestia względem wskazanej
function Kompromis({ s, cmp, przyjmij }) {
  const ref = cmp.wybrana && s !== cmp.wybrana ? cmp.wybrana : !cmp.wybrana && s !== cmp.best ? cmp.best : s.wybrana && cmp.best ? cmp.best : null;
  if (!ref) return null;
  const d = { netto: Math.round((s.wycena.netto - ref.wycena.netto) * 100) / 100, arkuszy: s.arkuszy - ref.arkuszy, formatek: s.formatek.zArkuszy - ref.formatek.zArkuszy };
  const parts = [d.arkuszy && `${signed(d.arkuszy)} ark. bazowych`, d.formatek && `${signed(d.formatek)} formatek (${d.formatek > 0 ? "więcej przelotów i pracy ręcznej" : "mniej przelotów i pracy ręcznej"})`].filter(Boolean);
  const kto = s.wybrana ? "Wskazana formatka względem najtańszej sugestii" : cmp.wybrana ? "Ta sugestia względem wskazanej formatki" : "Ten wariant względem najtańszego";
  return html`<div class="tradeoff"><b>${kto}</b>
    <span>${parts.join(" · ") || "ta sama liczba arkuszy i formatek"} → <span class=${`delta ${d.netto > 0 ? "is--plus" : d.netto < 0 ? "is--minus" : ""}`}>${signed(d.netto, " zł", (v) => fmtZl.format(v))} netto</span></span>
    ${!s.wybrana && html`<span><button class="btn" style="margin-top:6px" onClick=${() => przyjmij(s)}>Przyjmij jako formatkę do druku</button></span>`}
    ${s.wybrana && cmp.best && d.netto > 0 && html`<span><button class="btn" style="margin-top:6px" onClick=${() => przyjmij(cmp.best)}>Przyjmij najtańszą sugestię (${mm(cmp.best.formatka.w)} × ${mm(cmp.best.formatka.h)})</button></span>`}
  </div>`;
}

function Podglad({ z, up, M, C, mag }) {
  const plan = useMemo(() => planuj(z, M), [z, M]);
  const F = z.formatka;
  const wyb = useMemo(() => (F.tryb === "wybrana" ? wariantFormatki(z, M, plan, { ...F, nx: F.siatka ? F.nx : 0, ny: F.siatka ? F.ny : 0, urot: F.siatka ? F.urot : "auto" }) : null), [z, M, plan]);
  const cmp = useMemo(() => porownaj(z, plan, C, wyb), [z, plan, C, wyb]);
  const [sel, setSel] = useState(null);
  const [all, setAll] = useState(false);
  useEffect(() => setSel(null), [F.tryb, F.w, F.h, F.wlokno]);
  const s = cmp.lista.find((x) => x.id === sel) || cmp.wybrana || cmp.best;
  // „Przyjmij”: sugestia kalkulatora staje się wskazaną formatką (wymiar + włókno)
  const przyjmij = (x) => { up((n) => { const fm = FORMATKI.find((f) => (f[2] === x.formatka.w && f[3] === x.formatka.h) || (f[2] === x.formatka.h && f[3] === x.formatka.w)); n.formatka = { ...n.formatka, tryb: "wybrana", format: fm ? fm[0] : "inna", w: x.formatka.w, h: x.formatka.h, wlokno: wloknoFormatki(plan, x), siatka: false, nx: 0, ny: 0, urot: "auto" }; }); setSel(null); };
  const wyr = wyroznione(cmp);
  const ostrz = wyb && (wyb.pusty || wyb.ostrzezenia?.length) ? html`<div class="warn">${wyb.ostrzezenia.map((o) => html`<span>${o}</span>`)}</div>` : null;
  if (!s) return html`<div class="preview"><div class="preview__bar"><span class="preview__info">Brak wariantu</span></div>
    <div class="preview__scroll">${ostrz}<div class="warn"><b>Żaden podział arkusza nie spełnia warunków.</b>
    <span>Sprawdź: format użytku względem maszyn (${M.cyfra.nazwa} maks. ${M.cyfra.krawedzMax} × ${z.pozwolBypass ? M.cyfra.dlugoscMaxBypass : M.cyfra.dlugoscMax} mm${z.technologie.kaszerowanie.on ? `, kaszerowanie maks. ${M.kaszerowanie.maxA} × ${M.kaszerowanie.maxB} mm` : ""}), wymóg włókna produktu i włókno arkusza. Przy kartonie od ${M.cyfra.progWloknaGram} g włókno musi biec wzdłuż krawędzi wiodącej.</span></div></div></div>`;
  const g = grainInFormatka(plan, s);
  const w = s.wycena;
  return html`<div class="preview">
    <div class="preview__bar">
      <div class="chips">${wyr.map(({ s: x, role }) => html`<button aria-pressed=${x.id === s.id} onClick=${() => setSel(x.id)}>${mm(x.formatka.w)} × ${mm(x.formatka.h)} <small>${role[0]}</small></button>`)}</div>
      <span class="preview__info" style="margin-left:auto">${cmp.lista.length} wariantów · ${zl(s.wycena.netto)} netto</span>
    </div>
    <div class="preview__scroll">
      <div class="card">
        <div class="card__head"><span class="card__title">Rzut cięcia</span><span class="card__sub">arkusz → formatka → użytek</span></div>
        <div class="card__body">
          ${s.wybrana && ostrz && html`<div style="margin-bottom:16px">${ostrz}</div>`}
          <div class="flow">
            <figure><${ArkuszSVG} plan=${plan} s=${s} M=${M} />
              <figcaption><span><b>Arkusz ${plan.arkusz.w} × ${plan.arkusz.h}</b> · ${s.formatek.naArkusz} formatek</span><span>${s.uzytkiNaArkusz} uż. · wykorzystanie ${pct(s.wykorzystanie)}</span></figcaption></figure>
            <figure><${FormatkaSVG} s=${s} grainAxis=${g} />
              <figcaption><span><b>${s.formatka.netto ? "Użytek" : "Formatka"} ${mm(s.formatka.w)} × ${mm(s.formatka.h)}</b>${s.formatka.netto ? "" : ` · ${s.formatka.nx} × ${s.formatka.ny} uż.`}</span><span>włókno ∥ boku ${mm(bokWlokna(s.formatka.w, s.formatka.h, g))} mm</span></figcaption></figure>
          </div>
          <div class="legend" style="margin-top:12px"><span><i></i>formatka</span><span><i class="is--rot"></i>formatka obrócona</span><span><i class="is--waste"></i>odpad</span><span><i class="is--grain"></i>kierunek włókna</span></div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><span class="card__title">Warianty cięcia</span><span class="card__sub">kliknij wiersz, aby zobaczyć rzut</span></div>
        <div class="card__body"><${Macierz} cmp=${cmp} sel=${s.id} setSel=${setSel} all=${all} setAll=${setAll} /><${Kompromis} s=${s} cmp=${cmp} przyjmij=${przyjmij} plan=${plan} /></div>
      </div>

      <div class="card">
        <div class="card__head"><span class="card__title">Wycena wariantu</span><span class="card__sub">${mm(s.formatka.w)} × ${mm(s.formatka.h)}</span></div>
        <div class="card__body">
          <div class="price">${w.pozycje.map((l) => html`<div class="price__row"><span>${l.label}${l.opis && html`<small>${l.opis}</small>`}</span><b>${zl(l.kwota)}</b></div>`)}</div>
          <div class="price__sum">
            <div class="stat is--main"><span>Netto</span><b>${zl(w.netto)}</b></div>
            <div class="stat"><span>Brutto</span><b>${zl(w.brutto)}</b></div>
            <div class="stat"><span>Szt. netto</span><b>${zl(w.sztNetto)}</b></div>
            <div class="stat"><span>Szt. brutto</span><b>${zl(w.sztBrutto)}</b></div>
          </div>
          ${z.wysylka && html`<p class="note" style="margin-top:10px">+ wysyłka ${zl(w.wysylka)} netto (${zl(w.wysylka * (1 + C.vat))} brutto)</p>`}
        </div>
      </div>

      <${PapierMagazyn} z=${z} s=${s} mag=${mag} />

      <div class="card">
        <div class="card__head"><span class="card__title">Karta cięcia</span><span class="card__sub">dla introligatorni</span></div>
        <div class="card__body"><${Karta} z=${z} plan=${plan} s=${s} M=${M} /></div>
      </div>
    </div>
  </div>`;
}

// ===== Papier i magazyn w wycenie: ile mamy, ile domówić, utworzenie zlecenia =====
function PapierMagazyn({ z, s, mag }) {
  const { db, setDb, otworzZlecenie } = mag;
  const kasz = z.technologie.kaszerowanie.on;
  const poz = [["papier", z.papier], ...(kasz ? [["papier2", z.papier2]] : [])].map(([k, p]) => {
    const wKartotece = p.id && db.papiery.find((q) => q.id === p.id);
    return { k, p, wKartotece, s: wKartotece ? sprawdz(db, p.id, s.arkuszy) : null };
  });
  const [pytaj, setPytaj] = useState(false);
  const utworz = () => {
    if (!pytaj) { setPytaj(true); setTimeout(() => setPytaj(false), 4000); return; }
    const r = utworzZlecenie(db, {
      nazwa: z.nazwa, klient: z.klient,
      pozycje: poz.filter((x) => x.wKartotece).map((x) => ({ papierId: x.p.id, potrzeba: s.arkuszy })),
      wycena: { netto: s.wycena.netto, brutto: s.wycena.brutto, naklad: z.naklad, uzytek: z.uzytek, formatka: { w: s.formatka.w, h: s.formatka.h, uzytkow: s.formatka.uzytkow }, arkuszy: s.arkuszy, formatek: s.formatek.zArkuszy },
    });
    setDb(r.db); setPytaj(false); otworzZlecenie(r.id);
  };
  return html`<div class="card">
    <div class="card__head"><span class="card__title">Papier i magazyn</span><span class="card__sub">potrzeba ${s.arkuszy} ark. ${z.arkusz.a} × ${z.arkusz.b}${kasz ? " × 2 warstwy" : ""}</span></div>
    <div class="card__body">
      <table class="tbl is--static"><thead><tr><th>Papier</th><th>W magazynie</th><th>Potrzeba</th><th>Z magazynu</th><th>Domówić</th></tr></thead>
        <tbody>${poz.map(({ p, wKartotece, s: c }) => html`<tr>
          <td>${p.nazwa || "—"}<small>${wKartotece ? `${wKartotece.dostawca || ""} · ${wKartotece.typ}` : "spoza kartoteki"}</small></td>
          <td>${c ? `${c.dostepne} ark.` : "—"}</td><td>${s.arkuszy} ark.</td>
          <td>${c ? `${c.zMagazynu} ark.` : "—"}</td>
          <td>${c ? html`<b class=${c.domowic > 0 ? "delta is--plus" : "delta is--minus"}>${c.domowic > 0 ? `${c.domowic} ark.` : "nic"}</b>${c.domowic > 0 && wKartotece.dostawca ? html`<small>u ${wKartotece.dostawca}</small>` : ""}` : html`<b>${s.arkuszy} ark.</b>`}</td>
        </tr>`)}</tbody></table>
      <div class="actions">
        <button class=${`btn is--primary${pytaj ? " is--warn" : ""}`} onClick=${utworz}>${pytaj ? "Kliknij ponownie — przeniesie papier do bufora" : "Utwórz zlecenie i zarezerwuj papier"}</button>
        <span class="note">Powstanie wpis w buforze: papier z magazynu wewnętrznego przechodzi na regał zlecenia, brakujące arkusze dostają status „do zamówienia”.</span>
      </div>
    </div>
  </div>`;
}

// ===== Pozycja bufora: status, dostawca, akcje (wspólne dla Bufora i karty zlecenia) =====
const klasaStatusu = (st) => (st === "do zamówienia" ? "is--do" : st === "zamówiony" ? "is--zam" : "is--ok");
function Status({ st, poz }) {
  const kiedy = st === "zamówiony" ? poz?.zamowiono : st === "gotowy" ? poz?.dostarczono : null;
  return html`<span class=${`st ${klasaStatusu(st)}`}>${st}</span>${kiedy && html`<small>${dataPL(kiedy)}</small>`}`;
}
function Dostawca({ db, setDb, zlecenieId, poz, edytuj }) {
  const dostawcy = [...new Set(db.papiery.map((p) => p.dostawca).filter(Boolean))];
  if (!edytuj) return html`${poz.dostawca || "—"}`;
  return html`<input class="mini" type="text" list="kk-dostawcy" value=${poz.dostawca || ""} placeholder="u kogo?"
      onChange=${(e) => setDb(ustawDostawce(db, zlecenieId, poz.papierId, e.target.value))} />
    <datalist id="kk-dostawcy">${dostawcy.map((d) => html`<option value=${d} />`)}</datalist>`;
}
function AkcjaPozycji({ db, setDb, zlecenieId, poz }) {
  const st = statusPozycji(poz);
  const brak = Math.max(0, (poz.domowic || 0) - (poz.przyjeto || 0));
  const [n, setN] = useState(brak);
  useEffect(() => setN(brak), [brak]);
  if (st === "do zamówienia") return html`<button class="btn" onClick=${() => setDb(oznaczZamowione(db, zlecenieId, poz.papierId))}>Zamówiono</button>`;
  if (st === "zamówiony") return html`<div class="inline"><${Num} value=${n} onChange=${setN} unit="ark." />
    <button class="btn" onClick=${() => n > 0 && setDb(przyjmijDostawe(db, zlecenieId, poz.papierId, n))}>Dostarczono</button>
    <button class="link" title="Cofnij do „do zamówienia”" onClick=${() => setDb(cofnijZamowienie(db, zlecenieId, poz.papierId))}>cofnij</button></div>`;
  return html`<span class="note">—</span>`;
}

// ===== Zlecenia =====
const STATUSY = { "w realizacji": "w realizacji", "zakończone": "zakończone", "anulowane": "anulowane" };
const dataPL = (iso) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
function ZleceniaPanel({ db, sel, setSel }) {
  const [filtr, setFiltr] = useState("w realizacji");
  const lista = db.zlecenia.filter((x) => !filtr || x.status === filtr).slice().reverse();
  return html`<div class="panel__inner">
    <div><h1 class="h">Zlecenia</h1><p class="note">Zlecenie powstaje z wyceny („Utwórz zlecenie”) — papier przechodzi wtedy z magazynu wewnętrznego do bufora.</p></div>
    <${Seg} value=${filtr} options=${[["w realizacji", "W realizacji"], ["zakończone", "Zakończone"], ["", "Wszystkie"]]} onChange=${setFiltr} />
    ${lista.length ? html`<div class="list">${lista.map((x) => html`<button class=${`list__item${x.id === sel ? " is--on" : ""}`} onClick=${() => setSel(x.id)}>
      <span><b>${x.numer}</b> ${x.nazwa || "bez nazwy"}<small>${x.klient || "—"} · ${dataPL(x.utworzone)}</small></span>
      <span class=${`status is--${x.status === "w realizacji" ? "open" : x.status === "zakończone" ? "done" : "off"}`}>${x.status}</span>
    </button>`)}</div>` : html`<p class="empty">Brak zleceń${filtr ? ` „${filtr}”` : ""}.</p>`}
  </div>`;
}
function ZleceniePodglad({ db, setDb, id }) {
  const zl_ = db.zlecenia.find((x) => x.id === id);
  const [zost, setZost] = useState({});
  const [pytaj, setPytaj] = useState("");
  useEffect(() => { setZost({}); setPytaj(""); }, [id]);
  if (!zl_) return html`<div class="preview"><div class="preview__scroll"><p class="empty">Wybierz zlecenie z listy.</p></div></div>`;
  const P = (pid) => db.papiery.find((p) => p.id === pid) || { nazwa: pid, a: 0, b: 0 };
  const otwarte = zl_.status === "w realizacji";
  const dwaKlik = (k, fn) => () => { if (pytaj !== k) { setPytaj(k); setTimeout(() => setPytaj(""), 4000); return; } fn(); setPytaj(""); };
  const ruchy = db.ruchy.filter((r) => r.zlecenieId === id).slice().reverse();
  const w = zl_.wycena;
  return html`<div class="preview">
    <div class="preview__bar"><b>${zl_.numer}</b><span class="preview__info">${zl_.nazwa || "bez nazwy"}${zl_.klient ? ` · ${zl_.klient}` : ""}</span>
      <span class=${`status is--${otwarte ? "open" : zl_.status === "zakończone" ? "done" : "off"}`} style="margin-left:auto">${zl_.status}</span></div>
    <div class="preview__scroll">
      ${w && html`<div class="price__sum" style="margin-top:0">
        <div class="stat is--main"><span>Netto</span><b>${zl(w.netto)}</b></div>
        <div class="stat"><span>Nakład</span><b>${w.naklad} szt.</b></div>
        <div class="stat"><span>Arkusz drukowy</span><b>${mm(w.formatka.w)} × ${mm(w.formatka.h)}</b></div>
        <div class="stat"><span>Arkuszy kupowanych</span><b>${w.arkuszy}</b></div>
      </div>`}
      <div class="card">
        <div class="card__head"><span class="card__title">Papier w buforze</span><span class="card__sub">osobny regał dla tego zlecenia</span></div>
        <div class="card__body">
          ${zl_.pozycje.length ? html`<table class="tbl is--static"><thead><tr><th>Papier</th><th>Potrzeba</th><th>Z magazynu</th><th>Domówić</th><th>U kogo</th><th>Status</th><th>W buforze</th>${otwarte && html`<th></th>`}</tr></thead>
            <tbody>${zl_.pozycje.map((p) => html`<tr>
              <td>${P(p.papierId).nazwa}<small>${kluczFormatu(P(p.papierId)).replace("x", " × ")}</small></td>
              <td>${p.potrzeba}</td><td>${p.zMagazynu}</td>
              <td>${p.domowic ? html`${p.domowic}${p.przyjeto ? html`<small>dostarczono ${p.przyjeto}</small>` : ""}` : "—"}</td>
              <td>${p.domowic ? html`<${Dostawca} db=${db} setDb=${setDb} zlecenieId=${id} poz=${p} edytuj=${otwarte && statusPozycji(p) !== "gotowy"} />` : "—"}</td>
              <td><${Status} st=${statusPozycji(p)} poz=${p} /></td>
              <td><b>${stanBufora(db, id, p.papierId)}</b></td>
              ${otwarte && html`<td><${AkcjaPozycji} db=${db} setDb=${setDb} zlecenieId=${id} poz=${p} /></td>`}
            </tr>`)}</tbody></table>` : html`<p class="note">To zlecenie nie ma papieru z kartoteki.</p>`}
        </div>
      </div>
      ${otwarte && html`<div class="card">
        <div class="card__head"><span class="card__title">Zakończenie zlecenia</span><span class="card__sub">resztki wracają do magazynu wewnętrznego</span></div>
        <div class="card__body">
          <div class="cfg">${zl_.pozycje.map((p) => html`<div class="cfg__row"><label>${P(p.papierId).nazwa}<small>w buforze ${stanBufora(db, id, p.papierId)} ark. — ile zostało?</small></label>
            <${Num} unit="ark." value=${zost[p.papierId] ?? 0} onChange=${(v) => setZost({ ...zost, [p.papierId]: v })} /></div>`)}</div>
          <div class="actions">
            <button class=${`btn is--primary${pytaj === "koniec" ? " is--warn" : ""}`} onClick=${dwaKlik("koniec", () => setDb(zakonczZlecenie(db, id, zost)))}>${pytaj === "koniec" ? "Kliknij ponownie, aby zamknąć" : "Zakończ zlecenie"}</button>
            <button class=${`btn${pytaj === "anuluj" ? " is--warn" : ""}`} onClick=${dwaKlik("anuluj", () => setDb(anulujZlecenie(db, id)))}>${pytaj === "anuluj" ? "Kliknij ponownie — bufor wróci do magazynu" : "Anuluj zlecenie"}</button>
          </div>
          <p class="note">Np. zostało +6 ark. → 6 ark. wraca do magazynu wewnętrznego, reszta bufora liczy się jako zużyta.</p>
        </div>
      </div>`}
      ${!otwarte && zl_.status === "zakończone" && html`<div class="card"><div class="card__head"><span class="card__title">Rozliczenie papieru</span></div><div class="card__body">
        <table class="tbl is--static"><thead><tr><th>Papier</th><th>Zużyto</th><th>Wróciło do magazynu</th></tr></thead>
        <tbody>${zl_.pozycje.map((p) => html`<tr><td>${P(p.papierId).nazwa}</td><td>${p.zuzyto ?? "—"}</td><td>${p.zwrot ? `+${p.zwrot}` : "0"}</td></tr>`)}</tbody></table></div></div>`}
      <div class="card"><div class="card__head"><span class="card__title">Historia ruchów</span></div><div class="card__body">
        <table class="tbl is--static"><thead><tr><th>Kiedy</th><th>Ruch</th><th>Segment</th><th>Papier</th><th>Ilość</th></tr></thead>
        <tbody>${ruchy.map((r) => html`<tr><td>${dataPL(r.data)}</td><td>${r.opis}</td><td>${r.segment === "bufor" ? "bufor" : "magazyn"}</td><td>${P(r.papierId).nazwa}</td><td class=${r.ilosc > 0 ? "delta is--minus" : "delta is--plus"}>${r.ilosc > 0 ? "+" : "−"}${Math.abs(r.ilosc)}</td></tr>`)}</tbody></table></div></div>
    </div>
  </div>`;
}

// ===== Magazyn =====
function MagazynPanel({ db, setDb, f, setF, seg, setSeg, reset }) {
  const formaty = [...new Set(db.papiery.map(kluczFormatu))].sort();
  const kolory = [...new Set(db.papiery.map((p) => p.kolor).filter(Boolean))].sort();
  const pusty = { nazwa: "", producent: "", dostawca: "", kolor: "", gram: 300, mikrony: 400, typ: "gładki", a: 700, b: 1000, wlokno: "dlugie", cenaDostawcy: 0, ilosc: 0 };
  const [nowy, setNowy] = useState(pusty);
  const [open, setOpen] = useState(false);
  const [pytaj, setPytaj] = useState(false);
  const setN = (k) => (v) => setNowy({ ...nowy, [k]: v });
  const dodaj = () => {
    if (!nowy.nazwa.trim()) return;
    const { ilosc, ...p } = nowy;
    let n = dodajPapier(db, p);
    const id = n.papiery[n.papiery.length - 1].id;
    if (ilosc > 0) n = przyjmij(n, id, ilosc, "Przyjęcie przy dodaniu do kartoteki");
    setDb(n); setNowy(pusty); setOpen(false);
  };
  const typy = f.typy || [];
  return html`<div class="panel__inner">
    <div><h1 class="h">Magazyn papieru</h1><p class="note">Magazyn wewnętrzny — papiery z innych zleceń, zwyżki, resztki. Bufor — regał z papierem przypisanym do zleceń w realizacji.</p></div>
    <${Seg} value=${seg} options=${[["magazyn", "Magazyn wewnętrzny"], ["bufor", "Bufor"]]} onChange=${setSeg}
      hint=${seg === "bufor" ? "Papier przypisany do zleceń: ile z magazynu, ile domówić, u kogo i na jakim etapie." : "Wszystkie papiery z kartoteki ze stanem — zero też widać."} />
    <section class="group is--open"><div class="group__head"><span class="group__title">Filtry</span>
      <button class="link" style="margin-left:auto" onClick=${() => setF({})}>Wyczyść</button></div>
      <div class="group__body">
        <${Txt} label="Nazwa" value=${f.szukaj || ""} placeholder="np. Keaykolour navy" onChange=${(v) => setF({ ...f, szukaj: v })} />
        <div class="grid2">
          <${Sel} label="Format arkusza" value=${f.format || ""} options=${[["", "Wszystkie"], ...formaty.map((x) => [x, x.replace("x", " × ")])]} onChange=${(v) => setF({ ...f, format: v })} />
          <${Sel} label="Kolor" value=${f.kolor || ""} options=${[["", "Wszystkie"], ...kolory.map((x) => [x, x])]} onChange=${(v) => setF({ ...f, kolor: v })} />
        </div>
        <div class="grid2">
          <${Num} label="Gramatura od" unit="g" value=${f.gramMin || 0} onChange=${(v) => setF({ ...f, gramMin: v })} />
          <${Num} label="Gramatura do" unit="g" value=${f.gramMax || 0} hint="0 = bez limitu" onChange=${(v) => setF({ ...f, gramMax: v })} />
        </div>
        ${seg === "bufor" && html`<div class="f"><span class="f__label">Status</span><div class="chips">${STATUSY_BUFORA.map((t) => html`<button aria-pressed=${(f.statusy || []).includes(t)} onClick=${() => { const st = f.statusy || []; setF({ ...f, statusy: st.includes(t) ? st.filter((x) => x !== t) : [...st, t] }); }}>${t}</button>`)}</div></div>`}
        <div class="f"><span class="f__label">Typ</span><div class="chips">${TYPY_PAPIERU.map((t) => html`<button aria-pressed=${typy.includes(t)} onClick=${() => setF({ ...f, typy: typy.includes(t) ? typy.filter((x) => x !== t) : [...typy, t] })}>${t}</button>`)}</div></div>
        ${seg === "magazyn" && html`<${Check} label="Ukryj papiery bez stanu" checked=${!!f.ukryjZera} onChange=${(v) => setF({ ...f, ukryjZera: v })} />`}
      </div></section>
    <${Group} id="nowy" title="Dodaj papier do kartoteki" open=${open} toggle=${() => setOpen(!open)} summary="">
      <${Txt} label="Nazwa" value=${nowy.nazwa} placeholder="np. Keaykolour Jet Black 300 g" onChange=${setN("nazwa")} />
      <div class="grid3">
        <${Txt} label="Producent" value=${nowy.producent} onChange=${setN("producent")} />
        <${Txt} label="Dostawca" value=${nowy.dostawca} onChange=${setN("dostawca")} />
        <${Txt} label="Kolor" value=${nowy.kolor} onChange=${setN("kolor")} />
      </div>
      <div class="grid3">
        <${Num} label="Gramatura" unit="g" value=${nowy.gram} onChange=${setN("gram")} />
        <${Num} label="Grubość" unit="µm" value=${nowy.mikrony} onChange=${setN("mikrony")} />
        <${Sel} label="Typ" value=${nowy.typ} options=${TYPY_PAPIERU.map((t) => [t, t])} onChange=${setN("typ")} />
      </div>
      <div class="grid3">
        <${Num} label="Bok A" unit="mm" value=${nowy.a} onChange=${setN("a")} />
        <${Num} label="Bok B" unit="mm" value=${nowy.b} onChange=${setN("b")} />
        <${Num} label="Cena / ark." unit="zł" value=${nowy.cenaDostawcy} onChange=${setN("cenaDostawcy")} />
      </div>
      <${Seg} label="Włókno" value=${nowy.wlokno} options=${[["dlugie", "Długie (LG)"], ["krotkie", "Krótkie (SG)"]]} onChange=${setN("wlokno")} />
      <${Num} label="Na stanie od razu" unit="ark." value=${nowy.ilosc} onChange=${setN("ilosc")} hint="Trafi do magazynu wewnętrznego." />
      <button class="btn is--primary" onClick=${dodaj} disabled=${!nowy.nazwa.trim()}>Dodaj do kartoteki</button>
    </${Group}>
    <p class="note">Dane zapisują się na razie w tej przeglądarce. <button class="link" onClick=${() => { if (!pytaj) { setPytaj(true); setTimeout(() => setPytaj(false), 4000); return; } reset(); setPytaj(false); }}>${pytaj ? "Kliknij ponownie — wszystkie stany i zlecenia wrócą do przykładu" : "Przywróć dane przykładowe"}</button></p>
  </div>`;
}
function MagazynPodglad({ db, setDb, f, seg, otworzZlecenie }) {
  const [ruch_, setRuch] = useState({});
  const P = db.papiery;
  if (seg === "bufor") {
    const ok = new Set(filtruj(P, { ...f, tylkoNaStanie: false }).map((p) => p.id));
    const st = f.statusy || [];
    const rows = listaBufora(db).filter((r) => ok.has(r.poz.papierId) && (!st.length || st.includes(r.status)));
    const ile = (s_) => listaBufora(db).filter((r) => r.status === s_).length;
    return html`<div class="preview"><div class="preview__bar"><b>Bufor</b>
        <span class="preview__info">${STATUSY_BUFORA.map((s_) => `${s_}: ${ile(s_)}`).join(" · ")}</span></div>
      <div class="preview__scroll"><div class="card"><div class="card__body">
        ${rows.length ? html`<table class="tbl is--static"><thead><tr><th>Zlecenie</th><th class="l">Papier</th><th>Z magazynu</th><th>Domówić</th><th>U kogo</th><th>Status</th><th>W buforze</th><th></th></tr></thead>
          <tbody>${rows.map(({ zlecenie: z_, poz, status, wBuforze }) => { const p = P.find((x) => x.id === poz.papierId) || {}; return html`<tr>
            <td><button class="link" onClick=${() => otworzZlecenie(z_.id)}><b>${z_.numer}</b></button><small>${z_.nazwa || "—"} · ${z_.klient || "—"}</small></td>
            <td class="l">${p.nazwa}<small>${kluczFormatu(p).replace("x", " × ")} ${p.wlokno === "dlugie" ? "LG" : "SG"} · ${p.mikrony} µm</small></td>
            <td>${poz.zMagazynu}</td>
            <td>${poz.domowic ? html`${poz.domowic}${poz.przyjeto ? html`<small>dostarczono ${poz.przyjeto}</small>` : ""}` : "—"}</td>
            <td>${poz.domowic ? html`<${Dostawca} db=${db} setDb=${setDb} zlecenieId=${z_.id} poz=${poz} edytuj=${status !== "gotowy"} />` : "—"}</td>
            <td><${Status} st=${status} poz=${poz} /></td>
            <td><b>${wBuforze}</b></td>
            <td><${AkcjaPozycji} db=${db} setDb=${setDb} zlecenieId=${z_.id} poz=${poz} /></td></tr>`; })}</tbody></table>`
          : html`<p class="empty">${st.length ? "Brak pozycji o tym statusie." : "Bufor jest pusty — wpisy powstają, gdy tworzysz zlecenie z wyceny."}</p>`}
      </div></div></div></div>`;
  }
  // Magazyn wewnętrzny = kartoteka ze stanem: zera widać (wyszarzone), opcjonalnie ukryte
  const lista = filtruj(P, { ...f, tylkoNaStanie: !!f.ukryjZera }, (id) => stanMagazynu(db, id));
  const suma = lista.reduce((a, p) => a + stanMagazynu(db, p.id), 0);
  const naStanie = lista.filter((p) => stanMagazynu(db, p.id) > 0).length;
  const zapisz = (p) => { const n = ruch_[p.id]; if (!n) return; setDb(n > 0 ? przyjmij(db, p.id, n, "Przyjęcie ręczne") : korekta(db, p.id, n, "Korekta ręczna")); setRuch({ ...ruch_, [p.id]: 0 }); };
  return html`<div class="preview"><div class="preview__bar"><b>Magazyn wewnętrzny</b><span class="preview__info">${lista.length} papierów · ${naStanie} na stanie · ${suma} ark.</span></div>
    <div class="preview__scroll"><div class="card"><div class="card__body">
      ${lista.length ? html`<table class="tbl is--static"><thead><tr><th>Papier</th><th>Format</th><th>Gramatura</th><th>Typ</th><th>Dostawca</th><th>Cena / ark.</th><th>Stan</th><th>Przyjęcie / korekta</th></tr></thead>
        <tbody>${lista.map((p) => { const stn = stanMagazynu(db, p.id); return html`<tr class=${stn > 0 ? "" : "is--zero"}>
          <td>${p.nazwa}<small>${p.kolor || "—"} · ${p.producent || ""}</small></td>
          <td>${kluczFormatu(p).replace("x", " × ")}<small>${p.wlokno === "dlugie" ? "długie włókno" : "krótkie włókno"}</small></td>
          <td>${p.gram} g<small>${p.mikrony} µm</small></td><td>${p.typ}</td><td>${p.dostawca || "—"}</td><td>${zl(p.cenaDostawcy)}</td>
          <td><b>${stn}</b></td>
          <td><div class="inline"><${Num} value=${ruch_[p.id] || 0} min=${-99999} onChange=${(v) => setRuch({ ...ruch_, [p.id]: v })} unit="ark." />
            <button class="btn" onClick=${() => zapisz(p)} title="Dodatnia liczba = przyjęcie, ujemna = korekta">Zapisz</button></div></td>
        </tr>`; })}</tbody></table>
        <p class="note" style="margin-top:10px">Wpisz +N, aby przyjąć arkusze (np. zwyżkę), albo −N, aby skorygować stan po inwentaryzacji. Każdy ruch zostaje w historii.</p>`
        : html`<p class="empty">Brak papierów dla tych filtrów.</p>`}
    </div></div></div></div>`;
}

// ===== Ustawienia: Maszyny i Cenniki =====
const ETYKIETY = {
  nazwa: "Nazwa", krawedzMax: "Krawędź wiodąca maks.", dlugoscMax: "Długość arkusza maks. (szuflady)", dlugoscMaxBypass: "Długość maks. (bypass)",
  minKrawedz: "Krawędź min.", minDlugosc: "Długość min.", gramMax: "Gramatura maks.", gramMaxSzuflady: "Gramatura maks. — szuflady",
  gramMaxDupleks: "Gramatura maks. — dupleks", progWloknaGram: "Włókno wzdłuż krawędzi wiodącej od", margines: "Margines formatki (na bok)",
  maxA: "Format maks. — bok A", maxB: "Format maks. — bok B", montazMax: "Montaż maks. (użytków)", obciecieArkusza: "Obcięcie krawędzi arkusza (na bok)", wysokoscStosu: "Wysokość stosu pod nożem",
};
const JEDN = { krawedzMax: "mm", dlugoscMax: "mm", dlugoscMaxBypass: "mm", minKrawedz: "mm", minDlugosc: "mm", gramMax: "g", gramMaxSzuflady: "g", gramMaxDupleks: "g", progWloknaGram: "g", margines: "mm", maxA: "mm", maxB: "mm", obciecieArkusza: "mm", wysokoscStosu: "mm" };
const STACJE = { cyfra: "Druk cyfrowy", kaszerowanie: "Kaszerowanie", sztancowanie: "Sztancowanie", sito: "Sitodruk", tloczenie: "Tłoczenie", letterpress: "Letterpress", gilotyna: "Gilotyna" };

function Maszyny({ M, setM, reset }) {
  return html`<div class="panel__inner">
    <div><h1 class="h">Maszyny</h1><p class="note">Formaty i reguły stacji. Silnik cięcia bierze je stąd — zmiana działa od razu we wszystkich wycenach.</p></div>
    ${Object.keys(M).map((k) => html`<section class="group is--open"><div class="group__head"><span class="group__title">${STACJE[k] || k}</span><span class="group__summary">${M[k].nazwa}</span></div>
      <div class="group__body cfg">${Object.keys(M[k]).filter((p) => typeof M[k][p] === "number").map((p) => html`<div class="cfg__row"><label>${ETYKIETY[p] || p}</label>
        <${Num} unit=${JEDN[p]} value=${M[k][p]} onChange=${(v) => setM((x) => { x[k][p] = v; })} /></div>`)}</div></section>`)}
    <p class="note">Dane ${M.cyfra.nazwa} wg producenta; próg włókna i marginesy — z praktyki, do potwierdzenia przez operatora. <button class="link" onClick=${reset}>Przywróć domyślne</button></p>
  </div>`;
}

function Cenniki({ C, setC, reset }) {
  const sekcje = [["tloczenie", "Tłoczenie"], ["letterpress", "Letterpress"], ["sztancowanie", "Sztancowanie"], ["wykonczenie", "Wykończenie i stałe"]];
  return html`<div class="panel__inner">
    <div><h1 class="h">Cenniki</h1><p class="note">Stawki przeniesione z arkusza. Zmiana tutaj przelicza wszystkie wyceny.</p></div>
    <section class="group is--open"><div class="group__head"><span class="group__title">Druk cyfrowy</span><span class="group__summary">cena przelotu wg liczby arkuszy</span></div>
      <div class="group__body">
        <table class="cfg__matrix"><thead><tr><th></th><th>≤ ${C.cyfra.progi[0]}</th><th>≤ ${C.cyfra.progi[1]}</th><th>≤ ${C.cyfra.progi[2]}</th><th>więcej</th></tr></thead>
          <tbody>${Object.keys(C.cyfra.kolory).map((k) => html`<tr><th>${k}</th>${C.cyfra.kolory[k].map((v, i) => html`<td><${Num} value=${v} onChange=${(n) => setC((x) => { x.cyfra.kolory[k][i] = n; })} /></td>`)}</tr>`)}</tbody></table>
        <div class="cfg__row"><label>Minimalka</label><${Num} unit="zł" value=${C.cyfra.minimalka} onChange=${(v) => setC((x) => { x.cyfra.minimalka = v; })} /></div>
      </div></section>
    <section class="group is--open"><div class="group__head"><span class="group__title">Sitodruk</span></div>
      <div class="group__body cfg">
        ${["klisze", "swiecenie", "ustawienie", "minimalka"].map((p) => html`<div class="cfg__row"><label>${{ klisze: "Klisze", swiecenie: "Świecenie", ustawienie: "Ustawienie", minimalka: "Minimalka" }[p]}</label><${Num} unit="zł" value=${C.sito[p]} onChange=${(v) => setC((x) => { x.sito[p] = v; })} /></div>`)}
        ${Object.keys(C.sito.przeloty).map((p) => html`<div class="cfg__row"><label>${p}<small>za przelot</small></label><${Num} unit="zł" value=${C.sito.przeloty[p]} onChange=${(v) => setC((x) => { x.sito.przeloty[p] = v; })} /></div>`)}
      </div></section>
    <section class="group is--open"><div class="group__head"><span class="group__title">Cięcie</span><span class="group__summary">stała kwota za linię cięcia</span></div>
      <div class="group__body cfg">
        <${Seg} label="Powtórzenia linii" value=${C.ciecie.tryb} options=${[["stos", "× liczba stosów"], ["arkusz", "× liczba arkuszy"]]} onChange=${(v) => setC((x) => { x.ciecie.tryb = v; })}
          hint=${C.ciecie.tryb === "stos" ? "Gilotyna tnie stos naraz — każdą linię liczymy raz na stos (wysokość stosu: Maszyny → Gilotyna)." : "Każda linia liczona osobno dla każdego arkusza / formatki — wyraźnie drożej przy dużych nakładach."} />
        <div class="cfg__row"><label>Stawka za linię cięcia</label><${Num} unit="zł" value=${C.ciecie.stawkaLinia} onChange=${(v) => setC((x) => { x.ciecie.stawkaLinia = v; })} /></div>
        <div class="cfg__row"><label>Minimalka</label><${Num} unit="zł" value=${C.ciecie.minimalka} onChange=${(v) => setC((x) => { x.ciecie.minimalka = v; })} /></div>
      </div></section>
    ${sekcje.map(([k, t]) => html`<section class="group is--open"><div class="group__head"><span class="group__title">${t}</span></div>
      <div class="group__body cfg">${Object.keys(C[k]).filter((p) => typeof C[k][p] === "number").map((p) => html`<div class="cfg__row"><label>${p.replace(/([A-Z0-9]+)/g, " $1").toLowerCase()}</label><${Num} value=${C[k][p]} onChange=${(v) => setC((x) => { x[k][p] = v; })} /></div>`)}</div></section>`)}
    <div class="cfg__row"><label>Marża na papier</label><${Num} value=${C.marzaPapier} onChange=${(v) => setC((x) => { x.marzaPapier = v; })} /></div>
    <p class="note"><button class="link" onClick=${reset}>Przywróć cennik z arkusza</button></p>
  </div>`;
}

// ===== Aplikacja =====
function App() {
  const [view, setView] = useState("wycena");
  const [z, setZ] = useState(() => merge(zlecenieDomyslne(), store.get("kk.zlecenie", null)));
  const [M, setMRaw] = useState(() => merge(clone(MASZYNY), store.get("kk.maszyny", null)));
  const [C, setCRaw] = useState(() => merge(clone(CENNIK), store.get("kk.cennik", null)));
  const [newVersion, setNewVersion] = useState(false);
  // Magazyn: kartoteka papierów, ruchy i zlecenia — na razie w tej przeglądarce (wspólna baza w kolejnym etapie)
  const [db, setDbRaw] = useState(() => store.get("kk.magazyn", null) || bazaStartowa(PAPIERY_PRZYKLADOWE, STANY_STARTOWE));
  const setDb = (n) => { setDbRaw(n); store.set("kk.magazyn", n); };
  const [selZl, setSelZl] = useState(null);
  const [magF, setMagF] = useState({});
  const [magSeg, setMagSegRaw] = useState("magazyn");
  const setMagSeg = (v) => setMagSegRaw(v === "kartoteka" ? "magazyn" : v);
  const otworzZlecenie = (id) => { setSelZl(id); setView("zlecenia"); };
  const aktywne = db.zlecenia.filter((x) => x.status === "w realizacji").length;
  const up = (fn) => setZ((prev) => { const n = clone(prev); fn(n); store.set("kk.zlecenie", n); return n; });
  const setM = (fn) => setMRaw((prev) => { const n = clone(prev); fn(n); store.set("kk.maszyny", n); return n; });
  const setC = (fn) => setCRaw((prev) => { const n = clone(prev); fn(n); store.set("kk.cennik", n); return n; });

  // Nowa wersja na serwerze → pasek z prośbą o odświeżenie (jak w edytorze brandmanuala); tylko gdy wersja faktycznie nowsza
  useEffect(() => {
    if (VERSION === "dev") return;
    const check = async () => { try { const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" }); const j = await r.json(); if (j.version && j.version > VERSION) setNewVersion(true); } catch {} };
    const t = setInterval(check, 5 * 60 * 1000); addEventListener("focus", check); check();
    return () => { clearInterval(t); removeEventListener("focus", check); };
  }, []);

  // Bez confirm() (blokowany w osadzonych podglądach): pierwsze kliknięcie pyta, drugie czyści
  const [pytaj, setPytaj] = useState(false);
  const nowe = () => { if (!pytaj) { setPytaj(true); setTimeout(() => setPytaj(false), 4000); return; } const n = zlecenieDomyslne(); setZ(n); store.set("kk.zlecenie", n); setPytaj(false); };
  return html`<div class=${`app${newVersion ? " has--banner" : ""}`}>
    ${newVersion && html`<div class="banner">Jest nowa wersja kalkulatora. Odśwież stronę skrótem <b>Cmd+Shift+R</b> — bieżąca wycena zostanie.</div>`}
    <header class="top">
      <span class="top__brand">KHOREI <span>Kalkulator</span><small>${VERSION}</small></span>
      <span class="top__status">${z.nazwa || "Nowa wycena"}${z.klient ? ` · ${z.klient}` : ""}</span>
      <div class="top__actions"><button class=${`btn${pytaj ? " is--warn" : ""}`} onClick=${nowe}>${pytaj ? "Kliknij ponownie, aby wyczyścić" : "Nowa wycena"}</button></div>
    </header>
    <nav class="nav">
      <button class=${view === "wycena" ? "is--on" : ""} onClick=${() => setView("wycena")}>Wycena</button>
      <button class=${view === "zlecenia" ? "is--on" : ""} onClick=${() => setView("zlecenia")}>Zlecenia <small>${aktywne || ""}</small></button>
      <button class=${view === "magazyn" ? "is--on" : ""} onClick=${() => setView("magazyn")}>Magazyn papieru</button>
      <span class="nav__label">Ustawienia</span>
      <button class=${view === "maszyny" ? "is--on" : ""} onClick=${() => setView("maszyny")}>Maszyny <small>${Object.keys(M).length}</small></button>
      <button class=${view === "cenniki" ? "is--on" : ""} onClick=${() => setView("cenniki")}>Cenniki</button>
      <span class="nav__label">Wkrótce</span>
      <p class="nav__note">Karta produkcyjna · Broszury · Wielki format · Offset · wspólna baza dla zespołu</p>
    </nav>
    <main class="panel">
      ${view === "wycena" && html`<${Zlecenie} z=${z} up=${up} M=${M} C=${C} db=${db} />`}
      ${view === "maszyny" && html`<${Maszyny} M=${M} setM=${setM} reset=${() => { setMRaw(clone(MASZYNY)); store.set("kk.maszyny", null); }} />`}
      ${view === "cenniki" && html`<${Cenniki} C=${C} setC=${setC} reset=${() => { setCRaw(clone(CENNIK)); store.set("kk.cennik", null); }} />`}
      ${view === "zlecenia" && html`<${ZleceniaPanel} db=${db} sel=${selZl} setSel=${setSelZl} />`}
      ${view === "magazyn" && html`<${MagazynPanel} db=${db} setDb=${setDb} f=${magF} setF=${setMagF} seg=${magSeg} setSeg=${setMagSeg} reset=${() => setDb(bazaStartowa(PAPIERY_PRZYKLADOWE, STANY_STARTOWE))} />`}
    </main>
    ${view === "zlecenia" ? html`<${ZleceniePodglad} db=${db} setDb=${setDb} id=${selZl} />`
      : view === "magazyn" ? html`<${MagazynPodglad} db=${db} setDb=${setDb} f=${magF} seg=${magSeg} otworzZlecenie=${otworzZlecenie} />`
      : html`<${Podglad} z=${z} up=${up} M=${M} C=${C} mag=${{ db, setDb, otworzZlecenie }} />`}
  </div>`;
}

render(html`<${App} />`, document.getElementById("app"));
