// Inline forms used by list rows: log an outreach event, snooze, pass with a reason.
import { useId, useState } from 'react'
import { addDays } from '../lib/dates'
import { Button } from './Button'
import { Popover } from './Popover'

const CHANNELS = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'email', label: 'Email' }
]

export function LogForm({
  dir,
  defaultChannel,
  onSubmit,
  onCancel
}: {
  dir: 'out' | 'in'
  defaultChannel?: string
  onSubmit(channel: string, text: string): void
  onCancel(): void
}): React.JSX.Element {
  const [channel, setChannel] = useState(defaultChannel === 'email' ? 'email' : 'linkedin')
  const [text, setText] = useState('')
  const id = useId()
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) onSubmit(channel, text.trim())
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <label className="visually-hidden" htmlFor={`${id}-ch`}>
        Channel
      </label>
      <select
        id={`${id}-ch`}
        className="field field-select"
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
      >
        {CHANNELS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <label className="visually-hidden" htmlFor={`${id}-text`}>
        {dir === 'out' ? 'What you sent' : 'What they said'}
      </label>
      <input
        id={`${id}-text`}
        className="field field-grow"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={dir === 'out' ? 'What you sent, in a line' : 'What they said, in a line'}
      />
      <Button type="submit" variant="primary" disabled={!text.trim()}>
        {dir === 'out' ? 'Log send' : 'Log reply'}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  )
}

export function PassForm({
  onSubmit,
  onCancel
}: {
  onSubmit(reason: string): void
  onCancel(): void
}): React.JSX.Element {
  const [reason, setReason] = useState('')
  const id = useId()
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (reason.trim()) onSubmit(reason.trim())
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <label className="visually-hidden" htmlFor={id}>
        Reason for passing
      </label>
      <input
        id={id}
        className="field field-grow"
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why pass? One line, kept on the company"
      />
      <Button type="submit" variant="primary" disabled={!reason.trim()}>
        Pass
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  )
}

const PRESETS: [label: string, days: number][] = [
  ['3 days', 3],
  ['1 week', 7],
  ['2 weeks', 14]
]

export function SnoozeMenu({
  today,
  onSnooze
}: {
  today: string
  onSnooze(until: string): void
}): React.JSX.Element {
  const [date, setDate] = useState(addDays(today, 1))
  const id = useId()
  return (
    <Popover label="Snooze" panelLabel="Snooze until" buttonClass="btn btn-ghost">
      {(close) => (
        <div className="menu">
          {PRESETS.map(([label, days]) => (
            <button
              key={days}
              type="button"
              className="menu-item"
              onClick={() => {
                close()
                onSnooze(addDays(today, days))
              }}
            >
              {label}
            </button>
          ))}
          <form
            className="menu-date"
            onSubmit={(e) => {
              e.preventDefault()
              if (date > today) {
                close()
                onSnooze(date)
              }
            }}
          >
            <label htmlFor={id} className="menu-label">
              Pick a date
            </label>
            <div className="menu-date-row">
              <input
                id={id}
                className="field"
                type="date"
                min={addDays(today, 1)}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Button type="submit" variant="secondary" disabled={!(date > today)}>
                Snooze
              </Button>
            </div>
          </form>
        </div>
      )}
    </Popover>
  )
}
