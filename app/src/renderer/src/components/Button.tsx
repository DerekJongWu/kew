import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): React.JSX.Element {
  return (
    <button
      type={type}
      className={`btn btn-${variant}${className ? ' ' + className : ''}`}
      {...rest}
    />
  )
}
