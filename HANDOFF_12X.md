# HANDOFF — ROUND 12x (2026-10-04)

Owner: "sistem özəmənn hər 3 dilini tanıdıqda derinən, yeni məhsulu da tanısın" — 12w-in
note-routing engine-i **multilingual dərin** edildi (AZ / EN / RU, kiril daxil).

## MEXANİKA — `src/lib/note-routing.ts` (yeni saf modul; KDSView = adapter)

Segment (vergül ilə bölünmüş order qeydi hissəsi) order-un məhsul ad + modifikator
token-ləri ilə 5 qat matching-ə düşür (hər iki tərəf eyni normalizasiyadan keçir):

1. **normalize:** `toLocaleLowerCase('tr')` → NFD accent-strip → alnum (ç→c, ş→s, ğ/ə düşür)
2. **Kiril→Latın transliterasiya** (RU): `филадельфия`→`filadelfiya`, `чай`→`chai`,
   `холодный`→`xolodny` — RU yazılmış qeyd EN menyu adını tapa
3. **CONCEPT sözlüyü (~40 concept, hər biri AZ/EN/RU formaları ilə):** `çay`≈`tea`≈`чай`,
   `soğan`≈`garlic`≈`лук`, `холодный`≈`cold`≈`soyuq`, `krem`≈`cream`≈`сливки`, `etli`≈`meat`≈`мясо`…
   → cross-dil semantik match
4. **light stem:** -lar/-ler/-s/-es/-li/-si/-y… (iki tərəfdə)
5. **typo-tolerant:** Hamming ≤ 1 (`tee`≈`tea`, `soyuqu`≈`soyuq`) + prefix (len ≥ 4)

**Route qaydası (12w-dən dəyişməz):** match → segment yalnız həmin stansiya-nın kartı;
match YOX / bütün stansiya-lara → **ÜMUMİ** (hamıda). Cross-dil tapmacalar MÜSAHİBƏVƏR:
sözlükdə yoxdursa = ümumi (yanlış stansiya HEÇ VAXT).

**"Yeni məhsul" coverage:** proper-noun məhsul adları (Filadelfiya, Boston Lobster,
Neapoliten…) translit + token bərabərlik + prefix + hamming ilə üç dildə də tanınır;
adət sözləri (çay/чай/tea) concept sözlüyü ilə. Yeni məhsul MENYU-ya əlavə olunduqda
ekstradan heç nə lazım deyil — matching order-dakı canlı ad üzərindədir.
(Sözlüyə yeni konsept lazımdırsa: `CONCEPTS` map-inə 1 sətir.)

## VERİFİKASYA

**Node unit-test (module standalone compile):** 10/10 routing senarisi + 8/8 token check PASS
("çay~tea", "чай~tea", "tee~tea", "soğan~garlic", "холодный~cold", "филадельфия~Filadelfiya",
"soyuqu~soyuq", random negative).

**E2E r23 (canlı POS, console 0 fresh tab, dark+light):**
- Masa 2 (real data): "green tee soyuq olsn" → Bar kartda ✓, Kitchen kartda YOX ✓
- **AZ order** (Masa 3): `çay soyuq olsun, filadelfiya soğansız, təşəkkür` →
  Kitchen kart **verbatim "filadelfiya soğansız · təşəkkür"**, Bar kart **"çay soyuq olsun · təşəkkür"** ✓
- **RU order** (Masa 3, kiril): `чай холодный, филадельфия без крема, спасибо` →
  Kitchen kart **verbatim "филадельфия без крема · спасибо"**, Bar kart **"чай холодный · спасибо"** ✓
- "спасибо" / "təşəkkür" / "soyuq olsun" = general → hamıda ✓
- Cleanup: ORD-2966/2967 canonical cancel + dismiss → Masa 3 BOŞ (`table_status: empty`);
  Masa 2 untouched.
- Anomaliya (info): `POST /api/tables/seat` 1 dəfə transient 403 (order yaratmağa mane olmadı).

## FAYLLAR

- `src/lib/note-routing.ts` (**yeni**) — engine (normTok, translit, stemVariants, CONCEPTS,
  tokensMatch, routeNoteSegments, scopedNoteFor)
- `KDSView.tsx` — inline engine silindi → `routeOrderNote`/`scopedNoteFor` adapter (itemStation resolve)
- `e2e-shots/r23-1..7 + r23-findings.md`
