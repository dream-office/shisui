/** 下载一个文本文件（导出 ICS 等）。不依赖任何库。 */
export function downloadTextFile(content: string, fileName: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 给浏览器一点时间开始下载，再释放
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
