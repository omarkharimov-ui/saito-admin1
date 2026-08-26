import { supabase } from '@/lib/supabase';
import { printerService } from './PrinterService';
import { buildReservationEscPos } from './EscPosBuilder';

export interface ReceiptData {
  restaurantName: string;
  address?: string;
  receiptTitle: string;
  currency: string;
  serviceFeePct: number;
  showServiceFee: boolean;
  footerText?: string;
  tableNumber?: number;
  orderId?: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  discount?: number;
  discountName?: string;
  tip?: number;
  total: number;
  paymentMethod: string;
  cashAmount?: number;
  cardAmount?: number;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryFee?: number;
  estimatedTime?: string;
  date: string;
  time: string;
  paperWidth: string;
  copies: number;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export async function getReceiptSettings(): Promise<{
  restaurantName: string;
  address: string;
  receiptTitle: string;
  receiptCurrency: string;
  serviceFeePct: number;
  showServiceFee: boolean;
  footerText: string;
  staffName: string;
  paymentMethod: string;
  paperWidth: string;
  copies: number;
  autoPrintReceipt: boolean;
  autoPrintKitchen: boolean;
}> {
  const { data } = await supabase
    .from('settings')
    .select('restaurant_name, address, receipt_title, receipt_currency, receipt_service_fee_pct, receipt_show_service_fee, receipt_footer_text, receipt_staff_name, receipt_payment_method, printer_paper_width, print_copies, auto_print_receipt, auto_print_kitchen')
    .single();

  return {
    restaurantName: data?.restaurant_name || 'Restoran',
    address: data?.address || '',
    receiptTitle: data?.receipt_title || 'SİFARİŞ ÇEKİ',
    receiptCurrency: data?.receipt_currency || '₼',
    serviceFeePct: Number(data?.receipt_service_fee_pct) || 10,
    showServiceFee: data?.receipt_show_service_fee ?? true,
    footerText: data?.receipt_footer_text || '',
    staffName: data?.receipt_staff_name || '',
    paymentMethod: data?.receipt_payment_method || '',
    paperWidth: data?.printer_paper_width || '80mm',
    copies: Number(data?.print_copies) || 1,
    autoPrintReceipt: data?.auto_print_receipt ?? true,
    autoPrintKitchen: data?.auto_print_kitchen ?? false,
  };
}

export function buildReceiptHtml(data: ReceiptData): string {
  const paperWidth = data.paperWidth === '58mm' ? 220 : 302;
  const itemsHtml = data.items
    .map(
      (item) => `<div style="display:flex;font-size:11px;margin-bottom:3px;align-items:flex-start">
        <span style="flex:1;padding-right:4px;line-height:1.4">${item.name}</span>
        <span style="width:44px;text-align:center">${item.quantity}</span>
        <span style="width:56px;text-align:right;font-weight:600">${item.price.toFixed(2)}</span>
      </div>`
    )
    .join('');

  const discountHtml = (data.discount ?? 0) > 0
    ? `<div style="display:flex;font-size:11px;margin-bottom:4px;color:#BE123C">
        <span style="flex:1">${data.discountName || 'Endirim'}</span>
        <span style="width:56px;text-align:right">-${(data.discount || 0).toFixed(2)}</span>
      </div>`
    : '';

  const serviceFeeHtml = data.showServiceFee
    ? `<div style="display:flex;font-size:11px;margin-bottom:4px">
        <span style="flex:1">Servis haqqı (${data.serviceFeePct}%)</span>
        <span style="width:56px;text-align:right">${(data.subtotal * (data.serviceFeePct / 100)).toFixed(2)}</span>
      </div>`
    : '';

  const tipHtml = (data.tip ?? 0) > 0
    ? `<div style="display:flex;font-size:11px;margin-bottom:4px">
        <span style="flex:1">Çaypulu</span>
        <span style="width:56px;text-align:right">${(data.tip || 0).toFixed(2)}</span>
      </div>`
    : '';

  const paymentHtml = data.paymentMethod === 'split'
    ? `<div style="display:flex;font-size:11px;margin-bottom:4px">
        <span style="flex:1">Nağd</span>
        <span style="width:56px;text-align:right">${(data.cashAmount || 0).toFixed(2)}</span>
      </div>
      <div style="display:flex;font-size:11px;margin-bottom:4px">
        <span style="flex:1">Kart</span>
        <span style="width:56px;text-align:right">${(data.cardAmount || 0).toFixed(2)}</span>
      </div>`
    : `<div style="display:flex;font-size:11px;margin-bottom:4px">
        <span style="flex:1">Ödəniş</span>
        <span style="width:56px;text-align:right">${data.paymentMethod === 'cash' ? 'Nağd' : 'Kart'}</span>
      </div>`;

  const footerHtml = data.footerText
    ? `<div style="text-align:center;font-size:10px;color:#555;line-height:1.5;margin-top:8px">${data.footerText}</div>`
    : '';

  return `<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>${data.receiptTitle} #${data.tableNumber ?? '-'}</title>
    <style>
      @page { size: ${paperWidth}px auto; margin: 0; }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Courier New',Courier,monospace; background:#fff; color:#000; font-size:12px; }
    </style>
  </head><body>
    <div style="width:${paperWidth}px;margin:0 auto;padding:20px 14px;line-height:1.5">
      <div style="text-align:center;font-weight:700;font-size:14px;margin-bottom:2px">${data.restaurantName}</div>
      ${data.address ? `<div style="text-align:center;font-size:10px;margin-bottom:2px;color:#555">${data.address}</div>` : ''}
      <div class="line" style="border:none;border-top:1px dashed #000;margin:6px 0"></div>
      <div style="font-size:11px;margin-bottom:2px">Masa: <strong>${data.tableNumber ?? '-'}</strong></div>
      <div style="font-size:11px;margin-bottom:2px">Sifariş: ${data.orderId ? '#' + data.orderId.slice(0, 8) : '-'}</div>
      <div style="font-size:11px;margin-bottom:6px">${formatDate(data.date)}&nbsp;&nbsp;&nbsp;${formatTime(data.time)}</div>
      <div class="line" style="border:none;border-top:1px dashed #000;margin:6px 0"></div>
      <div style="display:flex;font-size:11px;font-weight:700;margin-bottom:4px">
        <span style="flex:1">Məhsul</span>
        <span style="width:44px;text-align:center">Miqdar</span>
        <span style="width:56px;text-align:right">Qiymət</span>
      </div>
      <div class="line" style="border:none;border-top:1px dashed #000;margin:4px 0 6px"></div>
      ${itemsHtml}
      <div class="line" style="border:none;border-top:1px dashed #000;margin:8px 0"></div>
      ${discountHtml}
      ${serviceFeeHtml}
      ${tipHtml}
      ${paymentHtml}
      <div style="display:flex;justify-content:space-between;font-size:20px;margin-top:4px">
        <b>YEKUN:</b>
        <b>${data.total.toFixed(2)}&nbsp;${data.currency}</b>
      </div>
      ${footerHtml}
    </div>
  </body></html>`;
}

export async function printReceipt(data: ReceiptData): Promise<boolean> {
  let iframe: HTMLIFrameElement | null = null;
  try {
    const settings = await getReceiptSettings();

    const receiptData: ReceiptData = {
      ...data,
      receiptTitle: settings.receiptTitle,
      currency: settings.receiptCurrency,
      serviceFeePct: settings.serviceFeePct,
      showServiceFee: settings.showServiceFee,
      footerText: settings.footerText,
      paperWidth: settings.paperWidth,
      copies: settings.copies,
    };

    const html = buildReceiptHtml(receiptData);

    // Hidden iframe instead of window.open: browsers block pop-ups opened
    // after an await, but iframe printing is never popup-blocked.
    iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) throw new Error('Print iframe not ready');
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow.focus();
    await new Promise((resolve) => setTimeout(resolve, 350));

    for (let c = 0; c < receiptData.copies; c++) {
      iframe.contentWindow.print();
      if (c < receiptData.copies - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return true;
  } catch (e) {
    console.error('Print failed:', e);
    return false;
  } finally {
    const el = iframe;
    if (el) {
      setTimeout(() => el.remove(), 5000);
    }
  }
}

export async function printReservation(data: {
  restaurantName: string;
  address?: string;
  receiptTitle: string;
  receiptCurrency: string;
  serviceFeePct: number;
  showServiceFee: boolean;
  footerText?: string;
  tableNumber?: number;
  reservationId?: string;
  guestName: string;
  phone: string;
  guests: number;
  time: string;
  notes?: string;
  isVip?: boolean;
  paperWidth: string;
  copies: number;
}): Promise<boolean> {
  const settings = await getReceiptSettings();
  const paperWidth = data.paperWidth === '58mm' ? '58mm' : '80mm';
  const printerType = printerService.getConfig().type;
  const useNative = !printerService.isBrowserMode() && (printerType === 'escpos_usb' || printerType === 'escpos_network' || printerType === 'escpos_serial' || printerType === 'windows');

  const reservationData = {
    restaurantName: data.restaurantName || settings.restaurantName,
    receiptTitle: data.receiptTitle || settings.receiptTitle,
    tableNumber: data.tableNumber,
    reservationId: data.reservationId,
    guestName: data.guestName,
    phone: data.phone,
    guests: data.guests,
    time: data.time,
    isVip: data.isVip,
    notes: data.notes,
  };

  if (useNative) {
    const escpos = buildReservationEscPos(reservationData);
    return printerService.print({
      escpos,
      paperWidth,
      copies: data.copies,
      title: data.receiptTitle,
    });
  }

  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>${data.receiptTitle}</title>
    <style>
      @page { size: ${paperWidth === '58mm' ? 220 : 302}px auto; margin: 0; }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Courier New',Courier,monospace; background:#fff; color:#000; font-size:12px; }
    </style>
  </head><body>
    <div style="width:${paperWidth === '58mm' ? 220 : 302}px;margin:0 auto;padding:20px 14px;line-height:1.5">
      <div style="text-align:center;font-weight:700;font-size:14px;margin-bottom:2px">${data.restaurantName || settings.restaurantName}</div>
      ${data.address ? `<div style="text-align:center;font-size:10px;margin-bottom:2px;color:#555">${data.address}</div>` : ''}
      <div style="border:none;border-top:1px dashed #000;margin:6px 0"></div>
      <div style="text-align:center;font-weight:700;font-size:13px;margin-bottom:6px">REZERVASİYA BİLETİ</div>
      <div style="border:none;border-top:1px dashed #000;margin:6px 0"></div>
      <div style="font-size:11px;margin-bottom:2px">Masa: <strong>${data.tableNumber ?? '-'}</strong></div>
      ${data.reservationId ? `<div style="font-size:11px;margin-bottom:2px">Rezerv: #${data.reservationId.slice(0, 8)}</div>` : ''}
      <div style="font-size:11px;margin-bottom:2px">Qonaq: <strong>${data.guestName}</strong></div>
      <div style="font-size:11px;margin-bottom:2px">Telefon: ${data.phone}</div>
      <div style="font-size:11px;margin-bottom:2px">Nəfər: ${data.guests}</div>
      <div style="font-size:11px;margin-bottom:2px">Saat: ${data.time}</div>
      ${data.isVip ? `<div style="font-size:11px;margin-bottom:2px;color:#B45309">VIP</div>` : ''}
      ${data.notes ? `<div style="font-size:11px;margin-bottom:2px">Qeyd: ${data.notes}</div>` : ''}
      <div style="border:none;border-top:1px dashed #000;margin:6px 0"></div>
      <div style="text-align:center;font-size:10px;color:#555;margin-top:8px">Tezliklə gözləyirik!</div>
    </div>
  </body></html>`;

  return printerService.print({
    html,
    paperWidth,
    copies: data.copies,
    title: data.receiptTitle,
  });
}
