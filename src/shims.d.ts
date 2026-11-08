declare module 'pdfjs-dist/build/pdf.min.mjs' {
  export const GlobalWorkerOptions: { workerSrc: string }
  export interface PdfTextItem {
    str?: string
  }
  export interface PdfPage {
    getTextContent(): Promise<{ items: PdfTextItem[] }>
  }
  export interface PdfDocument {
    numPages: number
    getPage(page: number): Promise<PdfPage>
    destroy(): Promise<void>
  }
  export interface PdfLoadingTask {
    promise: Promise<PdfDocument>
    destroy(): Promise<void>
  }
  export function getDocument(input: { data: ArrayBuffer; useSystemFonts?: boolean }): PdfLoadingTask
}

declare module 'mammoth/mammoth.browser.min.js' {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>
}
