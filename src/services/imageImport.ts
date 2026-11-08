/**
 * 图片压缩 + 本地 OCR + AI 识图。
 * 隐私：本地 OCR 全程不出浏览器；AI 只在调用方已拿到用户确认后才会被调用。
 */
import { ImportError, truncateText } from './fileLimits'

export interface CompressedImage {
  dataUrl: string
  width: number
  height: number
}

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.8

export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new ImportError('ocr-failed')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width, height }
}

export interface OcrTestHook {
  text?: string
  error?: string
}

/** 本地 OCR：动态加载 tesseract.js 与本地语言包，确认声明后才会被调用 */
export async function recognizeLocalImage(
  file: File,
  onProgress?: (status: string, progress: number) => void,
): Promise<{ text: string; truncated: boolean }> {
  const hook = (globalThis as { __DSH_TEST_OCR__?: OcrTestHook }).__DSH_TEST_OCR__
  if (hook) {
    if (hook.error) throw new ImportError('ocr-failed', hook.error)
    return truncateText(hook.text ?? '')
  }

  const { dataUrl } = await compressImage(file)
  const [{ createWorker }, workerUrl, coreUrl] = await Promise.all([
    import('tesseract.js'),
    import('tesseract.js/dist/worker.min.js?url').then((mod) => mod.default),
    import('tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url').then((mod) => mod.default),
  ])
  const langPath = `${import.meta.env.BASE_URL}tessdata`
  const worker = await createWorker('chi_sim+eng', 1, {
    workerPath: workerUrl,
    corePath: coreUrl,
    langPath,
    workerBlobURL: false,
    gzip: false,
    logger: (message) => onProgress?.(message.status, message.progress),
  })
  try {
    const result = await worker.recognize(dataUrl)
    return truncateText(result.data.text ?? '')
  } catch (error) {
    throw new ImportError('ocr-failed', error instanceof Error ? error.message : undefined)
  } finally {
    await worker.terminate()
  }
}

export interface ImageAiOptions {
  endpoint: string
  apiKey: string
  model: string
}
