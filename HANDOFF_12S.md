# HANDOFF — 12s (Metbex modal + BDS watch mode + X/ORD kod silindi + modifier həmişə ×N)

**Tarix:** 2026-10-04 · **Vəziyyət:** kod bitdirilib + E2E-də təsdiqlənib (r14 + r15); **docs yenilənİB** (MFM §10 journal + §15 rows, POS_COMPETITIVE_COMPARISON §1b + yeni §1c meyar-meyar müqayisə, bu handoff, MEMORY).

## 1. Owner tələbləri (orijinal, AZ — Şəkil 1 = KDS modal, Şəkil 2 = BDS navbar)

1. "Bar bölməsində KDS məhsulu olan 'Filadelfiya' niyə görünür? Hər mətbəx yalnız öz sifarişlərini və məhsullarını göstərməlidir."
2. "Modal daxilində 'X' düyməsi niyə var? Məhsula tik ilə kliklədikdə məhsulun yox olması və yenidən gəlməsi bug-ını aradan qaldır."
3. "Modifikator hazırda yalnız '1 ədəd' kimi göstərilir. Əlavələrin neçə ədəd olması, bütün modifikatorların və miqdarların düzgün göstərilməsi təmin edilsin."
4. "'ORD-2959' kimi kodlar göstərilməsin."
5. "Şəkil 2-də eyni funksionallıq BDS tabında da tətbiq edilsin. 'Main Kitchen' əvəzinə 'Bar', 'Kitchen' və 'Gün' kimi düzgün mətbəx bölmələri göstərilsin. Bir mətbəx digər mətbəxin sifarişlərini yalnız izləyə bilsin, idarə edə bilməsin (hazırlanıb-hazırlanmadığını, nə vaxt qəbul edildiyini, statusunu görə bilsin)."
6. "Saito-nu Toast, Lightspeed və Square mətbəx sistemləri ilə müqayisə et (rahatlıq, idarəetmə, ayrım, status, modifikatorlar, performans + digər); üstün/zəif tərəflər; sonda praktik təkliflər."

## 2. Diaqnostika — "Filadelfiya" sirri (LIVE DB, 2026-10-04)

Owner-in ekran görüntüsündəki **yalnız "Standart" görünməsi BUG DEYİL** — DB dəliyi:

`ORD-2959` (Masa 2, order `c151767b-f94c-42e1-b9a0-ab50cf5ef04c`) **3 item** ilə göndərilmişdi:

| item | product | modifiers | status |
|---|---|---|---|
| 531fc241 | Green Tea Japanese Style | — | accepted (Bar stansiya) |
| 68325652 | Filadelfiya Classic | Standart ×1 | **accepted** (Kitchen) |
| e999b49f | Filadelfiya Classic | Kremli ×1, Əlavə Losos ×1, Acılı Mayonez ×1, Əlavə Avokado ×1 | **voided** |

`operation_logs` timeline (bütün hərəkətlər owner super-admin `c814879d…`):
- 07:09:31 `place_order` (3 item, ₼39)
- 07:09:35 `accept_kitchen_ticket`
- **07:10:04 `order_item.voided`** (4-modifier Filadelfiya) — owner-in modal-da **X (86) düyməsinə basması** — ekran görüntüsündən (11:10:25 Baku) 21 saniyə ƏVVƏL.

→ UI voided item-i düzgün gizlədir (12q void-rehydration fix). "Yalnız 1 ədəd" şikayətinin kökü = (a) 4-modifier sətir owner tərəfindən void olunmuşdu + (b) ×1 miqdarı UI-da göstərilmirdi (yalnız ×N>1). İkisi də bu round-da bağlandı.

**"Filadelfiya Bar-da görünür"** = modal-da item-lər FLAT siyahı idi; ayağında STANSIYALAR counter bloku (Bar 0/1 · Main Kitchen 0/1) vardı — item-lərin hansı stansiyanın olduğuna görə QUPRULMASI YOXDU idi. Navbar "Main Kitchen" adı = DB `stations.name` (legacy rename).

## 3. Düzəlişlər (hamısı E2E verified — r14 + r15)

Bütün UI dəyişiklikləri `artifacts/saito-admin/src/app/admin/pos/components/KDSView.tsx` (KDS + BDS eyni komponent):

1. **Modal = stansiya qrupları** — flat siyahı + STANSIYALAR bloku → hər stansiya üçün `<section>`: header = stansiya adı + ready/qty (stationMap), item-lər `itemStation(i)` ilə qruplaşır. Read-only qrupda header-ə `· İzləmə` marker.
2. **WATCH mode** — `navStations` = öz family + digər kitchen family (`stationType` restricted terminal üçün); `watchMode` = aktiv stansiya fərqli family-dirsə:
   - navbar-da digər stansiya = Eye `İzləmə` badge
   - item circle = **statik div** (motion.button YOX)
   - kart CTA = sükut `İzləmə` caption (Hazırdır button YOX)
   - RUSH = non-clickable status span (button YOX)
   - `inScope(i)` = false → heç bir action digər stansiya-sına toxunmur (12r scope mexanizmi ilə eyni)
