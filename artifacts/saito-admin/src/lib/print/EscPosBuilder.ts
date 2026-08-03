const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function encode(text: string, encoding: 'utf8' | 'cp1254' | 'cp1251' | 'cp1252' = 'utf8'): Uint8Array {
  if (encoding === 'utf8') {
    return new TextEncoder().encode(text);
  }
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else if (code >= 0x400 && code <= 0x45f && encoding === 'cp1251') {
      bytes.push(code - 0x350);
    } else if (code >= 0x0e0 && code <= 0x0ff && encoding === 'cp1254') {
      bytes.push(code - 0x0e0 + 0x80);
    } else {
      bytes.push(code);
    }
  }
  return new Uint8Array(bytes);
}

function pushBytes(buffer: number[], bytes: Uint8Array | any): void {
  for (let i = 0; i < bytes.length; i++) {
    buffer.push(bytes[i]);
  }
}

export function buildEscPos(template: any, encoding: 'utf8' | 'cp1254' | 'cp1251' | 'cp1252' = 'utf8'): Uint8Array {
  const buffer: number[] = [];

  buffer.push(ESC, 0x40);

  for (const section of template.sections || []) {
    switch (section.type) {
      case 'text': {
        const bytes = encode(section.content || '', encoding);
        pushBytes(buffer, bytes);
        if (section.quantity && section.quantity > 1) {
          for (let i = 1; i < section.quantity; i++) {
            buffer.push(LF);
            pushBytes(buffer, bytes);
          }
        }
        buffer.push(LF);
        break;
      }
      case 'line': {
        const width = section.width || 32;
        const char = section.content === 'dashed' ? '-' : '=';
        pushBytes(buffer, encode(char.repeat(width), encoding));
        buffer.push(LF);
        break;
      }
      case 'qr': {
        const data = section.content || '';
        buffer.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x31);
        buffer.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x33);
        const encoded = encode(data, encoding);
        const len = encoded.length + 3;
        buffer.push(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30);
        pushBytes(buffer, encoded);
        buffer.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
        buffer.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x31);
        buffer.push(LF);
        break;
      }
      case 'barcode': {
        const value = section.content || '';
        const bytes = encode(value, encoding);
        buffer.push(GS, 0x68, 0x00);
        buffer.push(GS, 0x66, 0x00);
        buffer.push(GS, 0x6b, bytes.length);
        pushBytes(buffer, bytes);
        buffer.push(LF);
        break;
      }
      case 'feed': {
        const qty = section.quantity || 1;
        for (let i = 0; i < qty; i++) buffer.push(LF);
        break;
      }
      case 'cut': {
        buffer.push(GS, 0x56, 0x00);
        break;
      }
      case 'open-drawer': {
        buffer.push(ESC, 0x70, 0x00, 0x19, 0xfa);
        break;
      }
      case 'beep': {
        buffer.push(ESC, 0x42, 0x03, 0x04);
        break;
      }
      case 'image': {
        buffer.push(GS, 0x76, 0x30, 0x00, 0x00);
        break;
      }
    }
  }

  return new Uint8Array(buffer);
}

export function buildReceiptEscPos(data: any, encoding: 'utf8' | 'cp1254' | 'cp1251' | 'cp1252' = 'utf8'): Uint8Array {
  const sections: any[] = [];

  sections.push({ type: 'text', content: data.restaurantName || '', align: 'center', bold: true, doubleWidth: true });
  if (data.address) {
    sections.push({ type: 'text', content: data.address, align: 'center', bold: false });
  }
  sections.push({ type: 'line', content: 'dashed', width: 32 });

  sections.push({ type: 'text', content: `Masa: ${data.tableNumber ?? '-'}`, align: 'left' });
  if (data.orderId) {
    sections.push({ type: 'text', content: `Sifariş: #${data.orderId.slice(0, 8)}`, align: 'left' });
  }
  const date = data.date || new Date().toISOString().split('T')[0];
  const time = data.time || new Date().toISOString().split('T')[1].slice(0, 5);
  sections.push({ type: 'text', content: `${date}  ${time}`, align: 'left' });
  sections.push({ type: 'line', content: 'dashed', width: 32 });

  sections.push({ type: 'text', content: 'Məhsul', bold: true });
  sections.push({ type: 'line', content: 'dashed', width: 32 });

  for (const item of data.items || []) {
    const line = `${item.name} x${item.quantity}`;
    sections.push({ type: 'text', content: line, align: 'left' });
    sections.push({ type: 'text', content: `${item.price.toFixed(2)} ${data.currency || ''}`, align: 'right' });
  }

  sections.push({ type: 'line', content: 'dashed', width: 32 });

  if ((data.discount || 0) > 0) {
    sections.push({ type: 'text', content: `Endirim: -${data.discount.toFixed(2)}`, align: 'left' });
  }
  if (data.showServiceFee !== false) {
    const serviceFee = data.subtotal * ((data.serviceFeePct || 0) / 100);
    sections.push({ type: 'text', content: `Servis: ${serviceFee.toFixed(2)}`, align: 'left' });
  }
  if ((data.tip || 0) > 0) {
    sections.push({ type: 'text', content: `Çaypulu: ${data.tip.toFixed(2)}`, align: 'left' });
  }

  sections.push({ type: 'line', content: 'dashed', width: 32 });
  sections.push({ type: 'text', content: `YEKUN: ${data.total.toFixed(2)} ${data.currency || ''}`, align: 'center', bold: true, doubleWidth: true });
  sections.push({ type: 'line', content: 'dashed', width: 32 });

  if (data.footerText) {
    sections.push({ type: 'text', content: data.footerText, align: 'center' });
  }

  sections.push({ type: 'feed', quantity: 2 });
  sections.push({ type: 'cut' });

  return buildEscPos({ sections }, encoding);
}

export function buildReservationEscPos(data: any, encoding: 'utf8' | 'cp1254' | 'cp1251' | 'cp1252' = 'utf8'): Uint8Array {
  const sections: any[] = [];

  sections.push({ type: 'text', content: data.restaurantName || '', align: 'center', bold: true, doubleWidth: true });
  sections.push({ type: 'line', content: 'dashed', width: 32 });
  sections.push({ type: 'text', content: 'REZERVASİYA BİLETİ', align: 'center', bold: true });
  sections.push({ type: 'line', content: 'dashed', width: 32 });

  sections.push({ type: 'text', content: `Masa: ${data.tableNumber ?? '-'}`, align: 'left' });
  if (data.reservationId) {
    sections.push({ type: 'text', content: `Rezerv: #${data.reservationId.slice(0, 8)}`, align: 'left' });
  }
  sections.push({ type: 'text', content: `Qonaq: ${data.guestName}`, align: 'left' });
  sections.push({ type: 'text', content: `Telefon: ${data.phone}`, align: 'left' });
  sections.push({ type: 'text', content: `Nəfər: ${data.guests}`, align: 'left' });
  sections.push({ type: 'text', content: `Saat: ${data.time}`, align: 'left' });
  if (data.isVip) {
    sections.push({ type: 'text', content: 'VIP', align: 'left', bold: true });
  }
  if (data.notes) {
    sections.push({ type: 'text', content: `Qeyd: ${data.notes}`, align: 'left' });
  }
  sections.push({ type: 'line', content: 'dashed', width: 32 });
  sections.push({ type: 'text', content: 'Tezliklə gözləyirik!', align: 'center' });

  sections.push({ type: 'feed', quantity: 2 });
  sections.push({ type: 'cut' });

  return buildEscPos({ sections }, encoding);
}
