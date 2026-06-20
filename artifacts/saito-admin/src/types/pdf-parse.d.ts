declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, any>;
    metadata: any;
    version: string;
  }
  function pdfParse(buffer: Buffer, options?: any): Promise<PdfParseResult>;
  export = pdfParse;
}
