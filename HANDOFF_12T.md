# HANDOFF — 12t (Modal = yalnız aktiv stansiya + Bar tab view-only + bütün station-lara eyni qayda)

**Tarix:** 2026-10-04 · **Vəziyyət:** kod bitdirilib + E2E r16 (dark+light, read-only) + fresh-tab console 0.

## 1. Owner tələbləri (orijinal, AZ — Şəkil 1 = KDS Kitchen modal, 2 = KDS board, 3-4 = Bar tab)

1. "Modal açıldıqda digər station-ların (məs. 'Green Tea') məhsulları görünməsin — hər modal YALNIZ həmin station-a aid məhsulları göstərsin."
2. "Mətbəx panelində (KDS) 'Bar' tab yalnız BAXIŞ (view-only) üçün — məhsullar üzərində heç bir klik, seçim, tick və ya digər əməliyyat düyməsi olmasın."
3. "Bar tabında da yalnız bar station-ına aid məhsullar — digər station-ların məhsulları heç vaxt görünməsin."
4. "Bu qaydalar BÜTÜN station-lar üçün eyni; əvvəlki modal, yoxa çıxıb yenidən görünmə və mətbəx filtr problemləri TAM düzəldilsin."

## 2. Root-cause / model

- 12s-də watchMode YALNIZ restricted terminal (BDS) üçün işləyirdi → KDS-də Bar tab **operable** idi (tick + Hazırdır + RUSH). Owner modelində KDS = KITCHEN terminal: Kitchen = iş, Bar = yalnız izləmə (Bar işi BDS terminal-da edilir).
- 12s modalı BÜTÜN stansiya qruplarını göstərirdi (BAR · İzləmə / KITCHEN) → owner indi: modal = YALNIZ aktiv tab-ın stansiya-sı.

**12t model (tək qayda, bütün station-lar):**
- `ownType = stationType || 'kitchen'` (KDS = kitchen panel; BDS = bar panel)
- `watchMode = activeStation.family !== ownType` → KDS: Bar tab watch; BDS: Kitchen tab watch
- Modal items = `itemStation(i) === activeStation.id` (başqa stansiya = modalda YOXDUR)
- Watch səthində: statik circle, kart CTA = sükut "İzləmə" caption, **modal footer = button YOX** (yalnız "İzləmə" sətiri + RUSH status markerı order rush-dursa)

## 3. "Yoxa çıxıb yenidən görünmə" — TAM statusu

Bütün yol-lar yoxlandı:
- X/86 button — 12s-də silindi (KDS UI-da void yolu YOX; void yalnız POS-dan, audit ilə)
- tick — in-place progress (`prepared_quantity`), sətir drop ETMİR (12o semantics)
- ready flip — in-place (12i; köhnə "tamamla → itir → geri" blink aralıb)
- poll fail — `if (!res.ok) return` (orders Yox silinmir) + seq guard + optimistic merge window (12q)
- E2E r16: modal **16 s** açıq tutuldu → auto-close YOX, item stable (identical DOM before/after)

## 4. Console qalıq ("supabaseKey is required" 6×) — aralandı

r16 sub-agent shared-tab-da 6× bu error gördü — **KÖHNƏ CONSOLE İSTORİYASIDI**:
- Kök: `node_modules__pnpm_0tqan.y._.js` chunk-u **10-03 01:33:45**-də compile olunub (`.env.local` — real anon key — 01:51:58-yə qədər YOXDU) → empty key inline.
- Son REAL error: dev log **07:19:10** (r15 zamanı); 11:35 HMR recompile-dən sonra bütün yeni chunk-lar real key ilə (2 chunk verified).
- **Fresh-tab verification (r16-fresh): 0 error / 0 warning**, "supabaseKey is required" YOX.
- Dev server restart EDİLMƏDİ (owner test-də idi; HMR qaydası). Qarışıqlıq istənməzə: `.env` (empty key) + `.env.local` (real key) — .env.local üstünlük verir; `.env`-i silmək olmaz (gitignored deyil, lakin commit olunmur).

## 5. Order-level qeyd (owner-in diqqətinə)

Masa 2-də "Qeyd: green tee soyuq olsn" = `orders.customer_note` (ORDER-level — DB verified: item-lərin `special_notes`-ləri boş). Order qeydi BÜTÜN station kartlarında görünür (order info = status izləmə, MƏHSUL deyil — owner qaydası məhsullara şamil). Item-level qeydlər station-scope-dan keçir. Owner order-note-ı da station-a bölməni istəsə → ayrıca round.

## 6. E2E (r16 — dark + light, STRICT read-only: heç bir tick/CTA/RUSH toxunulmayıb)

| # | Tapşırıq | Nəticə |
|---|---|---|
| A1 | KDS navbar: Kitchen (badge YOX) · Bar (İZLƏMƏ badge) · GÜN | PASS |
| A2 | KDS Kitchen: card+modal = YALNIZ Filadelfiya ("Standart ×1"); operable tick + RUSH + Hazırdır; Green Tea YOX, section header YOX | PASS |
| A3 | Modal 16s hold — auto-close YOX, item stable | PASS |
| A4 | KDS Bar tab: card = YALNIZ Green Tea, statik circle, "İzləmə" caption (Hazırdır YOX); progress line "Bar 0/1 · Kitchen 0/1" qalıb (status) | PASS |
| A5 | KDS Bar modal: YALNIZ Green Tea; footer-da HƏMİŞƏ button YOX (sükut İzləmə); static circle | PASS |
| A6 | Light: eyni (bar modal + kitchen modal) oxunaqlı | PASS |
| B1 | BDS navbar: Bar (operable, badge YOX) · Kitchen (İZLƏMƏ) · GÜN | PASS |
| B2 | BDS Bar: Green Tea operable (tick + RUSH + Hazırdır), modal = YALNIZ Green Tea | PASS |
| B3 | BDS Kitchen: Filadelfiya view-only (card+modal, button YOX, statik circle, İzləmə) | PASS |
| B4 | Light: eyni | PASS |
| — | Fresh-tab console: **0 error / 0 warning** | PASS |

Shot-lar: `e2e-shots/r16-*` (10 + fresh).

## 7. Qalan / növbəti (owner GO ilə)

- §1c (12s) təklif listi: bump bar · kitchen offline buffer · expo · kitchen ETA · watch timestamps · kitchen-86 variantı (owner qərarı) · per-stansiya səs · light-mode kontrast · overload badge · read-cache
- Order-level qeydin station-a bölünməsi (owner qərarı — hazırda order info kimi qalır)
- 12q OPEN: POS 115× duplicate-key burst (monitorinq) · superadmin cash shift AÇIQ (owner bağlayacaq)
