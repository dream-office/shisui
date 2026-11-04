import { useEffect, useState } from 'react'

/** 一个会自己走的时间源：倒计时、过期状态需要它，但不能每个组件各开一个定时器 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
