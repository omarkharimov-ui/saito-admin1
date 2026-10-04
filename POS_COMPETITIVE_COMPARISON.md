# SAITO POS vs Toast · Lightspeed · Square — Feature Audit (2026-10-05, rounds 7 → 13b)

> Əsas: SAITO = bu repo-nun kodu üzrə verified feature set. Rəqiblər = hər birinin
> müstəqil Restaurant POS məhsulunun müəssisəleşmiş core feature set-i.
>
> **STATUS (2026-10-01, rounds 11a–11n):** 5 əsas çatışmazlığın HAMISI bağlandı
> (payroll 11a · purchasing 11b · analytics 11c · online ordering 11d · offline 11e),
> qalanlar 11f-də, backend consistency audit + Apple polish 11g-də, POS status axını
> (fulfillment/payment ayrılığı) + served-lock + default serving 11n-də, chip mənatiqi +
> custom ikonlar (person+bag / moped) + action-sheet back 11o-da, qısa status label +
> pill ikonları + düz ödəniş text + "#" təmizliyi 11p-də. Hər addımın
> before/after müqayisəsi aşağıda (§0). Qalan: §2.6 real PSP (owner qərarı),
> §2.7 e-commerce (low priority), §2.8 franchise, light-mode phase-2 (POS sheet-ləri).
> **12q:** KDS status-revert + 2-3s button latency (optimistic-first + seq guard +
> accept item-alignment) + KITCHEN GAP SWEEP (RUSH / course-firing / 86 UI — DB FROZEN
> idi, UI bağlandı). Müqayisə §0 + yeni "KITCHEN DETALI MÜQAYİSƏ (12q)" bölümü.
> **12r:** METBƏX SWEEP — station-scoped ready (bir stansiya digərinin item-lərini
> ready edə bilmir — Toast bump-parity), false-empty board aralandı (loading gate +
> stations retry), modifier chip → text (×N), device heartbeat 23505 fallback.
> **12s:** METBƏX MODAL + BDS WATCH — modal-da station qrupları (hər mətbəx yalnız
> öz item-ləri), digər mətbəx = read-only **WATCH** (status/ready/count, idarə YOX),
> X (86) düyməsi + ORD-kod SİLİNDİ (owner), modifier HƏMİŞƏ ×N, "Main Kitchen"→"Kitchen".
> Yeni: §1c meyar-meyar müqayisə + üstün/zəif + praktik təkliflər.
> **12t:** MODAL = yalnız aktiv stansiya + KDS Bar tab = VIEW-ONLY (bütün station-lara
> eyni qayda: own family operable, digəri watch); "yoxa çıxıb yenidən görünmə" tam bağlandı.
> **12u:** §1c-in **10 PRAKTİK TƏKLİFİNİN HAMISI IMPLEMENT + E2E VERİFIED (r17–r20c)** —
> Expo "serving qapısı" (tək-press SERVİSƏ VER = frozen serve edge), offline buffer
> (queue + replay + offline reload = cached board/stations), bump bar, per-ticket ETA,
> watch timestamps, 86 = səbəb+PIN (X görünüşü YOX), per-stansiya səs, light contrast,
> overload badge, read-cache; + sliding-pill tab transition + cross-fade; GÜN ghost fix.
> Zəiflər #1–#4 (offline/expo/bump/ETA) artıq bağlanıb (aşağıda ✅).
> **12v (owner qərarları):** Expo = **tam VIEW-ONLY** ("servis POS-dan verilir — buttonu və
> texti sil"): KDS-də servis action/text YOX; servis = POS "SERVİSƏ VER" (frozen edge qorunur).
> Station board = **HAZIRLANIR + HAZIRDİR zone split** (ticket payı bitəndə zone-keçid).
> Order-level qeyd kartdan bölündü (yalnız modal/POS/çap) + dine-in modal-note kök düzəldildi.
> Səs routing E2E verified (bar-only order KDS-də səssiz).
> **12w:** qeyd = **SMART ROUTING** — order qeydi vergüllə segmentlərə bölünür, məhsul
> adları ilə token-match (hamming ≤1: "tee"≈"tea") → hər station kartı YALNIZ öz
> məhsuluna aid qeydi görür (match YOX = ümumi, hamıda); Expo/modal = tam qeyd; kartda
> qeyd geri (scoped). HAZIRLANIR/HAZIRDİR zona → **sub-tab** (count, pill).
> **12x:** routing = **MULTILINGUAL DƏRİN** (`note-routing.ts`): kiril→latın translit +
> ~40 concept sözlüyü (AZ/EN/RU: "çay"≈"tea"≈"чай") + light stem — qeyd AZ, EN və RU
 > (kiril) yazılsa da düzgün stansiya-ya yönlənir; yeni proper-noun məhsullar 3 dildə
 > tanınır (E2E r23: RU kiril order verbatim verified).
 > **12y (owner qərarları + deep verify):** "Servis POS-dan edir" = **TAM** (modal CTA-nın
 > son render yolu da silindi; i18n key 0 usage → silindi; ready/serving modal footer = BOŞ).
 > "İzləmə" chip = **TAM** (navbar = bare Eye icon; footer = yalnız timestamps). **2s flicker
 > kök-fix**: RUSH/86/course-fire optimistik qeydiyyatı + stale-snapshot merge-protection
 > (EU pooler 2-3s kökü). E2E r24 = 0-dan deep (KDS+BDS+POS, dark+light, console 0):
 > flicker 4 əməliyyatda 21–28s sampler = **heç vaxt revert YOX**; backend psql consistent.
 > Növbəti modul = **INVENTORY**.
 > **13a:** INVENTORY = dead-zone revival (anon-client RLS kökü → service-role API; 3
 > orphaned page → nav; waste-standards 500; counts DELETE guard; notifications feed).
 > **13b:** BOM (Filadelfiya Classic + Kaliforniya Gold — owner-approved) + təmizlik
 > (orphan resept silindi, P8_PROD deaktiv) + **yeni §1d INVENTORY MÜQAYİSƏSİ**
 > (Toast xtraCHEF / Square MarketMan / Lightspeed vs SAITO: consumption timing =
 > READY üstünlüyü, LLM-AI loop üstünlüyü; zəiflər = invoice→PO, par-order-guide,
 > COGS ledger, offline stocktake, batch/expiry, multi-location).

## 0. BEFORE / AFTER — 11a–11g dəyişikliklərinin tam müqayisəsi

| Qabiliyyət | BEFORE (round 7 audit anı) | AFTER (11a–11g) |
|---|---|---|
| **Online ordering** | Yox idi — customer kanalının özü missing | Menü → table-suz checkout (takeaway/delivery) → server-price order → public tracking səhifəsi → KDS axını. Rate-limit + CRM link + zone/fee/min/ETA. 67 "qayıb" no-table order KDS-də görünür (bug fix) |
| **Offline mode** | Yox idi — internet kəsilişində order qəbulu mümkün deyildi | Order intake + queue (idempotency-key, **iki-faza reserve/confirm**) + auto-replay + sync panel + force-test rejimi. Payment-lər də queued (7 caller, fake-success yox). Reload-dan sonra banner qorunur |
| **Time-clock / payroll** | Scheduling var idi, punch + payroll export YOX | `get_payroll_export` RPC (LAG pairing + overtime + tips) + admin sheet (preview/CSV/history) + staff CSV + payroll_periods upsert |
| **Analytics** | Statistik səhifə var idi amma staff panel DEAD idi (role column yox), peak hours yox | 24s peak (SİFARİŞ/GƏLİR toggle + PİK), product food-cost/net-profit drill-down, staff çəkiliş dəqiqəsi + CSV, panel canlanıldı (role_id fix) |
| **Purchasing (PO)** | Stock return/waste/level var idi; PO/receiving/cost YOX | PO create (auto ingredient bind) → atomic `receive_purchase_order` RPC (row-lock, partial/full, WAC) → supplier counter (atomic inc/dec). `sync_product_availability` dead-schema fix — anbar artımı ilk dəfə real işləyir |
| **VOID** | Sent xətt void olunanda DB düzülürdü, UI-da sətir GERİ ÇOXURDU (rehydration bug) | Voided/cancelled xəttsələr rehydration-da filtrlənir + `orderIsDead` → sent səttsələr drop. E2E: səttsə yox olur və qalmır |
| **Room-charge / Corporate pay** | HƏMİŞƏ 400 (modal order_id-siz POST) — heç vaxt işləməyib | Modal input-only → parent canonical idempotent flow → reference `order_payments.reference`-da |
| **Append (addItems) offline** | Manual queue idi (dup riski) — blind replay riskli sayılırdı | İki-faza idempotency (reserve→confirm) → **tam auto-replay-safe**; 5xx retry də duplicate-safe |
| **Queue data loss** | Replay cavabı 200 {success:false} olsa da item SİLDİLİRDI (silent order loss) | Business-fail replay = MANUAL-a keçir (insan qərarı), sync toast səbəbi ilə |
| **Devices page** | 500× React duplicate-key error (console spam) | Client dedup (device_id, ən yeni heartbeat) → console 0 |
| **Payroll webhook POST** | SSRF (istənilən URL) + date injection (raw URL interpolation) | YYYY-MM-DD gate + public http(s)-only host guard |
| **Online zone** | Naməlum zone_id → `zones[0]` (yanlış fee/min/ETA) | Explicit-invalid = 400; absent = default; min-order client-da göstərilir + disable |
| **Checkout UX** | "Sifariş et" düyməsi invalid formda click → error toast | Düymə valid olana qədər disabled; delivery zona yoxdursa segment disabled; minimum order hint (progressive disclosure); track link eyni tab-da |
| **Delivery status toast** | Server fail olsa belə "success" toast (transitionDelivery {success:false} ignored) | Result check → real success/error |
| **UI (Apple polish)** | — | Payroll panel auto-load + meaningful empty state; peak-hours redundant footer aradan qaldırıldı; binding docs-a uyğun consistency (hər screen: content-first, one primary action) |
| **Backend integrity** | Fire-and-forget idempotency writes; non-atomic goods-receipt (rollback dead code); read-modify-write races (supplier counter, double receive) | Reserve-before-create + blocking confirm; atomic RPC receive (FOR UPDATE); atomic counter RPC-ləri; in-route auth (middleware fail-open əməliyyatına qarşı) |
| **Delivery fee audit — fee+km pair persisted (11z)** | Fee DB-də idi amma **km YOX** — "nəyə görə bu haqq?" disputesinə cavab verilmirdi (OSRM km session-la ölürdü); rəqib SaaS-lar (Lightspeed/Toast) hər fee-in distance-basisini audit trail saxlayır | `orders.delivery_km numeric(8,1)` (migration) = fee-in cümləsi; server-side 0–500 clamp; DB proof: km 27.9 + fee 8.45 + total 108.45 (creation-da daxil, money-lock ilə qorunur) |
| **Search + map — nationwide OSM gazetteer (bütün AZ küçə/POI/şəhər) + route line on the map (11z)** | Axtarış Bakı+Sumqayıt-la məhdud idi (1,124 küçə); "Nizami, Lerik" / "çaylı, İsmayıllı" sinfi ünvanlar **404 və ya Nominatim-in qeyri-sabit cavabı** (Hacıqəbələ/İsmayıllı heç OSM-də YOXDU → heç cavab); typo-küçə + məlum şəhər = 404; "Nizami Cəfərov 27, Bakı" → km=0 "Bakı, Azərbaycan" (AZ_PLACES lookup-da "lerik" ixtibar + Nominatim coarse-hit 'address' kimi persist); xəritə İKİ NÖQTƏ + radius göstərir, **aradakı yol xətti YOXDU** (rəqib: Wolt/Getir/Uber Eats — route line + distance on map); map dibinə qəfil zoom (maxZoom 16) | **18,252 küçə + 23,177 POI + 106 şəhər** (Geofabrik PBF + osmium pipeline, deterministic build, 100% keyless, committed) — axtarış/geocode BÜTÜN AZ üzrə; **per-tier city matching + first-token tier + typo-suffix fold + fuzzy city (lev≤2)** ("Cayli cucecı, Isemayilli" → Çaylı küç., İsmayıllı rayonu 185.4km ✓; "Nizami cucecı 12, Lerik" → 288.4km + **₼138.70 OOB fee** ✓); **Nominatim coarse-hit → 'area' downgrade** (city/station hit 30 gün persist OLMAZ) + **local city shortcut** (city namizədi = 0 Nominatim call, düzgün OSM centroid — Hacıqəbələ/İsmayıllı belə həll olunur, 2 manuel entry); **xəritədə route xətti**: OSRM actual road polyline (≤120 pts, `geometries=geojson` catch — default polyline5 STRING idi) → yaşıl Apple-Maps üslubu xətt + **KM pill** ("288.4 km") — məsafə map-da da görünür; cached regular = 0 Nominatim + 0 OSRM (geometry də cache-də); fit **maxZoom 14** ("dibinə girməsin" — route overview); suggest/pick/manual-pin — bütün yollar geometry daşıyır. E2E r11z-1..3 console 0 |
| **Delivery pricing + map — radius-kənarı məsafə haqqı (zone-ehtiyacsız) + Apple-üslub xəritə + Marşrut (11y)** | Radius-15 km-dən kənarda (Sumqayıt, Xırdalan, Bərdə…) ünvan seçəndə **fee görünmürdü** ("Zone not found" → ₼0 / "Zone seçin") — rəqiblər (Wolt/Getir) radius-ənarı da **₼/km dinamik haqq** göstərir; xəritə rəngli OSM idi (Apple-üslub istəyi); navigasiya yoxdu; axtarış Nominatim 429-throttle-da **qəfil işləmir** (forward geocode-da `Number(null)=0` reverse-bug — KM 6734.9); dropdown virtual keyboard/map örtürdü; tap = auto-zoom; KM/warning/fee üçlüyü re-pick-də diverge edirdi (₼9.25→₼2.00) | **Zone-ehtiyacsız fee:** radius-kənarı ünvan = ən uzaq zone + (km−max_km)×**₼0.50/km** (server RPC, DB settings-dən; zone yoxdursa km×₼/km; OOB heç vaxt "pulsuz" deyil) → **29.5 km = ₼9.25 GÖRÜNÜR**, zone chip UNSELECTED, **zone-sız order send olunur** (E2E #072/#073); explicit chip = manual win (qorunur); **Apple-üslub xəritə 100% keyless** (CARTO watermark verdi → OSM + CSS filter pale/inverted; tap-də auto-zoom YOX; map div constant-classname fix — React re-render Leaflet-in class-ını silirdi → boş map); **Marşrut** düyməsi → Google Maps directions (key-siz); **3 qat axtarış etibarlılığı:** persistent cache (30 gün, repeat ünvan = 0 API) + lokal gazetteer fallback (Nominatim down/throttle-da belə küçə centroid; typo "Nizamii"→"Nizami" 0 network) + `Number(null)=0` reverse-bug fix; fee box distance-da görünür; feeSeq race guard (stale RPC commit yox, fail = fee sıfırlanmır); dropdown UPWARD (keyboard/map-siz) |
| **Address search — MAP-AS-SEARCH: manual pin + şəhər focus + mikrorayon (11x)** | OSM-də olmayan ünvan (blok/yaşayış kompleksi) = "tapılmadı" + KM sahəsinə əl ilə yazmaq; mikrorayon ünvanları ("bravo sumqayit 9cu mikrorayon") tanınmırdı (ordinal yazılış + Nominatim free-text); Nominatim 429 burst-ləri (1.8 rps policy violasyonu) + (0,0) null-island bug (KM 6734.9); map cəm — yalnız display | **Map = axtarış aləti** (OSM tiles-lərində hər küçə var): ünvan tapılmasa map **şəhərə z13 smooth zoom** + "xəritəyə tıkla — nöqtəni özün qoy" → tap/drag = reverse geocode + OSRM road km + auto zone; **mikrorayon chain** ("9cu"→"9-cü" normalize + "9-cü mikrorayon, Sumqayıt"/"Bravo, Sumqayıt" targeted candidates, hər iki script) → 9-cu Mikrorayon 25.3 km row; Nominatim dissiplini: 1100ms bucket (<1 rps), 500km hard far-guard, null-island reject, concat chain; smooth transitions (pin glide + animated fit, drag-də yank YOX) |
| **Delivery ops — telefon→ünvan · mini-xəritə · yol-KM fee · fuzzy+ev nömrəsi · kurye turları (11w)** | Müntəzəm müştərinin ünvanı hər dəfə əl ilə yazılırdı; seçilən ünvan GÖZƏ görünmürdü (yanlış rayon riski); fee **düz xətt** (haversine) ilə — 10–30% qısa; yazı xətası ("nizamii") + ev nömrəsi ("nizami 12") tanınmırdı; çox sifarişli kurye marşrutu ayrıca dispatch məhsulu (Toast/Square — ayrıca prodlar) | **Telefon → son ünvan avto** (DB, 0 API) — Toast parity; **mini-xəritə** (Leaflet+OSM, key-siz) — venue+pin+zone radiusu, yanlış rayon görünür; **fee = OSRM gerçək yol km** (straight-line yox, haversine fallback); **Levenshtein lokal fuzzy** ("nizamii" → Nizami, 0 API call) + **ev nömrəsi** ("nizami 12" → OSM building); **Kurye turu** — 1 OSRM matrix call → NN stop order → per-leg + cəm km/dəq (≤12 stop) — rəqiblərin ayrı satdığı dispatch qabiliyyəti |
| **Delivery zone + ETA — auto zone (Toast modeli) + OSRM live sürüşmə vaxtı (11v)** | Rəqib analizi (owner: "toast/lightspeed/square-da necedir, manual yoxsa"): hamısı ünvan-dan **auto zone** seçir, amma ETA **statis** zone-range-dir ("20–30 dəq"); bizdə zone 100% manual idi (11t — operator hər sifarişdə chip tapmalı idi) + ETA statik; "20 yanvar berde" → suggest **0 row** (Bərdə lüğətdə yox idi) | **Auto zone (Toast modeli):** KM məlumdur + zone yoxdur → KM-band ilə **auto seç + price**; chip tap = **manual override** (sonra heç vaxt flip olunmur — 11t qaydası qorunur); KM band-dan çıxanda auto re-resolve; bütün radius-lar-dan kənardırsa → zone YOX + amber "**radius kənarında: zone-nu sən seç**" (Toast: "outside delivery area"); send-gate qalır (zone-sız order yox); **OSRM free keyless live sürüşmə vaxtı** (`/api/delivery-eta` — rəqiblərin statik zone ETA-sının əvəzinə dəqiq ünvan üçün real yol dəqiqəsi; 100m grid cache, 6s timeout, graceful fail); lüğət 26→**40 şəhər** + candidate-driven suggest chain (≤2 Nominatim) — "20 yanvar berde" → Bərdə 229.5 km row |
| **Address input — instant 1-char suggest (local gazetteer) (11u)** | Dropdown yalnız 3+ char + ~1.2 s (600ms debounce + Nominatim round-trip) sonra çıxırdı — owner-in "2 yazsam birdən-birə" gözləntisi "yazıram, heç nə olur" idi; Nominatim fuzzy free-text UZAQ match-leri üstə qoyurdu ("niz" → "Aşağı Gövhər ağa məscidi, Şuşa" 270 km, "Nizami küçəsi, Bakı" 0.6 km ÜSTƏDƏ); hər route hər cold-cache-də venue bootstrap chain-i Nominatim-də qaçırırdı (locations lat/lng NULL idi) | **1124-küçə local gazetteer** (Overpass one-time, commit, suffix-dedup: "20 Yanvar"=="20 Yanvar küçəsi") → 1-2 char = **0 Nominatim call, ~1 ms** (birinci keystroke-dan 0.7 s dropdown, browser E2E); 3+ char = Nominatim + local merge (max 8) + **km sort** (ən yaxın üstlərdə — Şuşa səs-səviyyəsi aşağıya); debounce 100/350 ms; venue koordinatları DB-ə persist (instant read) |
| **Delivery address — Google-Maps-stili suggest + manual zone (11t)** | Ambiguity-li ünvan ("20 yanvar" — Bakı-da bir neçə küçə) → sistem ÖZBAŞINA bir rayonu seçirdi (owner: "haranı dedim?"); zone, adres yazılanda **auto-commit** olunurdu (operator seçmirdi); fee box zone-sız **₼0 (pulsuz)** göstərdi; order zone-sız yaradıla bilərdi (server ₼0 bill edir) | **Suggest dropdown** (Nominatim limit=7, `countrycodes=az`, rayon adları görünür, pin + KM chip, keyboard nav, 600ms debounce) — operator **DƏQİQİ yer seçir** (20 Yanvar → 5 namizəd: Bakı Nəsimi 4.7 km / Bərdə / Neftçala / Samux / Yevlax); tap = dəqiq nöqtə + dəqiq KM (≈ yox); **zone 100% manual** — auto-commit silindi, "Zone seçin" state (₼0 deyil), KM dəyişikliyi zone flip-etmir, chip tap KM overwrite-etmir, zone-sız order BLOCK; typing sabit (clean dev) |
| **Delivery autofill — AZ script-muqavimətli geocode + keyless weather (11s)** | Owner-style yazış ("sumqayit niyazi 27A", "sumgait …") yalnız tam OSM-match-də işləyirdi; same-city (Bakı) street-miss km=0 verirdi → UI "Ünvan tapılmadı" + **stale KM keçən ünvanın qiyməti ilə qalırdı** (səssiz yanlış çatdırılma haqqı); şəhərsiz input GƏNCƏ-yə mis-anchor ola bilərdi (repro: 293.7 km); Nominatim xaric match-lərə açıqdı (country bias yox); weather-check yalnız OWM key ilə işləyirdi — key yox = widget + data-weather theme sənədlə | **26 AZ şəhər × (AZ/ASCII/rus-variant) lüğəti + iki-script candidate chain + `countrycodes=az` + 120 km far-guard + venue-city anchor** — owner-style yazışın 4/4 variantı E2E-də tanınır (≈23.7 km / ≈0 km təxmini / binə səviyyəsi); same-city = valid "≈ 0 km (təxmini)" + zone avto ("Bakı Mərkəz 0–15 · ₼2"); stale auto-KM təmizlənir (manual toxunulmur); **keyless Open-Meteo weather** (OWM key üstündür) — `data-weather` theme canlı (Bakı 24° buludlu) |
| **Cash gate — kassa sessiyası bağlaması (11r)** | NAĞD ödəniş kassa/shift-dən asılı deyildi — kassa bağlı olarkən də nağd alınırdı; `p_cash_drawer_session_id` HƏMİŞƏ null idi (fetch destructuring latent bug — binding heç vaxt işləməyib) → gün sonu hesabda nağd pulları heç bir sessiyaya aid etmək mümkün deyildi ("bu pulu kim, hansı növbədə alıb?" — cavabsız); 11q banner satışa toxunmurdu, amma nağd hesabatı körlənirdi | **Variant A sərt gate (server SSOT):** cash (full/split/per-item) + location-da AÇIQ drawer session YOX → 403 `CASH_DRAWER_REQUIRED` (fail-closed); one-tap **Kassanı aç** modal → kassa açılanda **clicksiz auto-retry** (idempotency key); kart/QR/transfer/corporate + order-create HƏMİŞƏ açıq (blok olunmur); **session binding fix** — drawer log rows indi real session-id + order-id ilə bağlanır (E2E: "Nağd ödəniş +10.00₼" → session 9462b5a9…); 3 latent bug E2E-də açılıb-düzəldilib (stale-closure re-loop → `skipPrecheck`; cleanup anchor → `paymentView`; destructuring → `rows[0]`); console 0 |
| **Zone logic + dynamic ETA (11q)** | Bakı Mərkəz: min_km=5 (0–5 km müştəri zonadan XARİC), min_order=3 (Ümumi 15-lə ziddiyyət), ETA boş amma POS "30 dəq" (legacy estimated_minutes fallback); müştəri mərhələsində KM/haqq zona seçimdən sonra da 0.0/₼0; warning "Min sifariş ₼15 — ₼15 daha əlavə edin" aydın deyildi | min_km=0, min_order=NULL (→ global), ETA 20–30 (chip real aralığı oxuyur); chip tap = KM midpoint (7.5) + haqq RPC avto-dolur; **"Məntiq qaydaları" box** settings-də; **`estimate_delivery_eta` RPC**: zona base + LIVE mutfak növbəsi (hər aktiv sətir +2 dəq, cap +30, 30 sn poll) → "50–60 dəq · mətbəx: 18 aktiv sətir"; kassa açılmayıb = non-blocking amber banner + one-tap "KASSANI AÇ" (satış blokLANMIR); ₼ prefix bərabərləşdirildi (input içi) |
| **Board status UX (11p)** | Uzun label-lar ("Hazırdır — Təhvil", "Kuryer Alıb", "Təsdiq Gözləyir"), ikon yox, "#" nömrə önündə, ActionSheet-də ödəniş = pill/chip | Qısa word (Yeni/Təsdiq/Mətbəxdə/Hazırdır/Alındı/Transitdə/Çatdırıldı/Ləğv) + status ikonu (ChefHat/User/Moped/Navigation), sırf rəqəm, ödəniş = düz text (emerald/amber) |
| **Board status axını (11n)** | Chip = derived stage, "ÖDƏNİLDİ" stage idi → 33/34 takeaway kartı progress yox, pullu vəziyyət; `sent/accepted/reserved` rollup dəyərləri tanınmırdu ("Mətbəxdə" → "Təsdiqləndi"); in_transit config yoxdu (pending-ə düşürdü) | Chip = yalnız FULFILLMENT (kuryer maşini > kitchen rollup > order status); ödəniş = total yanında ikon (✓ / hourglass); sent/accepted/reserved/served düzgün axınır |
| **Takeaway/delivery ikonları (11n→11o)** | Mode switcher: Handbag (börüş); board: UserCheck; delivery: Bike | Deep browser search (7 icon seti, Iconify API) → custom: Takeaway = **TakeawayPickup** (person + takeout bag — universal "customer picks up" piktogramı, lucide grid-də), Delivery = **Moped** (Tabler, MIT — Baku kuryer skuteri). Candidate v1 (Hugeicons hand-bag) E2E-də handbag olduğu üçün reject → v2 |
| **Served məhsula yeni porsiyon (11n)** | SERVED xəttsədən eyni məhsulun YENİ porsiyonu əlavə olunmurdu (single-mode-da düymə yoxdu, multi-da kilidlə gizlənirdi — dead end) | "Yeni porsiyon əlavə et" (single + həmişə görünən multi "＋") → fresh draft, kilid yalnız göndərilmiş porsiyona |
| **Serving üsulu (course) (11n→11o)** | Hər məhsula 'main' (Ana yemak) SƏSSİZ təyin olunurdu + cart-da HƏMİŞƏ chip (chaos) | Ayarlar → Mətbəx: `default_course` (4 seçimi); plain tap = null (səsiz default, chip-siz); Mərhələ section yalnız modifier-lı məhsulda (panel-də, default gold); chip YALNIZ real + fərqli seçimdə (Utensils ikon + course-tint, "1 əlavə" mod chip-dən aydın fərqli) |

| **Courier tracking + courier app (12a)** | Kurye = order-da yalnız `courier_name` text — restoran kuryeyi GÖRMƏZDİ ("sifariş haradadır?"); kurye statusu yalnız restorandan irəli gedirdi (kurye zəng etməli idi); **HƏR operator transition təyin edilmiş kuryeyi SİLİRDİ** (RPC `courier_id=p_courier_id` şərtsiz + BDS board `null` göndərir) → assignment sessiz itirilirdi; customer geo-point order-a yazılmırdı → navigasiya nöqtəsi yoxdu. Rəqib: Toast = native driver app + customer tracking (US-only, add-on, hardware lock-in); Lightspeed/Square = **native driver app YOX** — yalnız aggregator (Uber Eats/DoorDash) + üçüncü tərəf (Relay) | **Kurye web-app** (`/courier`, 0 install, PIN login = staff-ın öz PIN-i, stateless token + brute-force guard): aktiv order kartı (customer/ünvan/KM/fee) + **🧭 Google Maps Navigasiya** (keyless) + bir-press axın "Paketet götürdüm"→"Yola düşdüm"→"Təslim etdim" + **live GPS** (~15 s ping → `courier_location`) + bugünkü təhvil siyahısı; **DB `courier_transition` RPC** = operator ilə EYNİ state machine (assignment check + delivered_at + operation_logs, performed_by=kurye); **admin "Kurye xəritəsi" live dispatch map** (30 s poll: mavi venue / qırmızı order / yaşıl kurye + "N dəq əvvəl" freshness + onlayn-off panel + aktiv order-lar); **4 bug fix:** middleware whitelist, PostgREST `or=(id.eq.X)` sintaksisi, **courier-wipe COALESCE** (null = dəyişmə), **customer_lat/lng persist** (yeni sütunlar + POS wiring + `order_items.quantity` fix). **₼0 / 0 aylıq / 0 hardware** (Toast Delivery Services-in eyni qabiliyyəti US-only + add-on qiymətə) — E2E #D081 tam chain + live map + console 0 |

| **Live courier tracking — "Wolt effect" (12c)** | Kurye nöqtəsi 30s poll ilə **tullanırdı** (marker.setPosition) — interpolation/camera-follow yoxdu; **customer-facing live map HEÇ YOXDU** ("Sifarişi izlə" → staff login səhifəsi açılırdı); Supabase Realtime bağlı deyildi | **Realtime** (Supabase postgres_changes, $0) + **smooth-marker engine** (server-time interpolation + ≤8s coast + bearing needle + RAF glide) + **camera follow** (manual pan 4s suspend) admin dispatch map-də + **publik `/track/<order>` customer page** (road-route polyline + hamar kurye marker + canlı ETA geri say + status timeline + məhsullar; PII-free payload). 1 critical bug fix: ping upsert `t`-ni yeniləmirdi → interpolation bütün ping-ləri reject edərdi. E2E: glide + camera-follow + "1 sn əvvəl" realtime freshness + console 0 |
| **Name-number accuracy — "34 saylı məktəb" (12b)** | Exact-POI sorğusunda sistem **fərqli rəqəmli binanı "cavab" edirdi** ("34 saylı məktəb" → "11 saylı Məktəb") — Nominatim free-text + Levenshtein rəqəmi typo kimi müalicə edirdi; OSM-də olmayan binada operator yanıltıcı nöqtə + yanlış fee görərdi | **Name-number guard**: struktural rəqəmlər ("34 saylı", "12 nömrəli", "9-cü") **identity-dir, typo DEYİL** — rəqəm uyğun gəlməyibsə fərqli entitet cavab VERİLMİR → city-focus + 1-tap manual pin (reverse-geocode + fee auto). House number ("Nizami 12") QORUNUR (guard yalnız saylı/nömrəli/-cü pattern-lərində işləyir). 4 bağlanma nöqtəsi (geocode Nominatim-hit, localStreetPoint fuzzy, localFuzzy, suggest rows) + A/B stash-verification + 10/10 unit |
| **METBƏX SWEEP — STATION-SCOPED READY + FALSE-EMPTY BOARD + MODIFIER TEXT + HEARTBEAT (12r)** |
Owner 3 şikayət: (1) modifier-lar chip oldu — evvəl text idi (miqdar vacibdir: bir əlavə ×3, digəri ×1); (2) "sifarişlər modalına girdikdə bir mətbəxin sifarişi digərinə düşür"; (3) "ümumi mətbəxdə servise ver basıram, icra olunur, sonra geri qayırır — qəribə şeylər". Live repro: (A) **Bar (BDS) "Hazırdır" CTA = TAM ORDER idi** — Bar chef-i Main Kitchen-un yeməyini 'ready' edirdi (STANSIYALAR Bar 1/1 + Main 1/1 bir anda; header səhvən SERVİSƏ HAZIRDİR) — birbaşa "bir mətbəx → digər mətbəx" leak; (B) **board yalan "Bütün sifarişlər hazırdır" göstərirdi** — initial load-də (data gələnə qədər) VƏ stations fetch fail olduqda BÜTÜN SESSİYA üçün (`/api/orders` 124 aktiv order qaytararkən 30s boş board — yalnız reload bərpa); uzun dev sessiyasında hər code-edit → Fast Refresh remount → amplifikasiya = owner-in "icra olunur, geri qayırır" görünüşü; (C) device heartbeat **hər 5s 500** (iki browser profili eyni `device_name`, fərqli `device_id` → 23505) |
(1) **Modifier text** (KDS kart + modal, BDS eyni komponent): sükut text sətiri `Standart · Əlavə Losos ×3 · Sesam Toxumu` (×N per-modifier merge; DB/API doğrulandı) — chip-lər aralandı (course + allergen chips qorundu) — E2E r13v dark+light verified; (2) **STATION ACTION SCOPE**: modal CTA + course firing İNDİ yalnız terminal-in scope-unu toxunur (unified = navbar stansiya, BDS = family) — order son stansiya bitəndə rollup ilə təbii 'ready'; scope bitəndə CTA = sükut emerald hint — E2E r13d: Bar CTA → Bar 1/1 + Main 0/1 + header HAZIRLANIR, Main CTA → SERVİSƏ HAZIRDİR, reopen → quiet hint, POS serve → board təmiz (Toast bump-parity: bir stansiya digərinin item-lərinə toxunmur); (3) **loading gate** (spinner + "Yüklenir…" az/en/ru) yalan empty state-in önünə + **stations retry** (3× 800ms + `stationsLoaded`) — board artıq data gəlməyənə qədər heç vaxt "hamı hazırdır" demir; (4) **heartbeat 23505 fallback** (real constraint üzərindən upsert) — 4 eyni-vaxt terminal, 500 yox. Təmiz flow-da "servise ver revert" repro OLMADI (t60 stabil, console 0) — görünən "revert" = (B) + remount artifaqları idi |
| **KDS STATUS REVERT + BUTTON LATENCY + KITCHEN GAP SWEEP (12q)** | "Hazırdır" basandan sonra kart **evvelki statusuna geri qayıdırdı** (3 root cause: optimistic UI YOX idi — 2-3s RPC round-trip (advisory lock + FOR UPDATE + stock + EU pooler) bitmədən kart hərəkət etmirdi; köhnə poll təsdiqlənmiş state-i üst-üstə yazırdı (lost update); DB rollup: order `accepted` amma item-lər `pending` → sadə tick belə order-u geri `pending`-ə düşürdü) + bütün KDS buttonları **2-3s "fikirləşirdi"**. Rəqib pariti gap-i: RUSH / course-firing / 86 DB mexanizmləri FROZEN idi amma **UI YOXDU** (Toast/Square-də chef RUSH+86 edir, 2026 trend = course-based firing) | 3 root cause bağlandı: **optimistic-first handler-lar** (klik anında emerald, fail-də rollback — ölçülən cavab **23ms**) + **fetch seq guard** (superseded respons drop) + **accept item-alignment** (item-lər `accepted`-ə aline → demote bug DB-dən aralandı); qoruma: 15s optimistic merge window + POS floor high-water clamp. Gap sweep UI: **RUSH** (modal ghost pill, active = solid red; kart red border + ⚡RUSH; GÜN marker) + **course firing** (modal Flame pill-ləri — yalnız pending/accepted course-lər) + **86** (modal ✕, `origin:'kds'` shiftGate-exempt — smena bağlı olanda da işləyir) + kitchen role `order.void` (1 DB sətiri, reversible). E2E r12q 7/8 + r12q2 A–G, KDS console 0. **OPEN: POS 115× duplicate-key burst (§6.1)** |
| **KDS "QƏBUL ET" TAM LƏĞV — AVTOMATİK BİR DƏFƏ QƏBUL, SİFARİŞ BİRBAŞA HAZIRLANIR (12p)** | 12o-dan sonra owner: **"bir dəfə qəbul et, ondan sonra görünməsin; sifariş gələndə (POS-dan) buttonun yerində olsun — əlavə qəbul et-ə ehtiyac yoxdur"** — hər GÖZLƏYİR ticket-dəki "Qəbul et" pill (kart + modal footer) mətbəx işçisinə ekstra klik idi; sifariş artıq KDS-də görünürsə mətbəx onu görüb | "Qəbul et" buttonu **TAM SİLİNDİ** (kart pill + modal pending branch + `handleAccept`). KDS terminal hər pending order-ı **bir dəfə, səssiz** auto-accept edir (`acceptedRef` Set, fetch/poll/realtime üzərində; fail = retry; dead-end yox — "Hazırdır" pending-dən ready-yə çatır). `kitchen_accepted_at` indi `/api/kitchen/accept` route-da vurulur (RPC yazmırdı — GÜN Ø QƏBUL + legacy timer base dəqiq; auto-accept-də Ø ≈ 0m). GÖZLƏYİR = transient (~1-8s, KDS açıqkən). E2E r12p 6/6 real-DB: fixture ~8.4s-də auto-accept; **yeni POS sifarişi (Masa 992) accepted_at ≈ created_at (4s), KDS-də birbaşa HAZIRLANIR, DOM-də "Qəbul et" = 0**; console 0 |
| **KDS TICK = HAZIRLIQ PROGRESS (auto-ready/accept YOX) + "SERVİS POS-DAN EDİR" BUTTON→QIET TEXT (12o)** | 12n-dən sonra owner (E2E Wolt screenshot): **"'servis posdan edilir' adlı button ləğv elə olmasın orada; tik oğlanda avtomatik hazır qəbul etməsin sistem; Qəbul et buttonu nə üçündür ki?"** — kök səbəb: tick `mark_item_ready_atomic` çağırırdı → GÖZLƏYİR order bir tick ilə rəsmən qəbul+hazır olur, +3s SERVİSƏ HAZIRDİR + POS chip çevrilirdi (waiter hazır olmayan məhsulu servisə aparardı) | Tick (non-ready) = **yalnız `order_items.prepared_quantity`** (yeni `/api/kitchen/item-prepared` route — plain UPDATE, `kitchen_status` SET-siz → state-machine guard + ticket-emit səsiz; frozen rollup CASE-yi yalnız kitchen_status-a baxır → order statusu eyni qalır, real DB-də verified). **GÖZLƏYİR tick-lənsə də GÖZLƏYİR qalır** (auto-accept yox, "Qəbul et" pill qalır, kart emerald qrupa qalxmır). Un-tick READY item = RECALL qalır. **HAZIRDIR bəyanı = yalnız "Hazırdır" CTA.** Counter + cross-station progress = ticked+ready+served. Ready section footer = **kiçik emerald text** (button YOX — konteynerdə 0 button, E2E-sübut). "Qəbul et" açığa salındı: rəsmi qəbul + `kitchen_accepted_at` (GÜN Ø QƏBUL metriki). E2E r12o 8/8 real-DB (baseline→net sıfır), console 0, tsc clean |
| **KDS UMUMİ BOARD + STANSİYA NAVBAR — dual panel + sub-tab-silindi, Toast modeli (12n)** | 12m-dən sonra owner: **"mətbəxdə umumi olsun, 2 dənə ayrı tab YOXEEE — yuxarıda navbar olsun, fso hər birinə baxmaq üçün"** — 12m-in yana-yana dual panel-ləri (hər birində HAZIRLANIR\|HAZIRDİR sub-tab) rədd olundu: 2 ayrı tab-hissəsi = parçalanmış diqqət; məqsəd = 1 umumi board + yuxarıda hər stansiyaya fasiləsiz baxış | **TƏK umumi board** (aktiv stansiya üçün 1 grid) + **yuxarı stansiya navbar** (Main Kitchen (n) · Bar (n) · GÜN — HAMISI 12m-də silindik qalır; aktiv = dolu pill, pre-12m row pattern). Sort = **ready-first**: stansiyanın bütün payı bitmiş ticket emerald border ilə YUXARIDA, sonra in-progress oldest-first (ən gecikmiş üstə). "Hazırdır" = station-scoped (12m qorunur) → press = kart eyni board-da yuxarı emerald qrupa qalxır + read-only "Servis POS-dan edilir" (KDS-də "Servis et" yox, 12i). Status label = order-level workflow (SERVİSƏ HAZIRDİR...); stansiya bitib+qalan yeyirlərsə = HAZIRDIR. BDS = tək umumi Bar board (navbar yox, GÜN header-də). Navbar click modalı bağlayır (layoutId morph glitch qoruması). E2E r12n 7/7: dual panel/sub-tab 0, ₼=0, recall→pending→Hazırdır→yuxarı qalxma (net DB effekti sıfır), light pill+amber oxunaqlı, console 0+0, tsc clean |
| **KDS/BDS DUAL STATION BOARD — HAZIRLANIR\|HAZIRDİR per-station tabs + station-scoped "Hazırdır" + priceless ticket (12m)** | 12l-dən sonra owner: **"həm mətbəx həm bar statuslarını ayrı Kitchen bölməsinə keçmədən rahat gör; bölmələr qarışmasın; 'Servis et'-i axından çıxar; qiymət KDS/BDS-də olmasın; HAMISI tab-ı sil; soldakı məhsula klikləyəndə arxada collapse düzəlt; light-də sarı görünmür"** — köhnə: 1 tab-row (HAMISI/MK/Bar/GÜN), "Hazırdır" = BÜTÜN order (stansiya digərini gözləməli idi), ticket-də `₼` qiymət + plain text spec, modal placeholder = estimate (grid reflow) | **Sabit side-by-side panel-lər** (`/admin/kds` = MK+Bar; `/admin/bds` = tək Bar, eyni anatomiya) — hər biri öz **HAZIRLANIR\|HAZIRDİR** sub-tab-ı. **Station-scoped "Hazırdır"** (`handleMakeReady(orderId,itemIds)`) — bar içkini hot cooking-dən BAĞMSIZ bitirir; press → ticket HAZIRLANIR-dan silinir + HAZIRDİR-ə keçir (eyni order 2 tab-da YOX; digər panel hələ HAZIRLANIR, progress line `MK 0/1 · Bar 1/1`). **HAZIRDİR = read-only** (serve = POS floor, 12i — KDS-də serve düyməsi yox); "Qəbul et" = quiet header pill. **Ticket = priceless + Apple chips**: source (İÇƏRİDƏ/ÇATDIRILMA/GEL-AL)+ikon, course/allergen/modifier chip, `₼` YOX (E2E count 0), qeyd = **`Qeyd: xxx`** (label ayrıca). **Zero-reflow modal**: klik-də kartın REAL offsetHeight ölçülür → placeholder dəqiq hight (E2E Δ0px, qonşu shift 0px). **Light amber** `amber-600→700` (oxunaqlı). GÜN → header (rahat yer). E2E r12m 8/8 + console 0 (key-warning fix), tsc clean |
| **AZ lüğət SSOT — "serving" status = tam phrase (12l)** | 12k-dən sonra owner: **"servisə hazırdır olur brat — duzgun istifadə et lüğətdən"** — floor chip `kds_chip_serve` = bare `SERVİSƏ` (yalnız dative, əməl-siz) qalmışdı; lüğət-də tam phrase = dative + "hazırdır" (BDS-dəki "TƏHVİLƏ HAZIRDİR" pattern-i ilə eyni) | `kds_chip_serve`: az **`SERVİSƏ` → `SERVİSƏ HAZIRDİR`** · en `TO SERVE` → `READY TO SERVE` · ru → `ГОТОВ К ВЫДАЧЕ` — 2 istifadə yeri (floor chip + KDS GÜN ticket pill) eyni dil. E2E r12l: bare variant DOM-da 0, layout overflow 0, console 0+0 |
| **AZ imla SSOT (KDS/BDS/status label-lar) + DOLU→AKTİV keçid sübutu (12k)** | 12j-dən sonra owner: "hərflərin səhvi — SƏRVİSE (sonu E deyil Ə), həm KDS/BDS/status; dolu sonra aktiv status keçidi işləmir" — i18n-də 10 imla xətası (SƏRVİSE/SƏRVİSE HAZIRDİR, Sərvil et/Sərvil POS-dan edilir, **Item (ingilis!)**, İstihsal, Ø Hazırlanma, "sifariş yoxdur", Kur'er); "keçid yoxdur" şikayəti = 12j stuck-chip dövründə donmuş pill (opacity:0) | **10 az.ts fix** (SERVİSƏ / SERVİSƏ HAZIRDİR / Servis et / Servis POS-dan edilir / Məhsul / İstehsal / Ø Hazırlıq / İstehsal / "qeyd olunmayıb" / Kuryer) — KDS+BDS+floor-chip bloku tam audit, component hard-coded qalıq 0, DOM-regex təsdiqi (köhnə variant 0); **DOLU→AKTİV keçid E2E-sübut** (YENİ OTURUŞ → göndər → ₼100 + GÖZLƏYİR, opacity 1, API `ks:'pending'`) — keçid 12j single-persistent-element fix-dən sonra canlı işləyir (terminal = yeni build/hard reload tələb olunur). E2E r12k 3/3 PASS, console 0+0 |
| **POS floor statusları + KDS GÜN (All Day View/İstehal/Produktivlik) + ✓ POS-pattern animasiya + CTA blink removal (12j)** | 12i-dən sonra owner: **"POS-da 'Hazırlanır', 'Servis et', 'Servis edildi' statusları görünmür — aydın və ardıcıl göstər; All Day View, production counts, kitchen productivity əlavə et; tik-ə POS-dakı transition; 'Sifarişi tamamla'/'Qəbul et' blink-ini qaldır"** — floor chip ready/served GÖZMÜŞDÜ (12i hidden-set) + Toast-ın metbəxdəki qalan 3 edge-i (All Day View, production counts, kitchen productivity) hələ yoxdu | **Floor chip = BÜTÜN liv state** (GÖZLƏYİR → HAZIRLANIR → QİSMƏN → **SƏRVİSE** → **SERVİS EDİLDİ** — KDS ilə EYNİ dil; terminal-lar yox). **KDS GÜN tab**: metrics (SİFARİŞ/SƏTR/İSTİHSAL/Ø QƏBUL/Ø HAZIRLANMA) + **İSTİHSAL** (per-product qty, served/completed) + SİFARİŞLƏR (time/title/qty/status/dəq) — Toast All Day View + production + productivity = **CƏMİ 1 endpoint** (`/api/kitchen/daily`, location-scoped, 30s refresh). **✓ tick = POS ProductGrid pattern** (persistent, tap-da [1→1.18→1] 0.45s + glyph spring pop — measured 1.179@184ms). **CTA blink = YOX**: tek persistent button, text+color in-place morph (measured: 0 removed frames, atomic swap). **3 E2E-root-cause bug:** (1) merged parent `status='merged'` isOccupied-dən yoxdu → group chip GÖZMÜRDÜ; (2) `merged_groups` child-lar `kitchen_status` daşımırdı → server SSOT; (3) **STUCK AnimatePresence** — kitchen↔status chip swap exit resolve olunmurdu → gələn chip `opacity:0`-da DONURDU = **gözə görünməz status** (owner complaint-ın gizli yarısı; DOM outerHTML ilə sübut) → **tek persistent element** (key/exit/initial YOX — stuck-invisible sinifinin özü aradan qaldı). E2E r12j (5 run): 10/10 kart çip VİSUAL (opacity 1) ✓, GÜN real data ✓, tick/blink measured ✓, console 0+0 |
| **KDS/BDS/POS — kanonik mətbəx workflow: qəbul → hazırlanır → hazırdır → sərvise → servis edildi (12i)** | Owner: "metbex qəbul etməlidir → status hazırlanır; hazırdır basanda uje hazırdır, 2-3 s sonra sərvise çevrilir; servis edənən servis edilmiş olar; **servis et buttonu POS-da** olacaq, metbəxdə yalnız qəbul + hazırdır; stationslar bir-birindən xəbərli; sifariş tipini/modifikatorunu/neçə edəd/allergeni rahat görmək; tik çıxarmaq olmazdı; məcburi tik olmazdı; 'tamamla → itir → geri gelir' bug" | **Full state machine** (frozen registry + rollup üzərində, 0 yeni status): KDS = "Qəbul et" + "Hazırdır" (+ per-item ✓ **TOGGLE** — un-tick = registry recall edge `ready→pending`); HAZIRDIR → **+3 s DERIVED** (kitchen_ready_at, 1s tick, keyless) → **SƏRVİSE HAZIRDİR**; POS "Servisə Ver" (floor action, `/api/orders/serve` → `mark_order_served_atomic`, all-ready invariant + 409) → **SERVİS EDİLDİ** hamısında (KDS/BDS/floor badge). Məcburi-tik gate SİLİNDİ ("Hazırdır" = 1 tap bütün order). **Görünürülük:** order type BOLD, status label state-color, item spec = 3 ayrı sətir (modifier zinc / note amber / **allergen red-bold** "⚠ Süd"), ×qty bold — KDS+BDS eyni dil. **Cross-station:** kartda "Main Kitchen 2/3 · Bar 0/2" progress; station board-da bütün-order "Hazırdır" gözəlir + "Digər stansiyalar hazırlayır" hint. **4 bug fix (hamısı E2E-catch):** "tamamla→itir→geri" (optimistic delete), POS serve gate (`table.status==='ready'` = masa state → heç vaxt görünmürdü → `kitchen_status`), INVALID_TRANSITION toast (registry-də `confirmed→served` edge YOXDUR), floor badge else-branch ("served" → "Hazırlanır" yazırdı). E2E r12i (4 run): workflow tam loop ✓, un-tick ✓, 30s blink-watch 0 node-change ✓, POS serve "Servisə verildi" 0-error ✓, BDS Mətbax states ✓, console 0+0 |
| **KDS/BDS — full Apple visual reset + stations hot+bar only (12h)** | 12g-dən sonra owner: **"hele de cox cirkindiree — kartın üstündəki çip/text-lər, yüngül polish deyil Apple felsefəsi, hər yeri dəyiş"** — kartlar hələ chip/pill spam-lı idi (timer pill, ÇATDIR badge, partner stripe, zone chip, station chips, kitchen chip); KDS top-tabs-də **Grill/Prep/Service** station-ları qalırdı (konfiqurada 5 kitchen station, amma mətbəx = hot line + bar) | **0 çip 0 pill 0 nested box** (hər iki tahtada): state = **yalnız border color + text color** (allReady emerald / GEÇİKME red-400 + red dot + red elapsed / KRİTİK red-300); KDS kart = düz text rows (item + 1 spec sətiri: amber note > zinc modifier) + **40px ✓** (pending hairline dairə → ready DOLU emerald dairə); CTA "Sifarişi Tamamla" yalnız allReady-da; BDS kart = **məlumat səthi** (customer · telefon, BİR sakit ünvan sətiri "ünvan · ₼fee · ETA" — ETA overdue = red text, flat item rows, "Mətbax: GÖZLƏYİR/HAZIRDIR" color-only) — kartda yalnız takeaway ALINDI qalır, digər hərəkətlər modal-da; tabs = düz text (HAMISI 8 · Main Kitchen 4 · Bar 1). **DB: Grill/Prep/Service SİLİNDİ** (migration 20261002050000, trigger-safe remap: 9 products + 211 item snapshot → Main Kitchen, 0 dangling) — station SSOT = hot line + Bar (gələcəkdə arta bilər — tab avtomatik). Modal = 12g morph qorunur, səth flat. E2E r12h: çip 0, nested box 0, picker-in-modal ✓, title bug catch+fix, console 0+0 |
| **KDS/BDS — POS tick transition morph-to-centered-modal + red delay (12g)** | Owner 12f-in in-place expand-ını rədd etdi: **"elementin morph edərək ekranın ortasında modal kimi açılmasını nəzərdə tutmuşdum" + "Gecikmə qırmızı rəngdə göstərilsin" + "POS-da olan tick transition var — eynisindən istifadə edək"** — POS ProductGrid-də mövcud, təmizlənmiş shared-element pattern (layoutId card⇄centered modal, spring 300/30/0.8, invisible grid-slot placeholder = framer crossfade-glitch qoruması) KDS/BDS-də İŞLƏMİRDİ; 12f = kart yerində böyüyürdü (grid reflow + chevron + "dashboard" hissı); gecikmə = violet (owner: qırmızı olsun) | **KDS/BDS tap = eyni POS tick transition**: kart morph edərək **centered modal** olur (appleBackdrop blur, X rotate-90, ESC + backdrop-tap; grid slot invisible placeholder — reflow YOX); **GEÇİKME = solid red chip + red border** (KRİTİK-dən güclü, flood YOX; all-ready kart emerald border qorunur); modal = Apple surface (rounded-4xl shadow-elevated; MÜŞTƏRİ/STANSIYALAR/ETA/modifiers/notes tam kontekst; sticky footer: tek-tek ✓ + "Sifarişi Tamamla" invarianti); BDS modal = ÜNVAN/fee/ETA + MƏHSULLAR + Kuryer seç (picker modal içində, collapse YOX). Rəqib KDS (Toast) = tap-to-expand in-place; SAITO = POS-un öz premium shared-element dili (morph) — eyni terminalda eyni motion qrammatikası. E2E r12g: morph center/backdrop/placeholder ✓, ESC ✓, picker-in-modal ✓, red chip 8/8, console 0+0 |
| **KDS/BDS UI — Apple card redesign + in-place expand + premium chime (12f)** | Ticket kartı "düz dashboard" idi: tap = **heç nə** (detala çıxış YOX — item notes KDS-də **təmmən görünmürdü**, modifier clipped, customer/station/ETA konteksti ticket-da yoxdu); gecikmə = **FULL KART QIRMIZI FLOOD** (owner: "cirkin olur"); ✓ target 24px (kitchen tablet + hərəkət edən əl üçün kiçik); yeni sifariş səsi = kəskin 880/1100 Hz beep + AudioContext gesture-gate (idle page-də səs udulur); rəqib KDS (Toast) = tap-to-expand ticket + full detail in-place | **IN-PLACE EXPAND** (tap = eyni kart yerində böyüyür, modal YOX — customer + per-station progress + ETA + tam modifier pills + item notes; collapsed-da da notes görünür) + **subtle delay state** (neutral kart, yalnız violet/red border) + **40px ✓ touch target** + **Apple motion** (entry/exit springs, layout reflow, chevron morph, `prefers-reduced-motion` gate) + **premium bell chime** (E6+shimmer+body sintezi, 5ms attack/1.2s decay, gesture-unlock — Outlook asset login wall-ın arxasında NOT_FOUND → keyless WebAudio) + **BDS eyni dil** (MƏHSULLAR + customer note in-place; "Kuryer seç" picker kartı collapse ETMİR). E2E r12f: in-place h 289→435 (KDS) / 296→346 (BDS), red flood 0, console 0 |
| **KDS/BDS operational hygiene — 24h service window (12e)** | Hər iki ops tahtasında **vaxt filtri YOXDU**: KDS ticket-ləri HəFTƏLƏRLE tahtada qalırdı ("3d 16h" kart 1 dəq ticket-in yanında; 11 ticket-dan 5-i gün-köhnə); BDS-də 2 dəq köhnə order **47 günlük GÖZLƏYİR zombie-lərin altında** gömülürdü (DB: 112 non-terminal order, 103-ü >24h, ən qocası 17 gün) + **oldest-first sort** (yeni sifariş ekran dibində — dispatcher scroll edirdi) + KDS modifier siyahısı **sessiz kəsilirdi** (tooltip yox, mətbəx tam spec-i oxuya bilmirdi) | **24h service window** hər iki tahtada (KDS grid+count, BDS Bütün tab — köhnə ticket-lər gizlənir, **DB toxunulmur**) + **BDS newest-first sort** (dispatcher taze işi üstdə görür; KDS qəsdən oldest-first qalır — ən gecikmiş üstə, mətbəx üçün düzgün) + modifier **truncate + hover-tooltip**. Rəqib KDS-ləri (Toast/Square) yalnız current-service ticket-larını göstərir. E2E r12e: KDS 13→8 ticket, gün-chip 0, station board re-verified, BDS top card = 11m order + 6 kart hamısı <24h, console 0 |

**Qeyd:** "BEFORE" sütunu = round 7 audit-inin (bu faylın ilk versiyasının) verified durumu.
Hər AFTER claim = round jurnalında (MASTER_FEATURE_MAP.md §10, 11a–11g) commit + E2E
kanıtı ilə dəstəklənir.

## 1. BƏRABƏR / QÖNÇƏ (parity or better)

| Feature | SAITO | Toast | Lightspeed | Square |
|---|---|---|---|---|
| Floor/table management (merge, transfer, status chips) | ✅ + rotation-morph UI, kitchen-status per card | ✅ | ✅ | ✅ (Square for Restaurant) |
| Per-instance modifiers (multi-instance pills, independent specs) | ✅ **daha dərin**: hər instance öz modifier/variant/course/allergen/hold saxlayır (E2E verified) | ✅ (line-level) | ✅ | ✅ |
| Allergens (auto-icon, per line, kitchen warning) | ✅ | ✅ | ✅ | ⚠️ məhdud |
| Payments: cash/card/QR/transfer/corporate/gift/room charge + split (amount & per-item) + tip | ✅ 8 method + item-level split | ✅ | ✅ | ✅ |
| Refund: full/partial/item-level + inventory fate (stock/waste/none) + approval threshold + idempotency (server) | ✅ **daha sərt**: DB atomic, net-paid guard, idempotency keys | ✅ | ✅ | ✅ |
| Cash drawer (shift open/close, in/out, no-sale, drop, deposit, Z, manager lock) | ✅ | ✅ | ✅ | ✅ |
| Shift/role/PIN permissions + audit log + approval requests | ✅ | ✅ | ✅ | ✅ |
| Reservations + waitlist + pre-order | ✅ | ✅ | ✅ | ✅ |
| Delivery (courier, zones, fee, status) + Takeaway | ✅ | ✅ | ✅ | ✅ (Square Delivery) |
| Delivery courier tracking + courier-side app + **customer live tracking** | ✅ **daha dərin**: live GPS dispatch map + kurye PIN web-app (0 install) + Google Maps nav + **12c: Supabase Realtime + smooth interpolated marker + camera follow + PUBLIK `/track` customer live map** (road-route + canlı ETA + timeline) — **100% keyless/₼0** | ✅ Toast Delivery Services (driver app + route optimization + **customer tracking link**) — **US-only**, add-on, hardware lock-in ($799+, 24–36 ay) | ⚠️ **native driver app YOX** — aggregator (Uber Eats/DoorDash/Grubhub) + üçüncü tərəf (Relay) / manual | ⚠️ **native self-delivery driver app YOX** — Square Online + aggregator-ə köklənir; öz kurye-lərdə tracking yox |
| Kitchen (KDS) + per-item status (cooking/ready/served) | ✅ + station boards + per-item ✓ (atomic, **40px touch**) + **12e: 24h service window** + BDS newest-first + **12f: premium chime** + **12g: POS tick transition — tap = morph-to-centered-modal (customer/stations/ETA/full mods/notes) + red delay state** + **12h: full Apple visual reset (0 çip/0 pill, state = border + text color, flat hairline lists) + station SSOT = hot line + Bar** + **12i: kanonik workflow (qəbul → hazırlanır → hazırdır → +3s sərvise → servis edildi; KDS = qəbul+hazırdır, SERVE = POS floor action) + ✓ TOGGLE (un-tick) + per-instance spec visibility (modifier/note/allergen) + cross-station progress + 4 bug fix** + **12j: GÜN = All Day View + İSTİHSAL (production counts) + Ø QƏBUL/Ø HAZIRLANMA (kitchen productivity) — Toast-ın qalan 3 edge-inin HAMISI; ✓ tick = POS badge pattern (persistent, [1→1.18→1]); CTA = persistent button (0 blink, measured)** + **12n: UMUMİ BOARD + stansiya navbar (Main Kitchen·Bar·GÜN) — dual panel + HAZIRLANIR\|HAZIRDİR sub-tabs silindi (Toast modeli); ready-first sort (emerald yuxarıda), station-scoped "Hazırdır" + priceless Apple-chip ticket qorunur** + **12o: tick = hazırlıq progress (prepared_quantity) — auto-accept/auto-ready YOX (order GÖZLƏYİR qalır); HAZIRDIR bəyanı = yalnız "Hazırdır" CTA; "Servis POS-dan edir" = quiet text (button yox)** + **12p: "Qəbul et" TAM LƏĞV — KDS auto-accept (bir dəfə, səssiz), sifariş gələndə birbaşa HAZIRLANIR, kitchen_accepted_at stamp** + **12q: REVERT + LATENCY fix (optimistic-first 23ms + seq guard + accept item-alignment) + GAP SWEEP: RUSH UI (toggle + red kart + GÜN ⚡) + COURSE FIRING UI (modal Flame pill-lər) + 86 UI (modal ✕, smena bağlı olanda da — origin='kds')** + **12r: STATION-SCOPED READY (modal CTA + course firing — bir stansiya digərinin item-lərini ready edƏMƏZ; Toast bump-parity) + false-empty board aralandı (loading gate + stations retry) + modifier spec = text (×N)** + **12s: modal = station qrupları (hər mətbəx öz item-ləri; digər = read-only İZLƏMƏ) + BDS WATCH tab (Bar terminal-da Kitchen read-only) + X/86 düyməsi SİLİNDİ (owner — 86 = POS-only) + ORD-kod YOX + modifier HƏMİŞƏ ×N** — Toast kitchen-parity YALNIZ All Day View idi → **CAPALI** (detal: §1b + **§1c meyar-meyar müqayisə + təkliflər**) | ✅ | ✅ | ✅ |
| Campaigns/coupons (server-validated, min-order, dining window) | ✅ | ✅ | ✅ | ✅ |
| Loyalty (points spine, redeem at payment, reverse on refund) | ✅ | ✅ | ✅ | ✅ |
| CRM customers (shared source, phone, linking) | ✅ | ✅ | ✅ | ✅ |
| Receipts (thermal print queue, reprint) | ✅ | ✅ | ✅ | ✅ |
| Multi-location, i18n (az/en/ru), light/dark, reduced-motion | ✅ | ⚠️ | ✅ | ⚠️ |
| Device pairing/heartbeat/remote commands | ✅ (Phase 0–1) | ✅ (Toast hardware) | ✅ | ✅ (Terminal) |

## 1b. KITCHEN DETALI MÜQAYİSƏ (12q → 12s) — SAITO vs Toast vs Square vs Lightspeed

> Rəqib data = web-verified 2026-10 (HANDOFF_12Q §3): **Toast** = overall best KDS
> (stations, bump/recall, timers, expo, analytics, offline); **Square** = KDS $20/mo
> add-on (rəng kodlu ticket-lər, bump bar ayrıca, 10"); **Lightspeed** = ən yaxşı
> course management (15", expo + müstəqil stansiya ekrani, sophisticated routing).
> 2026 trend-ləri: course-based firing rules, stansiya workload balancing, per-ticket ETA.

| Sahə | SAITO (12q, repo-verified) | Toast | Square | Lightspeed |
|---|---|---|---|---|
| **Stations & routing** | Tək ümumi board + station navbar (Kitchen · Bar · GÜN); per-item station routing; cross-station progress (12i); **12s: modal station qrupları + WATCH tab (digər mətbəx read-only)** | Ən çox station + item routing (best-in-class) | Stations + routing (basic) | **Ən yaxşı** sophisticated routing + müstəqil stansiya ekranı |
| **Auto-accept** | Səssiz auto-accept, bir dəfə (12p) — GÖZLƏYİR = transient ~1-8s | Auto-accept (default) | Manual accept | Manual/auto (config) |
| **Bump / recall** | **12u: BUMP BAR** (xl+ rail: aktiv stansiya ticket-ləri tək-press = station-scoped Hazırdır; ready = sükut emerald tile; Expo = SERVİSƏ VER tile) + un-tick READY item = RECALL (ready→pending, frozen registry edge) | Bump bar (tək-press) + recall | Bump bar (ayrı) | Bump + recall |
| **Timers / delay** | Per-ticket timer (acceptance-based) + GEÇİKME = solid red (12g) + 24h service window (12e) | Timer + delay highlight (best) | Rəng kodlu ticket-lər (10") | Timer + course timing |
| **Priority / RUSH** | RUSH toggle (12q): modal red pill + kart red border + ⚡RUSH + GÜN marker; DB `is_rush` | RUSH + priority queue | Priority flag | Priority |
| **Course firing** | Course pill-ləri (12q): `fire_course_atomic` → preparing; yalnız pending/accepted course-lər — 2026 trend parity | Course firing rules | Basic | **Ən yaxşı** course management |
| **Expo** | 🟡 YOXDU (Addım 2 — MFM §15) | Expo station | Expo | Expo + müstəqil ekrani |
| **86 / item void** | **12s: modal ✕ SİLİNDİ (owner)** — 86 = POS-only (comp/waste + PIN); state machine `item_kitchen_terminal('voided')` + `origin:'kds'` exemption DB-də qorunur | 86 (chef) | 86 | 86 |
| **Notes / allergens** | Per-item: modifier text **HƏMİŞƏ ×N (12s)** + amber Qeyd + ⚠ allergen chip (red bold) — KDS ticket-da tam spec | Per-line notes + allergens | Notes + allergens | Notes + allergens |
| **Auto-print** | ✅ print queue + LAN agent (pr v1 09-20) + per-station printer routing | ✅ auto-print + fallback | ✅ | ✅ |
| **Realtime / latency** | Supabase Realtime + 5s poll fallback + **optimistic UI — ölçülən cavab 23ms** (12q) | Realtime (native) | Realtime | Realtime |
| **All-day analytics** | GÜN tab (12j): SİFARİŞ/MƏHSUL/İSTİHSAL/Ø QƏBUL/Ø HAZIRLANMA + top-30 + bütün tickets (+RUSH marker 12q) — 1 endpoint | All Day View + analytics (best) | Basic | Analytics |
| **Per-station analytics** | ✅ (`kitchen_analytics` + `admin/kitchen-analytics`) | ✅ | ⚠️ | ✅ |
| **Per-ticket ETA (kitchen)** | YOXDU (delivery ETA var — OSRM; 2026 trend-də rəqiblərdə peyda olur) | ⚠️ | YOX | ⚠️ |
| **Offline (kitchen)** | YOXDU (POS offline order intake = 11e phase 1) | ✅ (Toast offline) | ⚠️ | ⚠️ |
| **Third-party routing** | YOXDU (kurye = öz web-app 12a — aggregator yox) | ✅ (DoorDash/Uber Eats) | ✅ (aggregator) | ✅ (aggregator) |
| **Hardware** | Web KDS — istənilən tablet/PC (₼0 hardware) | Toast Station + stand ($799+, 24–36 ay lock-in, US) | KDS = **$20/mo add-on**/terminal, 10" | 15" kitchen screen |
| **Pricing** | Öz məhsul — self-hosted, ₼0 | Plan + hardware (US-only) | Plan + $20/mo | Plan (bundled) |

## 1c. METBƏX SİSTEMİ — MEYAR-MEYAR MÜQAYİSƏ + HÜKÜM (12s → 12u)

> Owner (12s): "Saito-nu Toast, Lightspeed və Square mətbəx sistemləri ilə müqayisə et:
> istifadə rahatlığı, sifariş idarəetməsi, mətbəx ayrımı, status izləmə, modifikatorlar,
> performans və digər əsas meyarlar üzrə üstün və zəif tərəfləri müəyyən et. Sonda
> əlavə praktik təkliflər ver." Rəqib fakt-ları = 12q-də web-verified (2026-10); SAITO =
> repo + live DB + E2E r14/r15 verified (12s).

### Meyar-meyar

| Meyar | SAITO (12s) | Toast | Square | Lightspeed |
|---|---|---|---|---|
| **İstifadə rahatlığı** | Tək ümumi board + station navbar (Kitchen · Bar · GÜN); **səssiz auto-accept** (chef "qəbul et" basmır); **23ms optimistic cavab**; 40px touch; 2 tema; Apple motion | Ən pürüzsüz workflow, amma daha çox ekran/cihaz; US-first terminologiya | Ən sadə (tək grid) — öyrənmə ~5 dəq | Ən dərin (course + stansiya ekranı) — öyrənmə əyisi dik |
| **Sifariş idarəetməsi** | Per-item FROZEN state machine (atomic RPC + rollup); tick = progress (`prepared_quantity`, auto-ready YOX); course firing; RUSH; 24h service window; 86 = POS-only (12s) | bump/recall/86/expo full; per-item status | Bump bar + basic item status | Course-based routing + item status |
| **Mətbəx ayrımı** | Per-item station routing + **station-scoped ready (12r)** + **WATCH mode (12s)** — digər mətbəx eyni terminal-da read-only (status/ready/count, idarə YOX) + modal station qrupları | Ən çox station + item routing; ayrılıq = ARAZI stansiya cihazları | Basic stations | Ən yaxşı routing + müstəqil stansiya ekranı |
| **Status izləmə** | Kanonik workflow (qəbul→hazırlanır→hazırdır→+3s servisə→servis edildi); `kitchen_accepted_at`/`kitchen_ready_at` stamps; per-ticket timer + KRİTİK/GEÇİKME; GÜN = Ø qəbul / Ø hazırlanma / istehsal | Timer + delay highlight (best-in-class) + All Day View | Rəng kodlu ticket-lər (basic) | Timer + course timing |
| **Modifikatorlar** | **Per-instance model** (2 eyni məhsul fərqli spec — line-level isolation); KDS-də **HƏMİŞƏ ×N miqdar (12s)**; qiymətsiz; notes + allergen | Ticket-da modifier görünür | Basic modifier text | İyi course/modifier |
| **Performans** | Web KDS — istənilən tablet/PC (₼0 hardware); UI cavab 23ms (optimistic); RPC round-trip ≈2-3s (EU pooler→Baku); realtime + 5s poll | Dedikasiya hardware (Toast Station) — ən sürətli + offline | 10" KDS cihazı | 15" kitchen screen |
| **Offline (kitchen)** | ❌ YOXDU (POS offline intake = 11e p1; KDS özü offline-də kördür) | ✅ BEST (offline KDS) | ⚠️ | ⚠️ |
| **Expo (serving qapısı)** | 🟡 YOXDU (Addım 2) | ✅ | ✅ | ✅ + müstəqil ekrani |
| **Per-ticket kitchen ETA** | YOXDU (delivery ETA var — OSRM; 2026 trend) | ⚠️ | YOX | ⚠️ |
| **Aggregator routing** | YOXDU (kurye = öz web-app 12a — AZ marketi aggregator-a az asılıdır) | ✅ DoorDash/Uber Eats | ✅ aggregator | ✅ aggregator |
| **Qiymət** | Self-hosted, ₼0 (öz infrastruktur) | Plan + $799+ hardware (24-36 ay lock-in, US-only) | Plan + $20/mo KDS add-on/terminal | Plan (bundled) |

### ÜSTÜN TƏRƏFLƏR (SAITO)

1. **WATCH mode — read-only cross-kitchen (rəqiblərdə YOXDU eyni terminal-da).** Toast/Square/Lightspeed hər stansiya üçün ARAZI cihaz satır (Toast Station $799+, Square 10" $20/mo, Lightspeed 15"); SAITO-da 1 tablet = öz mətbəx + digər mətbəxin live izləməsi + GÜN. Owner tələbi "idarə etməsin, izləsin" = rəqiblərin hardware-ı ilə həll etdiyi ayrılığı SAITO scope/permission ilə həll edir.
2. **Station-scoped ready (12r)** — bir stansiya digərinin item-lərini ready EDƏMƏZ; cross-station "ready leak" DB/UI scope ilə qarşısı alınır (Toast-dakı bump-parity).
3. **Per-instance modifier model + HƏMİŞƏ ×N (12s)** — rəqiblərdə eyni məhsulun 2 sətiri modifier-ləri "merged" görünsə belə, SAITO-da hər sətir öz spec-ini daşıyır + miqdar heç vaxt gizlənmir ("Əlavə Losos ×3" / "Standart ×1").
4. **23ms optimistic cavab** — web KDS üçün ölçülən ən sürətli interaksiya; dedikasiya hardware lazımsız, istənilən qədim tablet-də eyni UX.
5. **GÜN (All Day View, 12j)** — Toast-ın qalan 3 edge-inin HAMISI: production count, Ø qəbul, Ø hazırlanma (+ RUSH marker 12q).
6. **FROZEN state machine + audit spine** — hər transition registry + atomic RPC + operation_logs; "status geri qayıtdı" sinfi bug 12q-da kökündən aralandı (seq guard + optimistic merge window + accept item-alignment).
7. **24h service window (12e)** — bağlanmamış ticket board-da həftələrlə qalmır (rəqiblərdə manuel cleanup).
8. **AZ yerelliği** — az/en/ru + AZN + lokal terminologiya; Toast US-only, Square/Lightspeed US-first.

### ZƏİF TƏRƏFLƏR (SAITO — rəqibə qarşı)

1. ~~**Offline KDS YOXDU**~~ — **✅ BİTTİ (12u):** KDS offline buffer — tick/ready/86/serve lokal queue (localStorage, reload-dan qorunur) + healthy-poll auto-replay (5xx keep / 4xx failed-flag + manual retry / stale-drop reconciliation); offline reload = cached board + cached stations + "son sinxron" note (r19/r20 bug-ları bağlandı: 503 stations restore, boş-board clobber qadağası). E2E r19/r20c.
2. ~~**Expo station YOXDU**~~ — **✅ BİTTİ (12u → 12v):** Expo "serving qapısı" — bütün stansiya ready olmadan order Expo-ya düşmür (all-ready invariant, FIFO `kitchen_ready_at`). **12v (owner): KDS Expo = VIEW-ONLY** (servis button/text YOX — "servis POS-dan verilir"); servis = POS "SERVİSƏ VER" (`mark_order_served_atomic`). E2E r20 + r21 (view-only + POS serve → chip).
3. ~~**Bump bar YOXDU**~~ — **✅ BİTTİ (12u):** xl+ rail (w-44) — aktiv stansiya ticket-ləri tək-press (station-scoped Hazırdır), "N qalıb · ≈M dəq", ready = sükut emerald tile; Expo tab-da = SERVİSƏ VER tile-lər. E2E r17/r20.
4. ~~**Per-ticket kitchen ETA YOXDU**~~ — **✅ BİTTİ (12u):** kart + bump chip "≈ N dəq" — N = bugünkü Ø HAZIRLANMA (`/api/kitchen/daily` avgReadyMin, 5-min refresh); elapsed > N → amber (GEÇİKME qırmızı güclü qalır); watch tab-da YOX. E2E r18 (live ≈1→≈4 dəq data-driven).
5. **Aggregator routing YOXDU** — DoorDash/Uber Eats order-lar KDS-a birbaş gəlmir (AZ marketi üçün low risk; kurye öz web-app-da 12a).
6. **Dedikasiya hardware YOXDU** — web = şəbəkə asılı: RPC round-trip EU pooler ≈2-3s (optimistic UI örtür, offline kövrək edir — zəif #1 ilə eyni kök).
7. **86 = POS-only (12s trade-off)** — owner X-ı sildikdən sonra chef-dən "bu məhsulu hazırlaya bilmirik" escape-i POS-a köçdü (PIN + comp/waste); rəqiblərdə chef birbaşa 86 edir.
8. **Chime ear-check pending (12f) + per-stansiya səs routinqi YOXDU** — Bar order-u Kitchen terminal-da da çınlayır (rəqiblərdə səs = stansiya-sının).

### PRAKTİK TƏKLİFLƏR (priority order — owner GO ilə)

1. **Bump bar** — ✅ **12u (E2E r17/r20):** ready ticket-lər üçün tək-press "nəvi" zonası (hazır ready-first sort + CTA üzərindən kiçik səth); GÜN-də bump count = service-speed KPI. Toast-parity, minimum səth.
2. **Kitchen offline buffer (11e phase 2 — kitchen hissəsi)** — ✅ **12u (E2E r19/r20c):** tick/ready/86/serve lokal queue + replay (idempotency: state-reconciliation stale-drop; rush/course-fire qəsdən queue-ə DÜŞMİR — toggle/stateful). Toast offline-parity bağlandı; zəif #1 + #6 birgə bağlandı.
3. **Expo station (Addım 2)** — ✅ **12u (E2E r20):** "serving qapısı": bütün stansiya ready olmadan order SERVİSƏ-ya düşmür; 12i kanonik workflow-da POS serve axını ilə bağlandı (eyni `mark_order_served_atomic` edge).
4. **Per-ticket kitchen ETA** — ✅ **12u (E2E r18):** Ø HAZIRLANMA data-sı → "≈ N dəq" chip; GEÇİKME state ilə birgə = chef öncəliyi (amber overrun).
5. **WATCH mode dərinləşdirmə** — ✅ **12u (E2E r18/r20b):** "İzləmə · Qəbul 11:09 · Hazır 11:32" — `kitchen_accepted_at`/`kitchen_ready_at` stamps read-only footer-da.
6. **Kitchen 86 variantı (owner qərarı)** — ✅ **12u variant (b) (E2E r18):** modal-da AYRI "86" (X görünüşü YOX) → səbəb sheet (Tükəndi/Yanlış/Müştəri/Digər + note) → **PIN** (PinGuard) → void; state machine + permission DB-də qorunur; 5xx/net = offline queue.
7. **Per-stansiya səs routinqi (12f ear-check ilə)** — ✅ **12u (kod verified; ear-check owner NO-GO qalıb):** chime YALNIZ öz family-nın yeni ticket-i üçün (KDS-də Bar order = səssiz).
8. **Light-mode modifier kontrastı** — ✅ **12u (E2E r20b S7):** zinc-500 → zinc-600 (kart + modal; lab ≈35% L*).
9. **Workload overload badge** — ✅ **12u (threshold-based):** navbar pending count + amber ≥6 / red ≥12 (pulse); Expo = gözləyən bilet amber ≥4 / red ≥8. (Staffing comparison = Addım 2 — data `kitchen_analytics`-da var.)
10. **Board read-cache / read-replica (infra, low priority)** — ✅ **12u (E2E r20c):** board + stations stale-while-revalidate (30-min freshness, "son sinxron" note); boş-board clobber qadağası + 503 stations restore (r19/r20 bug fix).

## 1d. INVENTORY SİSTEMİ — MEYAR-MEYAR MÜQAYİSƏ + HÜKÜM (13a → 13b)

> Owner (13b): "bizim saitonu digər competitorların inventorysi ilə müqayisə et,
> görək nələr var nələr yoxdur." Rəqib fakt-ları = 2026-10-05 web-verified
> (Toast xtraCHEF səhifəsi, Lightspeed restaurant/inventory səhifəsi, Square
> capabilities — **Square restaurant inventory = MarketMan** power). SAITO =
> repo + live DB + E2E r26 verified (13a) + 13b BOM (Filadelfiya/Kaliforniya).

### Meyar-meyar

| Meyar | SAITO (13b) | Toast (xtraCHEF) | Square (MarketMan) | Lightspeed |
|---|---|---|---|---|
| **İnqrediyent tracking** | 34 ingredient × unit × avg cost × critical/min limit; view-lər (inventory_status, current_stock, v_stock_health) | ✅ real-time valuation + avtomatik qiymət yeniləməsi (invoice-dan) | ✅ real-time ingredient-level | ✅ ingredient-level + current value |
| **Recipe / BOM** | ✅ 13 məhsul (13b) + **AI suggest (LLM)** + constructor + versioning + calibration | ✅ recipe costing (digital cookbook) | ✅ menu→ingredients "instantly" | ✅ recipe cost per ingredient |
| **Auto-consumption** | ✅ **READY anında** (tik/Hazırdır → `consume_stock_for_item`; 66/66 kanıt; order anında DEYİL) + **refund** (`return_to_stock` 86/refund) = closed loop | ✅ on-sale | ✅ real-time | ✅ **on-sale** (sold = deduction) |
| **Waste tracking** | ✅ waste modal + waste_standards (keyword→%, AI cache) + hot/cold waste % | ✅ shrinkage + **theft pattern** report | ✅ | ✅ purchased/produced/**wasted**/sold report |
| **Stocktake** | ✅ counts+items, apply (zero-delta E2E), 0 icazə | ✅ **BEST: offline mobile count + staff assignment + count lists** | ✅ (MarketMan) | ✅ |
| **Supplier / PO** | ✅ suppliers + PO + receive (goods-receipt) + **supplier returns** | ✅ vendor catalog + **direct supplier orders** | ✅ Order Guide (vendor price sheets, side-by-side unit cost) | ✅ |
| **Invoice automation** | 🟡 AI parse + **anomaly detect** (sənəd upload → qeyri-müvafiq qiymət alert) — **auto-PO YOX** | ✅ **FLAGSHIP**: invoice→order avtomatlaşması | ⚠️ (MarketMan) | ⚠️ |
| **Low-stock / auto-order** | 🟡 cron */5 (4s dedupe) + notification feed + `stock/suggestions` (🟡) — **recurring/scheduled orders YOX** | ✅ par-based **order guide** + **scheduled recurring orders** | ⚠️ par levels (MarketMan) | ✅ **automated recurring orders** |
| **COGS / margin** | 🟡 margin-analysis (AI) + 30-gün variance — **formal COGS ledger (başlanğıc/bitki) YOX** | ✅ **BEST**: başlanğıc→bitki → COGS report + AvT (actual vs theoretical) | ⚠️ | ✅ food cost reports + margin + **FIFO cost policy** |
| **AI (LLM)** | ✅ **BEST**: recipe suggest + calibration + invoice anomaly + stock insights (Groq) | ❌ (predictive analytics yalnız) | ⚠️ (MarketMan "AI-powered") | ❌ |
| **Menu↔stock sync (86)** | 🟡 auto-86 cron (out-of-stock → 86) | ✅ | ✅ KDS real-time sync ("diners never order unavailable") | ⚠️ |
| **Multi-location** | ❌ | ✅ | ✅ | ✅ |
| **Offline (inventory)** | ❌ (inventory page-lər; KDS buffer var — inventory YOX) | ✅ offline counts | ⚠️ | ⚠️ |
| **Batch / expiry** | ❌ | ✅ | ✅ (MarketMan) | ⚠️ |
| **Qiymət** | **Self-hosted ₼0** | xtraCHEF = **ayrı pullu add-on** | MarketMan = **ayrı pullu add-on** | plan-də (bundled) |

### ÜSTÜN TƏRƏFLƏR (SAITO)

1. **Consumption timing = READY (real cooking), on-sale DEYİL.** Lightspeed/Toast/Square
   satış anında düşür — sonda 86/refund olan item-da da "istifadə" sayılır (sonra refund
   ilə geri). SAITO-da məhsul bişməyibsə maddə dənmir, bişib+86 olubsə `return_to_stock`
   geri qaytarır = **fiziki istifadənin özü**. DB kanıt: 66/66 item-linked consumption
   ≥ `ready_at`, `item_never_ready = 0`.
2. **LLM AI inventory loop-unda (rəqiblərdə YOXDU).** Toast/Square/Lightspeed inventory
   AI-sı = "predictive analytics/forecasting" (statistika). SAITO-da Groq: resept suggest
   (PDF cookbook-dan), resept calibration (satış vs faktiki), invoice anomaly (qiymət
   zədəsi), stock insights (30-gün variance). "AI-powered inventory" dedikdə hamısı
   regression model; bizdə LLM = sənəd/mətn anlayışı.
3. **₼0 vs 2 pullu add-on.** Toast xtraCHEF + Square MarketMan = ayrıca abonə;
   Lightspeed = plan-də amma US-first. SAITO = self-hosted, tam öz infrastrukturunda.
4. **Full audit spine (inventory_logs, 966+ sətir):** hər hərəkət (order_consumption /
   stock_in / waste / adjustment / historical_repair) + 86 reason + order/table context —
   rəqiblərdə "shrinkage report" var amma bu səviyyədə row-level audit spine az görülür.
5. **Frozen atomic state machine** — consumption tick RPC-inin içində (konkurent yazı
   = phantom double-deduction riski YOX); rollback/audit bit-tibi.
6. **Supplier returns workflow** (create→cancel→process) — Lightspeed restoran
   səhifəsində cımbızlanır (retail-də var); Toast xtraCHEF-də purchase-return var amma
   Square MarketMan-da ikinci dərəcə.

### ZƏİF TƏRƏFLƏR (SAITO — rəqibə qarşı)

1. **Invoice→PO automation YOX** (Toast flagship): sənəd upload + AI parse + anomaly
   var, amma "parse olunan sənəddən DRAFT PO yarat" = YOX. Owner hələ manual PO girir.
2. **Par-based order guide + scheduled recurring orders YOX** (Toast/Lightspeed):
   "bir sayım → par-a çatmaq üçün order guide" + "həftəlik avtomatik order" = YOX
   (`stock/suggestions` var amma PO-a çevrilmir, recurring YOX).
3. **Formal COGS ledger + AvT report YOX** (Toast): başlanğıc/bitki inventar dəyəri →
   gündəlik COGS; actual-vs-theoretical (resept vs faktiki = variance) AI var amma
   rəsmi report formatı YOX.
4. **Offline mobile stocktake + staff assignment YOX** (Toast BEST): sayım = web-only,
   "sayımı X əməkdarəyə təyin et" = YOX (kitchen-də tablet ilə sayım = kövrək).
5. **Batch/expiry tracking YOX** (Toast/MarketMan ✅) — sushi/restoran üçün FRESHNESS
   kritik (avokado, somon) — indi yox.
6. **Multi-location YOX** (3-sü ✅) — franchise/mərtəbə genişlənməsində blocker.
7. **Qiymət avtomatlaşması YOX** — `average_cost_per_unit` = manual; Toast invoice-dan
   avtomatik yeniləyir, Lightspeed FIFO.
8. **Theft/shrinkage pattern report YOX** (Toast: "track patterns of missing value") —
   discrepancy_alerts var amma pattern/weekly report YOX.

### PRAKTİK TƏKLİFLƏR (priority order — owner GO ilə)

1. **Invoice→Draft-PO (Toast flagship bağlanır):** AI parse artıq var
   (`/api/stock/ai-insights` invoice anomaly + sənəd upload) → parse olunan sətirlərdən
   **DRAFT PO** yarat (status=draft, owner təsdiqləyəndə active). 1 endpoint + UI button;
   data yolu artıq var. — *Ən böyük əməli qiymət/əmək nisbəti.*
2. **Par-based order guide (`stock/suggestions` → PO):** critical_limit (par) altındakı
   ingredient-lər → "Sifariş et" buttonu → draft PO (supplier seçimi ilə). Toast'un
   "take inventory once → order guide" bərabərliyi.
3. **COGS + AvT report (GÜN formatında):** gündəlik `inventory_logs` rollup →
   başlanğıc/bitki dəyər, tədqiqat (theoretical = recipes×sales), faktiki, variance
   (30-gün AI artıq var — rəsmiləşdir). Finance KPI-ları.
4. **Scheduled recurring orders:** PO-da "həftəlik təkrar" flag + cron (owner təsdiq
   ilə draft yaradılır — avtomatik GÖNDƏRİLMİR, təsdiq qalır).
5. **Batch/expiry:** ingredients-a `expiry_date` (və ya ayrı `stock_batches` table) +
   KDS/POS-da "buzdolabında 2 gün qalıb" alerti — sushi freshness.
6. **Offline mobile stocktake:** KDS offline buffer pattern-inin (12u) sayım-ıya
   köçürülməsi — tablet-də say, sync olanda replay.
7. **Qiymət avtomatlaşması:** PO receive anında `average_cost_per_unit`-ı weighted-
   average ilə yenilə (goods-receipt RPC-sinə 1 bloq).
8. **Multi-location** — biznes qərarı (franchise olacaqsa), yoxsa defer.

## 2. ÇATISMIYAN (missing — prioritized)

1. ~~**Online ordering / customer-facing channel**~~ — ✅ **BAĞLANDI (11d):** `api/orders/online` (takeaway/delivery, server price + CRM link + zone/fee/min/ETA) + public `/api/orders/[orderId]/track` (tracking səhifəsi) + menu no-table checkout. Bonus: KDS `table_number gt.0` bug fix — 67 mövcud no-table order KDS-də ilk dəfə görünür.
2. **Offline mode** — ✅ **PHASE 1 BAĞLANDI (11e):** offline order intake + idempotency-key dedup + auto-replay sync (banner + sinxron panel). Qalan (phase 2): offline cash drawer ledger + append dedup.
3. ~~**İş vaxtı/time-clock + payroll export**~~ — ✅ **BAĞLANDI (11a):** `get_payroll_export` RPC (punch LAG pairing + overtime + tips) + admin/staff CSV export + payroll_periods upsert + history.
4. ~~**Advanced reporting/analytics dashboard**~~ — ✅ **BAĞLANDI (11c):** 24s peak hours (SİFARİŞ/GƏLİR toggle), product food-cost/net-profit drill-down, staff performance (fix: dead `role` column) + çəkiliş dəqiqəsi + CSV.
5. ~~**Inventory purchasing (PO/receiving/supplier)**~~ — ✅ **BAĞLANDI (11b):** PO create (auto ingredient bind) + goods-receipt (delta, partial/full, WAC cost) + supplier order counter + `sync_product_availability` dead-schema fix.
6. **Hardware terminals (Square Terminal, Toast Station/stand)** — SAITO-da card terminal = SIMULATOR (adapter arxitekturası hazırdır, real PSP bağlı deyil).
7. **E-commerce sync (Lightspeed)** — B2C store sync yoxdur (SAITO restaurant-first olduğu üçün low priority).
8. **Franchise/multi-org hierarchy (Lightspeed)** — SAITO multi-location var; franchise royalty/reporting yoxdur.

## 3. YAXŞILAŞDIRILMALI (improve — near-term)

1. **Card terminal: real PSP** — adapter interfeysi hazırdır (SIMULATOR); owner qərarı ilə real PSP bağlıb. (Gəlir/köpür: Square/Toast ödəniş marjasından azalıb.)
2. **Print: network thermal printers** — hazırda print queue + reprint var; printer agent (BDS) istiqaməti Phase 0-da.
3. **Kitchen KDS screen (standalone)** — KDS page var; kiosk/standalone kitchen screen + priority queue polishing.
4. **Customer self-service (table QR menu/order)** — Masa 471 QRUP chip var (QR göstəriş) — tam QR menu/order axını yoxdur.
5. **Analytics: daily close summary** — Z report var; end-of-day summary (top items, avg check, staff) print/dashboard.
6. **Notifications** — order placed/bill requested push (staff IM) — hazırda in-app chip/toast.
7. **Device unpair UX** — E2E-lərdə 2 dəfə unpair lockout (round 6/7) → Settings → Cihazlar-da "Bərpa et" axını + self-recovery (PIN) düşünülə bilər.
8. **Next dev "Issues" pill** — dev-only; warning-ları sıfırlamaq üçün hər round-da console scan (round 7: 0 warning).

## 4. QƏLƏBƏ NÖQTƏLƏRİ (SAITO's edge)

- **Motion/design quality**: iOS-philosophy animation system (rotation morph, stroke-draw, measured sliding capsule, reduced-motion) — rəqiblərdə bu səviyyədə POS front-end nadirdir.
- **Per-instance modifier model**: line-level spec isolation (round 6/7 E2E) — çox POS-da modifier "merged" davranır.
- **Server-sərt refund/ödəniş**: atomic DB functions, net-paid semantics, idempotency keys, approval spine — accounting integrity Toast/Square səviyyəsində.
- **Baku/AZ yerelliği**: AZN, az/en/ru, lokal terminologiya, EDV.

## 5. TÖVSIYYƏ (roadmap order)

1. Real PSP card terminal (adapter hazırdır) — payment reliability. *(yeganə qalan əsas item — owner qərarı)*
2. ~~Offline mode~~ — ✅ 11e (phase 1: order intake+sync; phase 2: cash ledger)
3. ~~Online ordering (MVP)~~ — ✅ 11d
4. ~~Analytics summary~~ — ✅ 11c (peak hours + staff/product drill-down + CSV)
5. ~~Inventory purchasing (PO/receiving)~~ — ✅ 11b
6. ~~Staff time-clock + payroll~~ — ✅ 11a
