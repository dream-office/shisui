/**
 * 本地文档导入：PDF 文本层 / DOCX / TXT / MD。
 * 全部在浏览器里完成，不上传；重依赖动态 import，不进首屏包。
 */
import { ImportError, extensionOf, truncateText, validateDocument } from './fileLimits'

export interface ExtractedDocument {
  text: string
  truncated: boolean
  fileName: string
}

async function extractPdf(file: File): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs')
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer(), useSystemFonts: true })
    const doc = await loadingTask.promise
    const parts: string[] = []
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item: unknown) => (typeof (item as { str?: unknown }).str === 'string' ? (item as { str: string }).str : ''))
        .join(' ')
      parts.push(pageText)
    }
    await loadingTask.destroy()
    const text = parts.join('\n').trim()
    if (!text) throw new ImportError('scanned-pdf')
    return text
  } catch (error) {
    if (error instanceof ImportError) throw error
    throw new ImportError('pdf-failed', error instanceof Error ? error.message : undefined)
  }
}

async function extractDocx(file: File): Promise<string> {
  try {
    // mammoth 的浏览器构建；Vite 按 package browser 字段解析
    const mammoth = (await import('mammoth/mammoth.browser.min.js')) as unknown as {
      extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
    }
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return result.value
  } catch (error) {
    throw new ImportError('docx-failed', error instanceof Error ? error.message : undefined)
  }
}

async function extractPlain(file: File): Promise<string> {
  try {
    return await file.text()
  } catch (error) {
    throw new ImportError('read-failed', error instanceof Error ? error.message : undefined)
  }
}

export async function extractDocumentText(file: File): Promise<ExtractedDocument> {
  const validation = validateDocument(file)
  if (validation) throw new ImportError(validation)

  const ext = extensionOf(file.name)
  let raw: string
  if (ext === 'pdf') raw = await extractPdf(file)
  else if (ext === 'docx') raw = await extractDocx(file)
  else raw = await extractPlain(file)

  const { text, truncated } = truncateText(raw)
  if (!text) throw new ImportError('empty')
  return { text, truncated, fileName: file.name }
}
