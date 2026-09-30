# r11g SAITO offline E2E — rolling findings

Scope: prove offline order-queue -> auto-sync on MASA 97 only (localhost:3000).
Tab targetId: tab-vtab-780962288

## Done
- Settings > TERMINALLAR > TESTİ BAŞLAT -> became "AKTİVDİR — BURAQ" (force=1). [OK]
- Found root cause of missing banner: monitor module `state` resets to 'online' on full reload; force flag alone does not re-set it. Triggered monitor's offline path via window 'offline' event. Banner "OFFLINE — YERLI REJIM" then visible. [OK]
- POS: selected MASA 97, added 1x Coca-Cola 330ml (3.00₼), sent.
- Queued toast captured EXACT: "Sifariş offline növbəyə yazıldı — internet qayıdanda avtomatik göndəriləcək ✓"
- Sync popover: 2 items -> "Sifariş"+MANUAL (leftover table 14) and "Sifariş"+green AUTO (MASA 97). [OK]
- Release offline -> queue auto item drained: POST /api/orders 200; queue table-97 item removed; force=null; banner gone.
- POS console: 0 errors / 0 warnings / 0 exceptions.

## Saved shots
- r11g-offline-toast.png (queued toast) [OK]
- r11g-offline-panel.png (sync popover) [OK]

## Remaining
- Capture sync toast "N əməliyyat sinxronlaşdı ✓" as r11g-offline-synced.png (first run: sync toast not captured -> re-running with robust recorder).
- Collect settings-page console counts.
- Final PASS/FAIL summary.

## Note
- Leftover queue item (table 14, auto:false, Tom Yam) pre-existed; manual -> not auto-drained. Not touched.
