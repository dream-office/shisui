import { useRef } from 'react'

interface Option {
  value: string
  label: string
}

interface Props {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  className?: string
}

/** 分段滑块：轨道 + 等宽段；radiogroup/radio + roving tabindex + 方向键/Home/End。 */
export default function Segmented({ label, value, options, onChange, className = '' }: Props) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const move = (next: number) => {
    const option = options[next]
    if (!option) return
    onChange(option.value)
    refs.current[next]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, current: number) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    let next = current
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = options.length - 1
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % options.length
    else next = (current - 1 + options.length) % options.length
    move(next)
  }

  return (
    <div className={`segmented ${className}`.trim()} role="radiogroup" aria-label={label}>
      {options.map((option, i) => (
        <button
          key={option.value}
          ref={(el) => { refs.current[i] = el }}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          className="segmented-option"
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => onKeyDown(event, i)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
