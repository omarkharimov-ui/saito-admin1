# HANDOFF — ROUND 12w (2026-10-04)

Owner (12v-dən sonra): (1) qeydlər yalnız modalda qalmamalı — **kartda da görünsün, amma
stansiya-ya bölünsün**: POS-da iki qeyd növü var ("Sifariş qeydi" = order-level `customer_note`,
"Məhsul qeydi" = item-level `special_notes`); order qeydi "birbasa" hər iki stansiya-ya düşürdü →
**sistem anlasın hansı qeyd hansı stansiya-ya getməlidir**; (2) HAZIRLANIR/HAZIRDİR **zona yox,
TAB** şəklində olsun.

## 1. SMART NOTE ROUTING (order qeydi → stansiya)

**Mexanika** (`KDSView.routeNoteSegments`, saf client funksiya — DB/API dəyişiklik YOX):
- Order `customer_note` **vergül** ilə segmentlərə bölünür (`[,;•]`).
- Hər segment order-un **aktiv məhsullarının ad token-ləri + modifikator adları** ilə
  token-matching-ə düşür: normalize (lowercase `tr` + accent-strip) → token eşitliyi,
  **hamming ≤ 1** ("tee"≈"tea"), prefix (len ≥4: "filadelfiya…").
- Match olan məhsulların stansiya-sı = segment-in qəbulçusu.
- **Heç nəyə match olmadı** (və ya order-dakı BÜTÜN stansiya-ların məhsulu match oldu) →
  segment **ÜMUMİ** = bütün station kartlarında görünür (cədvəl/order haqqında qeyd —
  dürüst fallback; cross-linqvi match "çay"≈"tea" gözlənmir).
- **Kart** (`renderTicket`): yalnız həmin stansiya-yın segmentləri (+ ümumi) — "Qeyd: …"
  amber sətiri. 12v-dən fərqli: qeyd kartda **geri qaytarıldı** (owner: "modal girmədən
  görünsün") — amma SCOPED.
- **Expo kart** (`renderExpoTicket`): **tam** order qeydi (pass-da stansiya ikiliyi yoxdur —
  bütün plate birlikdə çıxır).
- **Modal**: tam order qeydi (12v dine-in fix qorunur — MÜŞTƏRİ section-dan hoist edilmişdi).
- **Məhsul qeydi** (`special_notes`) dəyişməz — artıq item-səviyyəlidir (hər kartda öz
  məhsulunun qeydi).
- `kitchen_notes` DB kolonu = type-only (UI yazmır) — toxunulmadı.

**E2E r22 (verified):** test qeydi `green tea extra buz, filadelfiya kremli, təşəkkür`:
- Kitchen kart = **"Qeyd: filadelfiya kremli · təşəkkür"** ("green tea extra buz" YOX)
- Bar kart = **"Qeyd: green tea extra buz · təşəkkür"** ("filadelfiya kremli" YOX)
- Expo kart = **tam üç segment**
- Real data: "green tee soyuq olsn" → `green` exact + `tee`≈`tea` (hamming 1) → **yalnız Bar**;
  Kitchen kartda YOX (Masa 2 verified).

## 2. HAZIRLANIR / HAZIRDİR = SUB-TAB (zona yox)

- 12v-in yan-yan zona-lar **silindi** (HAZIRDİR aside). İndi: aktiv station board-un üstündə
  iki **pill sub-tab**: `HAZİRLANİR · N` / `HAZIRDİR · N` (count ilə; default = HAZIRLANİR;
  station dəyişəndə sıfırlanır; Expo-da YOX — bütün Expo board-u "hazır" zonasıdır).
- Ticket stansiya-sının payı bitəndə HAZIRLANIR → HAZIRDİR sub-tab-ına keçir (count update,
  kart AnimatePresence-ə düşür/çıxır; r22 N5 verified: 1→0 / 1→2).
- Sub-tab empty state-lər: HAZIRDİR boş = "Hazır bilet yoxdur"; HAZIRLANIR boş (hamısı
  hazırdır) = "Bütün ticket HAZIRDİR tab-da" (`kds_all_in_ready`, az/en/ru).
- Bump rail (xl+) qorunur (quick-press səthi — sub-tab ilə tamamlayıcı).

## E2E (r22 + r22b — console 0 fresh tab, dark+light)

- **r22:** N1 sub-tabs + Kitchen-kart-notsız PASS · N2 Bar kart + modal tam qeyd PASS ·
  N3-4 3-segmentli test qeydi per-station scoping PASS (verbatim yuxarıda) · N5 zone-keçid
  (sub-tab) PASS · N6 Expo tam qeyd + view-only PASS.
- **r22b:** C1 ORD-2965 canonical cancel (performed_by owner) · C2 dismiss → **Masa 3 BOŞ**
  (Masa 3 = **VIP floor** — floor 1 yoxdur; floor-lər: "1-CI MƏRTƏBƏ", "VIP") · C3 light theme
  (pills + amber qeyd oxunaq) · C4 final: Masa 2 untouched (partially_ready; Kitchen HAZIRDİR,
  Bar HAZIRLANIR + qeyd), Expo 0, console **0** (supabaseKey YOX).
- **Anomaliya (info):** POS "SERVİSƏ VER" order panel-də YOX — masa card-ının context menyu-sündə
  ("ƏSAS ƏMƏLIYYATLAR" altında, HESABI BAĞLA / MASANI BOŞALT ilə birgə).

## FAYLLAR

- `KDSView.tsx` — `routeNoteSegments`/`scopedNoteFor` (routing engine), kart scoped qeyd,
  Expo tam qeyd, sub-tabs (`readyTab` state + pills + empty state-lər), zone aside silindi
- `lib/i18n/locales/{az,en,ru}.ts` — `kds_all_in_ready` (zone açarları tab label-ı kimi qorunur)
- DB: dəyişiklik YOX (routing = client; qeyd sahələri artıq var)
- `e2e-shots/r22-*, r22b-*`
