'use client';

import React from 'react';

interface ReceiptItem {
  product_name: string;
  quantity: number;
  total_price: number;
  indent?: boolean;
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
  discountAmount?: number;
  campaignName?: string;
  transparent?: boolean;
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
  discountAmount = 0,
  campaignName,
  transparent = false,
}: ReceiptPreviewProps) {
  const subtotal = items.reduce((sum, i) => sum + i.total_price, 0);
  const serviceFee = showServiceFee ? subtotal * (serviceFeePct / 100) : 0;
  const total = Math.max(0, subtotal - discountAmount + serviceFee);

  const displayDate = date || new Date().toLocaleDateString('az-AZ');
  const displayTime = time || new Date().toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className={`${transparent ? '' : 'bg-white'} text-black mx-auto`}
      style={{
        width: transparent ? '100%' : width,
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: transparent ? 12 : 11,
        padding: transparent ? '0' : '16px 12px',
        lineHeight: 1.6,
      }}
    >
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: transparent ? 15 : 13, marginBottom: 2 }}>
        {title || 'SİFARİŞ ÇEKİ'}
      </div>
      <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />

      <div style={{ fontSize: transparent ? 11 : 10, marginBottom: 2 }}>
        <span>Masa: </span><span style={{ fontWeight: 700 }}>{tableNumber}</span>
      </div>
      <div style={{ fontSize: transparent ? 11 : 10, marginBottom: 6 }}>
        {displayDate}&nbsp;&nbsp;&nbsp;{displayTime}
      </div>

      <div style={{ borderTop: '1px dashed #999', margin: '4px 0' }} />

      <div style={{ display: 'flex', fontSize: transparent ? 11 : 10, fontWeight: 700, marginBottom: 4 }}>
        <span style={{ flex: 1 }}>Məhsul</span>
        <span style={{ width: transparent ? 50 : 38, textAlign: 'center' }}>Miqdar</span>
        <span style={{ width: transparent ? 64 : 48, textAlign: 'right' }}>Qiymət</span>
      </div>
      <div style={{ borderTop: '1px dashed #999', margin: '3px 0 6px' }} />

      {items.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', fontSize: item.indent ? (transparent ? 10 : 9) : (transparent ? 11 : 10), marginBottom: 2, color: item.indent ? '#555' : 'inherit' }}>
          <span style={{ flex: 1 }}>{item.product_name}</span>
          <span style={{ width: transparent ? 50 : 38, textAlign: 'center' }}>{item.quantity}</span>
          <span style={{ width: transparent ? 64 : 48, textAlign: 'right', fontWeight: item.indent ? 400 : 600 }}>{item.indent ? '' : item.total_price.toFixed(2)}</span>
        </div>
      ))}

      <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

      {discountAmount > 0 && (
        <div style={{ display: 'flex', fontSize: transparent ? 11 : 10, marginBottom: 4, color: '#BE123C' }}>
          <span style={{ flex: 1 }}>{campaignName || 'Endirim'}</span>
          <span style={{ width: transparent ? 64 : 48, textAlign: 'right' }}>-{discountAmount.toFixed(2)}</span>
        </div>
      )}

      {showServiceFee && (
        <div style={{ display: 'flex', fontSize: transparent ? 11 : 10, marginBottom: 4 }}>
          <span style={{ flex: 1 }}>Servis haqqı ({serviceFeePct}%)</span>
          <span style={{ width: transparent ? 64 : 48, textAlign: 'right' }}>{serviceFee.toFixed(2)}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: transparent ? 20 : 18, marginTop: 4 }}>
        <b>YEKUN:</b>
        <b>{total.toFixed(2)}&nbsp;{currency}</b>
      </div>

      {footerText && (
        <div style={{ textAlign: 'center', fontSize: transparent ? 10 : 9, color: '#555', lineHeight: 1.5, marginTop: 4 }}>{footerText}</div>
      )}
    </div>
  );
}
