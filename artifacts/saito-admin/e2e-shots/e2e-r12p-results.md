# SAITO POS KDS "12p" E2E — "Qəbul et" LƏĞV + avtomatik qəbul (auto-accept)

Date: 2026-10-02 (Asia/Baku)
Dev server: http://localhost:3000 (live HMR, not restarted)
Login: SUPERADMIN (session active)

## ƏSAS NƏTİCƏ: PASS (bütün addımlar)

"Qəbul et" button KDS-də tam silinib. Pending order-lar KDS terminalı tərəfindən avtomatik qəbul edilir
(`/api/kitchen/accept`), `kitchen_status='accepted'` + `kitchen_accepted_at` DB-də vurulur.

> Qeyd (fixture): Baseline-da (addım 1) mövcud "E2E Wolt" order-lərin HƏR İKİSİ artıq `ready` idi — pending
> E2E Wolt order YOX idi. Testi davam etdirmək üçün pending "E2E Wolt" fixture order yaradıldı
> (id `76598434-6267-490f-80d1-596ce8429427`, 1× Dragon Roll, kitchen_status='pending', accepted NULL).

---

## Addım 1 — BASELINE psql  →  PASS (fixture ilə)

```
SELECT id, customer_name, table_number, kitchen_status, kitchen_accepted_at, created_at
FROM orders WHERE customer_name='E2E Wolt' ORDER BY created_at DESC LIMIT 2;
```
Nəticə (fixture yaradıldıqdan sonra):
```
 id                                   | customer_name | kitchen_status | kitchen_accepted_at | created_at
 76598434-6267-490f-80d1-596ce8429427 | E2E Wolt      | pending        | (NULL)              | 2026-10-02 19:57:54.953795+00   <-- fixture
 d74319c3-9a95-4de4-8353-cdde2ed3fec8 | E2E Wolt      | ready          | (NULL)              | 2026-10-01 21:43:55.154+00
```
✅ Ən yeni ticket `pending`, `kitchen_accepted_at` NULL.

---

## Addım 2 — KDS auto-accept (tab A)  →  PASS

- KDS yükləndikdən ~9 saniyə sonra fixture order OZU avtomatik qəbul edildi.
- DB (psql):
```
 id                                   | kitchen_status | kitchen_accepted_at       | created_at
 76598434-6267-490f-80d1-596ce8429427 | accepted       | 2026-10-02 19:58:03.37+00 | 2026-10-02 19:57:54.953795+00
```
✅ `kitchen_status='accepted'`, `kitchen_accepted_at` NOT NULL (created + ~8.4s).

- DOM verify (document.body.innerText):
  - `Qəbul et` count = **0** ✅ (button HEÇ YERDƏ yoxdur)
  - `GÖZLƏYİR` count = 0 ✅
  - `HAZIRLANIR` count = 1 ✅ (fixture ticket)
  - ticket context: `E2E Wolt | 0m | ÇATDIRILMA | HAZIRLANIR | Dragon Roll | MAIN | ×1 | ✓ | Hazırdır`

📷 Screenshot: `r12p-auto-accept.png` (dark, kart "HAZIRLANIR", "Qəbul" yoxdur)

---

## Addım 3 — POS-dan yeni sifariş (tab B)  →  PASS

- POS → İÇƏRIDƏ → **Masa 992** (boş masa) seçildi.
  - Qeyd: Dragon Roll "STOKDA YOXDUR" idi → in-stock kitchen item **Tom Yam (13.00)** əlavə edildi.
- "MƏTBƏXƏ GÖNDƏR" (send to kitchen) basıldı. Tab A (KDS) açıq qaldı.
- DB (psql, ən yeni order):
```
 id                                   | table_number | kitchen_status | kitchen_accepted_at       | created_at                | order_source | order_type
 f48aac33-a107-40d5-b9c8-912c91ba474c |          992 | accepted       | 2026-10-02 20:00:00.177+00 | 2026-10-02 19:59:56.015+00 | dine_in      | dine_in
```
✅ `accepted` + `kitchen_accepted_at` ≈ `created_at` (+~4.2s).

- KDS DOM verify (10–15s poll içində):
  - ticket context: `Masa 992 | 0m | İÇƏRIDƏ | ORD-2953 | HAZIRLANIR | Tom Yam | MAIN | ×1 | ✓ | Hazırdır`
  - `Qəbul et` count = **0** ✅, status = **HAZIRLANIR** ✅

📷 Screenshot: `r12p-new-order.png` (Masa 992 / ORD-2953 "HAZIRLANIR")

---

## Addım 4 — Modal footer  →  PASS

- Ticket kartı (Masa 992) klikləndi → modal açıldı.
- Modal footer-də yalnız **"Hazırdır"** button var (ref e23). **"Qəbul et" YOXDUR** (pending branch silinib).
- Modal başlığı: `Masa 992 · ORD-2953 · Tom Yam`; düymələr: "Bileti yenidən çap et", "Bağla", "Hazırdır".
- ESC basıldı → modal bağlandı (`[role=dialog]` count = 0, `STANSIYALAR` text getdi).
✅ Footer-də "Qəbul et" yoxdur.

---

## Addım 5 — Light mode  →  PASS

- Theme toggle (`Mövzu dəyiş`) → light mode: `data-theme="light"`, `class="... light"`, body bg `rgb(247,247,248)`.
- KDS board: `Qəbul et` count = **0** ✅; etiketlər oxunaqlı ("HAZIRLANIR", "SERVİSƏ HAZIRDIR"). `HAZIRLANIR` count = 2.
- Dark-a geri qaytarıldı (`data-theme="dark"` təsdiqlendi) ✅.

📷 Screenshot: `r12p-light.png` (light board, "Qəbul et" yoxdur)

---

## Addım 6 — Console error / warning cəmi  →  PASS

| Tab | JS exceptions | console errors | console warnings |
|-----|---------------|----------------|------------------|
| A — /admin/kds | 0 | 0 | 0 |
| B — /admin/pos | 0 | 0 | 0 |

✅ Gözlənilən 0 — təmiz.
(Next.js dev tools banner üçün lokal `HEAD .../rest/v1/orders` `net::ERR_ABORTED` abort-ları dev-server health-probe-dur, JS xətası DEYİL, console-a düşmür.)

---

## Qadağalara riayət

- "Hazırdır" / tick / serve **basılmadı** ✅
- Yalnız addım 3-də POS sifariş göndərmə icazəsi istifadə edildi ✅
- Dev server restart edilmədi ✅
- Heç bir POST /api/kitchen/accept manual çağırılmadı — auto-accept KDS-ə yüklənməklə təbii baş verdi ✅
