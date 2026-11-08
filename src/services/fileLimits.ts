/** 文件导入硬限制与纯函数校验（可单测） */

export const DOC_MAX_BYTES = 20 * 1024 * 1024
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const TEXT_MAX_CHARS = 50_000

export const DOC_EXTENSIONS = ['pdf', 'docx', 'txt', 'md'] as const
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const

export type ImportErrorCode =
  | 'unsupported-type'
  | 'legacy-office'
  | 'too-large'
  | 'empty'
  | 'scanned-pdf'
  | 'pdf-failed'
  | 'docx-failed'
  | 'read-failed'
  | 'ocr-failed'
  | 'ai-unavailable'
  | 'ai-unsupported-vision'
  | 'ai-failed'
  | 'cancelled'

export class ImportError extends Error {
  code: ImportErrorCode
  constructor(code: ImportErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'ImportError'
    this.code = code
  }
}

export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

export function isDocumentFile(name: string): boolean {
  return (DOC_EXTENSIONS as readonly string[]).includes(extensionOf(name))
}

export function isImageFile(name: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(name))
}

/** 文件类型/大小校验；返回 null 表示通过 */
export function validateDocument(file: { name: string; size: number }): ImportErrorCode | null {
  const ext = extensionOf(file.name)
  if (['doc', 'xls', 'ppt'].includes(ext)) return 'legacy-office'
  if (!(DOC_EXTENSIONS as readonly string[]).includes(ext)) return 'unsupported-type'
  if (file.size > DOC_MAX_BYTES) return 'too-large'
  return null
}

export function validateImage(file: { name: string; size: number }): ImportErrorCode | null {
  if (!isImageFile(file.name)) return 'unsupported-type'
  if (file.size > IMAGE_MAX_BYTES) return 'too-large'
  return null
}

/** 超过 5 万字截断；返回是否截断 */
export function truncateText(text: string, max = TEXT_MAX_CHARS): { text: string; truncated: boolean } {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (normalized.length <= max) return { text: normalized, truncated: false }
  return { text: `${normalized.slice(0, max)}\n…（已截断，超出 ${max} 字）`, truncated: true }
}
