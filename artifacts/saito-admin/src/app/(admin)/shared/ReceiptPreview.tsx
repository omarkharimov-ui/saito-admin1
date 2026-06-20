'use client';

import React from 'react';

interface ReceiptItem {
  product_name: string;
  quantity: number;
  total_price: number;
}

interface ReceiptPreviewProps {
  title: string;
  tableNumber?: number | string;
  date?: string;
  time?: string;
  items: ReceiptItem[];
  showServiceFee: boolean;
  serviceFeePct: number;
  currency: string;
  footerText?: string;
  width?: number;
}

export default function ReceiptPreview({
  title,
  tableNumber = '-',
  date,
  time,
  items,
  showServiceFee,
  serviceFeePct,
  currency,
  footerText,
  width = 260,
}: ReceiptPreviewProps) {
  const subtotal = items.reduce((sum, i) => sum + i.total_price, 0);
  const serviceFee = showServiceFee ? subtotal * (serviceFeePct / 100) : 0;
  const total = subtotal + serviceFee;

  const displayDate = date || new Date().toLocaleDateString('az-AZ');
  const displayTime = time || new Date().toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="bg-white text-black shadow-2xl mx-auto"
      style={{
        width,
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: 11,
        padding: '16px 12px',
        lineHeight: 1.5,
      }}
    >
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
        {title || 'SİFARİŞ ÇEKİ'}
      </div>
      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      <div style={{ fontSize: 10, marginBottom: 2 }}>
        <span>Masa: </span><span style={{ fontWeight: 700 }}>{tableNumber}</span>
      </div>
      <div style={{ fontSize: 10, marginBottom: 4 }}>
        {displayDate}&nbsp;&nbsp;&nbsp;{displayTime}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      <div style={{ display: 'flex', fontSize: 10, fontWeight: 700, marginBottom: 3 }}>
        <span style={{ flex: 1 }}>Məhsul</span>
        <span style={{ width: 38, textAlign: 'center' }}>Miqdar</span>
        <span style={{ width: 48, textAlign: 'right' }}>Qiymət</span>
      </div>
      <div style={{ borderTop: '1px dashed #000', margin: '3px 0 5px' }} />

      {items.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', fontSize: 10, marginBottom: 2 }}>
          <span style={{ flex: 1 }}>{item.product_name}</span>
          <span style={{ width: 38, textAlign: 'center' }}>{item.quantity}</span>
          <span style={{ width: 48, textAlign: 'right', fontWeight: 600 }}>{item.total_price.toFixed(2)}</span>
        </div>
      ))}

      <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

      {showServiceFee && (
        <div style={{ display: 'flex', fontSize: 10, marginBottom: 3 }}>
          <span style={{ flex: 1 }}>Servis haqqı ({serviceFeePct}%)</span>
          <span style={{ width: 48, textAlign: 'right' }}>{serviceFee.toFixed(2)}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18 }}>
        <b>YEKUN:</b>
        <b>{total.toFixed(2)}&nbsp;{currency}</b>
      </div>

      {footerText && (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#555', lineHeight: 1.5 }}>{footerText}</div>
      )}
    </div>
  );
}
