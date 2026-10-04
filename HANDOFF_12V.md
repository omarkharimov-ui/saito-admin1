# HANDOFF — ROUND 12v (2026-10-04)

Owner qayıtdı (futbol) və 12u-da qeyd olunan açıq məsələlər üzrə qərarlar verdi + 2 yeni
tələb. Hamısı implement + E2E verified (r21 / r21b / r21c, console 0, dark+light).

## Owner qərarları → nə edildi

| # | Qərar (owner) | Realizasiya |
|---|---|---|
| 1 | Expo: "servis POS-dan verilir — buttonu və texti sil, heç vaxt elə bir şey yazılmasin" | Expo = **tam VIEW-ONLY pass**: `handleServe` KDSView-dən silindi (12u), SERVİSƏ VER buttonu (kart/bump/modal) + i18n açarları (`kds_expo_serve`, `kds_expo_not_ready`) + offline-queue `serve` kind — hamısı çıxarıldı. Expo modal footer = sükut workflow timestamps (Qəbul/Hazır HH:MM) + RUSH marker, button YOX. Expo bump rail YOX. `/api/orders/serve` qalır — **POS-un "SERVISƏ VER" action-ı onu çağırır** (12i, dəyişməz). Gate qalır: bütün stansiya ready olmadan ticket Expo-ya düşmür (all-ready invariant, FIFO `kitchen_ready_at`). |
| 2 | "hazırlanır + hazırdır bir yerdə mane olurdu — ayrı tab/zona yarat" | Hər station tab-da board **iki zonaya bölündü**: **HAZIRLANIR** (əsas grid, sol) + **HAZIRDİR** (sağ zona, emerald label + count, w-72, lg+). Ticket stansiya-sının payı bitəndə kart HAZIRLANIR-dan HAZIRDİR zonaya **yerində keçid edir** (layout + AnimatePresence; E2E r21 S6 verified). Watch tab-larda da görünür (view-only). Expo-da bölünmə YOX (Expo'nun bütün board-u artıq "hazır" zonasıdır). i18n: `kds_zone_preparing`/`kds_zone_ready`/`kds_zone_ready_empty` (az/en/ru; az dəyərləri pre-uppercased — CSS uppercase "ı"→"I" çevirirdi, r21 typo düzəldildi: HAZIRLANIR). |
| 3 | customer_note: "böl" | Order-level `customer_note` station **kartlarından silindi** (Bar qeydi Kitchen kartında nəsəç getmirdi) — yalnız ticket **modal**-da (order detail) + POS + çap qalır. **Kök (r21 S2 tapdı):** modal-da note MÜŞTƏRİ section-un İÇİNƏ qəflənmişdi (`order_source !== 'dine_in'` gate) → dine-in order-larda (name/phone=null) heç vaxt render olunmurd → **SİLİNMİŞDİ**. Fix: note bloku section-dan çıxarıldı, bütün order tiplərində modal-da görünür (r21b T1 verified: "Qeyd: green tee soyuq olsn" amber, dine-in). Qeyd məhsul-səviyyəli `special_notes`-dən fərqlidir — məhsul qeydləri kartda qalır (doğru). |
| 4 | cash shift: "bağla" | **Artıq bağlanıbmış** — DB verify (12v-də): `shifts`-də açıq shift YOX idi (auto-clockout cron r20c-də öz-özünə bağladı, r20c report-da görünmüşdü). Heç bir əməliyyat tələb etmedi. |
| 5 | POS duplicate-key burst: "sen necə istəsən elə et" | Qərarım: **izləmədə qalır** (repro olmadı, code change yox). E2E müddətində 1 dəfə daha transient 500-lər görünüb (`/api/print/queue`, "Gel-al sifarişləri yüklənə bilmədi" banner — self-healed next poll). Pattern: pooler hiccup, self-recovery. Tracking: hər 500 dev-log-da görünür; 2+ dəfə eyni endpoint-də təkrar olarsa kökə gedirik. |
| (12u-1) | səs: "təbii ki seç, yoxla" | Mövcud 12f premium bell = "təbii" seçim (owner təsdiqi). **Routing verified (r21c A1):** bar-only order KDS (Kitchen terminal)-də "Yeni sifariş!" toast/səs vermədi (own-family gate), BDS tərəfdə çınlayar — toast gate = səs gate (eyni `ownStationIds` şərti). |

## Expo view-only — nə qaldı, nə getdi

**Qaldı:** Expo tab (Kitchen · Bar · **Expo** · GÜN), all-ready gate, FIFO `kitchen_ready_at`,
emerald "BÜTÜN STANSİYA HAZIRDİR" status line, tam order item list (dim), timer, RUSH marker,
overload badge (amber ≥4 / red ≥8), "son sinxron" offline dəstəyi, print (reprint) button.
**Getdi:** bütün servis button-ları + servis text (kart, bump tile, modal footer), `handleServe`,
offline-queue `serve` kind, `kds_expo_serve`/`kds_expo_not_ready` i18n.
**Operasiya axını (indiki kanonik):** stansiya-lar hazırlayır → ticket Expo-ya düşür (pass gözləyir)
→ **POS "SERVİSƏ VER" basılır** (floor) → order `served` → bütün board-lardan çıxır.

## E2E (r21 / r21b / r21c — owner Chrome, fresh tabs, console 0)

- **r21:** S1 zones + note-kartsız PASS · S2 modal-note **FAIL** (kök: dine-in gate) → fix ·
  S3 watch PASS · S4 expo gate empty PASS · S5-6 test order (Masa 3) zone-keçid PASS (HAZIRLANIR→HAZIRDİR) ·
  S7 expo view-only PASS (button/rail YOX, modal sükut footer) · S8 POS "SERVISƏ VER" → chip "SERVİS EDİLDİ" PASS.
- **r21b:** T1 modal-note fix PASS (amber "Qeyd: green tee soyuq olsn") · zone İ/ı düzgün ·
  T4 Masa 3 cleanup PASS (`/api/kitchen/cancel` + `/api/orders/dismiss` → BOŞ; POS-UI cancel served
  order-da işləmədi — API kanonik yolu istifadə olundu) · T2 o an empty table olmadığından blocked.
- **r21c:** A1 bar-only order → KDS-də toast YOX, Bar tab-da ticket (routing verified) ·
  A2 light theme (zones + cards oxunaq; luma 247.8) · A3 cleanup PASS (ORD-2964 cancel+dismiss → BOŞ) ·
  A4 final: 1 aktiv sifariş (Masa 2 untouched), Expo 0, console 0 fresh tab.

**Cleanup status:** bütün test order-ları (ORD-2963, ORD-2964) ləğv + dismiss; Masa 3 BOŞ;
Masa 2 (owner) toxunulmayıb. `Masa 4/5` = merged group (r21b-da diqqətli qorunub).

**Anomaliyalar (monitoring):** transient 500-lər (`/api/pos/tables`, `/api/print/queue`,
"Gel-al" load banner) — self-healed; pooler hiccup pattern. Screenshot compositor bir neçə
dəfə stale frame verdi (luminance ilə verify edildi).

## FAYLLAR

- `KDSView.tsx` — expo view-only (handleServe/servis UI silindi, sükut footer), zone split
  (`zoneReady`/`zonePrep`, HAZIRDİR aside), customer_note kartdan çıxar + modal-dan hoist, expo bump rail off
- `src/hooks/useKdsOfflineQueue.ts` — `serve` kind silindi
- `lib/i18n/locales/{az,en,ru}.ts` — `kds_zone_*` əlavə, `kds_expo_serve`/`kds_expo_not_ready` silindi, az İ düzəldildi
- DB: dəyişiklik YOX (Expo station 12u-da artıq var)
- `e2e-shots/r21-*, r21b-*, r21c-*`
