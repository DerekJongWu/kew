// A handful of 16px stroke icons. Decorative: always paired with text or an aria-label.
const PATHS = {
  back: 'M10 3.5 5.5 8l4.5 4.5',
  forward: 'M6 3.5 10.5 8 6 12.5',
  search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm3.6-1.4L14 14',
  history: 'M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.6h2.6M8 5v3.2l2 1.3',
  check: 'M3.5 8.5 6.5 11.5 12.5 4.5',
  alert: 'M8 5v3.5M8 11v.01M8 1.8l6.5 11.7h-13Z',
  plus: 'M8 3v10M3 8h10',
  dot: 'M8 8h.01'
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }): React.JSX.Element {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
