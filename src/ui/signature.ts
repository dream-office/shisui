/**
 * 签名彩蛋的点击判定（纯函数，便于单测）：
 * - 只保留最近 2 秒内的点击
 * - 累计到第 3 次时触发；触发后清空计数（不会连续误触）
 */
export const SIGNATURE_WINDOW_MS = 2000
export const SIGNATURE_CLICKS = 3

export interface SignatureClickResult {
  open: boolean
  clicks: number[]
}

export function registerSignatureClick(clicks: readonly number[], now: number): SignatureClickResult {
  const recent = clicks.filter((time) => now - time <= SIGNATURE_WINDOW_MS)
  recent.push(now)
  if (recent.length >= SIGNATURE_CLICKS) {
    return { open: true, clicks: [] }
  }
  return { open: false, clicks: recent }
}
