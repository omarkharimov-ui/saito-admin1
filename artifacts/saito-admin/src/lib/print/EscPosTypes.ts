export interface EscPosOptions {
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  doubleWidth?: boolean;
  doubleHeight?: boolean;
  underline?: boolean;
  invert?: boolean;
  font?: 'a' | 'b';
  size?: 'normal' | 'double' | 'double-height' | 'double-width';
}

export interface ReceiptTemplate {
  header?: ReceiptSection[];
  body?: ReceiptSection[];
  footer?: ReceiptSection[];
}

export interface ReceiptSection {
  type: 'text' | 'line' | 'qr' | 'barcode' | 'image' | 'feed' | 'cut' | 'open-drawer' | 'beep';
  content?: string;
  value?: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  doubleWidth?: boolean;
  doubleHeight?: boolean;
  underline?: boolean;
  width?: number;
  height?: number;
  quantity?: number;
}
