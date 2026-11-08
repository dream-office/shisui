/**
 * 剪贴板追加（iOS 粘贴入口）：
 * - 输入为空 → 直接用剪贴板内容
 * - 已有内容 → 若末尾已有换行先归一，再补一个换行拼接（不产生重复空行）
 * 纯函数，便于单测；UI 只负责读剪贴板。
 */
export function appendClipboardText(previous: string, incoming: string): string {
  const base = previous.replace(/\n+$/, '')
  if (base.trim().length === 0) return incoming
  return `${base}\n${incoming}`
}