3. **X (86) button SİLİNDİ** — `handleVoidItem` + XCircle import + modal footer düyməsi. "Tik-də sətir yox olur, geri gəlir" = 86-void davranışı idi; indi sətirdə YALNIZ ✓ tick var və tick sətri HƏMİŞƏ saxlayır (12o progress semantics). **DB mexanizmi qorunur:** `item_kitchen_terminal('voided')` + `/api/kitchen/void-comp-waste` (`origin:'kds'` exemption) + kitchen role `order.void` permission — 86 indi YALNIZ POS-dan (comp/waste + PIN).
4. **ORD-kod YOX** — modal header = `Masa 2` only (takeaway/delivery üçün `customer_phone` qorunur); kart `metaRest` dine_in = boş.
5. **Modifier HƏMİŞƏ ×N** — kart (11px) + modal (12px): `Standart ×1 · Əlavə Losos ×3` (əvvəl ×1 gizli idi).
6. **"Main Kitchen" → "Kitchen"** — LIVE DB: `UPDATE stations SET name='Kitchen' WHERE name='Main Kitchen'` (1 sətir) + `delivery/page.tsx` + KDS literal-ləri. `fallbackStationId` `stations.find(s => s.name === 'Kitchen')` — DB rename ilə uyğunlaşdırıldı.
7. **i18n** — `kds_watch`: az "İzləmə" / en "Watch" / ru "Наблюдение".

## 4. E2E (browser, owner Chrome, PIN 4321)

- **r14** (`e2e-shots/r14-*` + `r14-findings.md`): unified KDS + BDS, dark+light — navbar Kitchen·Bar·GÜN (Main Kitchen YOX) ✓; modal qrupları: BAR · İzləmə → Green Tea, KITCHEN → Filadelfiya ✓; X YOX ✓; ORD-kod YOX ✓; read-only Bar qrupu (statik circle + İzləmə marker, tick YOX) ✓; tick = sətir qalır (disappear/reappear YOX) ✓; BDS watch tab tam read-only (statik circle, İzləmə caption, disabled CTA, non-clickable RUSH) ✓; light mode oxunaqlı ✓; **console 0 error/warning**.
- **r15** (`e2e-shots/r15-*`): modifier ×N — Masa 2 kart + modal (dark+light) "Standart ×1" ✓; console 0.
- Read-only disiplina: tick/RUSH/Hazırdır toxunulmayıb (kitchen state dəyişmədi).

## 5. Müqayisə (owner tələbi #6)

`POS_COMPETITIVE_COMPARISON.md`:
- **§1b** yeniləndi (12s rows: stations/watch, 86=POS-only, modifier ×N).
- **§1c YENİ** — "METBƏX SİSTEMİ — MEYAR-MEYAR MÜQAYİSƏ + HÜKÜM": 11 meyar × 4 sistem cədvəli + 8 üstün tərəf (WATCH mode, station-scoped ready, per-instance modifier, 23ms optimistic, GÜN, frozen state machine, 24h window, AZ yerelliği) + 8 zəif tərəf (offline KDS, expo, bump bar, kitchen ETA, aggregator, hardware, 86=POS-only trade-off, per-stansiya səs) + **10 praktik təklif priority order** (bump bar → kitchen offline buffer → expo → kitchen ETA → watch timestamps → kitchen 86 variantı (owner qərarı) → per-stansiya səs → light-mode kontrast → overload badge → board read-cache).

## 6. Qalan / növbəti (owner GO ilə)

1. **§1c təklifləri** — yuxarıdakı 10 item (1-3 = ən yüksək dəyər: bump bar, kitchen offline, expo).
2. **12q OPEN (inherit):** POS 115× duplicate-key burst — 12s-də də repro YOX (monitorinq); ShiftGate 86 browser re-test — modal X silindiyi üçün KDS path yoxdur, YALNIZ POS comp/waste path qalır (smena BAĞLI olanda test olunmayıb — superadmin cash shift r12q2-dən açıqdır, owner GO ilə bağlanır).
3. **Owner NO-GO (inherit):** ~103+2 köhnə order təmizliyi (read-only siyahı əvvəl), 12d minimap road-following, 12f chime ear-check, "Main Kitchen"→"Hot" rename (12s-də "Kitchen" edildi — owner tələbi ilə).

## 7. Qaydalar (inherit — MEMORY.md binding)

- AZ cavab · `"supabase yoxla"` = HƏMİŞƏ real DB (REST service-role / pooler psql) — repo SQL YOX
- icazəsiz feature/vizual silinmir · motion tokens `src/lib/motion/system.ts` · Phosphor only (lucide YASAK)
- hər UI işi 2 temada test · console 0 · commit `<round>: <desc>` → push main · HMR canlı — test ortasında server restart ETMƏ
