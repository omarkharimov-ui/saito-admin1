import { IPrinterAdapter, PrinterType, ReceiptJob } from './PrinterAdapter';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function buildTestReceiptHtml(paperWidth?: ReceiptJob['paperWidth']): string {
  const width = paperWidth === '58mm' ? 220 : paperWidth === 'a4' ? 794 : 302;
  const now = new Date();
  const date = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${now.getFullYear()}`;

  return `<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>SAITO POS - Test Çapı</title>
    <style>
      @page { size: ${width}px auto; margin: 0; }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Courier New',Courier,monospace; background:#fff; color:#000; font-size:12px; }
      .rc { width:${width}px; margin:0 auto; padding:16px 12px; line-height:1.6; }
      .c { text-align:center; }
      .b { font-weight:700; }
      .dash { border-top:1px dashed #000; margin:6px 0; }
      .row { display:flex; font-size:12px; }
      .row .n { flex:1; }
      .row .p { text-align:right; }
    </style>
  </head><body>
    <div class="rc">
      <div class="c b" style="font-size:16px;letter-spacing:1px">SAITO POS</div>
      <div class="c" style="font-size:12px;margin-bottom:4px">TEST RECEIPT</div>
      <div class="dash"></div>
      <div style="font-size:12px">Table: <b>TEST</b></div>
      <div style="font-size:12px">Cashier: <b>Admin</b></div>
      <div class="dash"></div>
      <div class="row"><span class="n">Coffee</span><span class="p">5.00</span></div>
      <div class="row"><span class="n">Cake</span><span class="p">4.00</span></div>
      <div class="dash"></div>
      <div class="row b" style="font-size:15px"><span class="n">TOTAL</span><span class="p">9.00</span></div>
      <div class="dash"></div>
      <div class="c" style="font-size:11px">${date}</div>
    </div>
  </body></html>`;
}

export class BrowserPrinterAdapter implements IPrinterAdapter {
  supports(type: PrinterType): boolean {
    return type === 'browser' || type === 'preview';
  }

  async print(job: ReceiptJob): Promise<boolean> {
    const html = job.html || buildTestReceiptHtml(job.paperWidth);

    try {
      for (let i = 0; i < (job.copies || 1); i++) {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) {
          iframe.remove();
          return false;
        }

        doc.open();
        doc.write(html);
        doc.close();

        await new Promise((resolve) => setTimeout(resolve, 300));
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        iframe.remove();
      }
      return true;
    } catch (error) {
      console.error('[BrowserPrinterAdapter] window.print() failed:', error);
      return false;
    }
  }
}
