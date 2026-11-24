import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { kew } from '../api'
import { router } from '../router'
import { DESTINATIONS, SETTINGS, TYPE_LABEL } from '../lib/destinations'
import { plainError, status } from '../lib/actions'
import { defaultSelection, selectionKey } from '../lib/command-selection'
import type { DuplicateHit, RecordType, SearchHit } from '../../../shared/api'
import { Kbd } from './Chip'

const NEW_TYPES: RecordType[] = ['company', 'person', 'meeting', 'theme', 'research']
const REASON: Record<DuplicateHit['reason'], string> = {
  name: 'same name',
  alias: 'matches an alias',
  domain: 'same website',
  linkedin: 'same LinkedIn'
}

interface Cmd {
  id: string
  label: string
  hint?: string
  run(): void | Promise<void>
}

/**
 * ⌘K: jump to any record by name, or run a command. "New <type>" switches the bar into a
 * name prompt, then creates the record (offering likely duplicates first).
 */
export function CommandBar({
  onClose,
  onUndoLast
}: {
  onClose(): void
  onUndoLast(): Promise<void>
}): React.JSX.Element {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [creating, setCreating] = useState<RecordType | null>(null)
  const [dupes, setDupes] = useState<DuplicateHit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [picked, setPicked] = useState<{ key: string; value: string } | null>(null)
  const [restore] = useState(() => document.activeElement) // focus goes back here on close

  const close = (): void => {
    onClose()
    if (restore instanceof HTMLElement) restore.focus()
  }
  const go = (r: Parameters<typeof router.navigate>[0]): void => {
    router.navigate(r)
    close()
  }

  useEffect(() => {
    if (creating || !q.trim()) return
    let live = true
    kew.search(q.trim(), 8).then(
      (h) => {
        if (!live) return
        setHits(h)
        setSearchError(null)
      },
      (e) => {
        if (!live) return
        setHits([])
        setSearchError(`Search failed: ${plainError(e)}`)
      }
    )
    return () => {
      live = false
    }
  }, [q, creating])

  const create = async (force: boolean): Promise<void> => {
    if (!creating || !q.trim()) return
    setError(null)
    try {
      const res = await status.run(() => kew.createRecord(creating, q.trim(), undefined, force))
      if ('duplicates' in res) return setDupes(res.duplicates)
      const id = res.changedIds[0]
      if (id) go({ name: 'record', id })
      else close()
    } catch (e) {
      setError(plainError(e))
    }
  }

  const commands: Cmd[] = [
    ...NEW_TYPES.map((t) => ({
      id: `new-${t}`,
      label: `New ${TYPE_LABEL[t].toLowerCase()}`,
      run: () => {
        setCreating(t)
        setQ('')
      }
    })),
    ...[...DESTINATIONS, SETTINGS].map((d) => ({
      id: `go-${d.key}`,
      label: `Go to ${d.label}`,
      hint: `⌘${d.shortcut}`,
      run: () => go(d.route)
    })),
    {
      id: 'undo',
      label: 'Undo last change',
      hint: '⌘Z',
      run: async () => {
        close()
        await onUndoLast()
      }
    }
  ]
  const shownHits = creating || !q.trim() ? [] : hits
  const needle = q.trim().toLowerCase()
  const shown = commands.filter((c) => c.label.toLowerCase().includes(needle))
  const noun = creating ? TYPE_LABEL[creating].toLowerCase() : ''
  // The highlight follows the list: a pick made with the mouse or arrows holds only until the
  // query or the (asynchronously arriving) hits change, then resets to the first record hit.
  const sel = { creating: creating !== null, dupes, hits: shownHits, commands: shown, q }
  const key = selectionKey(sel)
  const value = picked?.key === key ? picked.value : defaultSelection(sel)
  const shownError = error ?? (!creating && q.trim() ? searchError : null)

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Command
        className="cmdk"
        label="Command bar"
        shouldFilter={false}
        loop
        value={value}
        onValueChange={(v) => setPicked({ key, value: v })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            if (creating) {
              setCreating(null)
              setDupes(null)
              setQ('')
            } else close()
          }
        }}
      >
        <Command.Input
          autoFocus
          className="cmdk-input"
          value={q}
          onValueChange={(v) => {
            setQ(v)
            setDupes(null)
          }}
          placeholder={creating ? `Name of the new ${noun}` : 'Jump to a record or run a command'}
        />
        {shownError && (
          <p className="row-error cmdk-error" role="alert">
            {shownError}
          </p>
        )}
        <Command.List className="cmdk-list">
          {creating ? (
            dupes ? (
              <Command.Group heading="Did you mean one of these?">
                {dupes.map((d) => (
                  <Command.Item
                    key={d.record.id}
                    value={`dup-${d.record.id}`}
                    onSelect={() => go({ name: 'record', id: d.record.id })}
                  >
                    <span className="cmdk-label">Open {d.record.name}</span>
                    <span className="cmdk-hint">{REASON[d.reason]}</span>
                  </Command.Item>
                ))}
                <Command.Item value="create-anyway" onSelect={() => void create(true)}>
                  <span className="cmdk-label">Create “{q.trim()}” anyway</span>
                </Command.Item>
              </Command.Group>
            ) : (
              q.trim() && (
                <Command.Item value="create" onSelect={() => void create(false)}>
                  <span className="cmdk-label">
                    Create {noun} “{q.trim()}”
                  </span>
                  <span className="cmdk-hint">Return</span>
                </Command.Item>
              )
            )
          ) : (
            <>
              <Command.Empty className="cmdk-empty">Nothing matches “{q.trim()}”.</Command.Empty>
              {shownHits.length > 0 && (
                <Command.Group heading="Records">
                  {shownHits.map((h) => (
                    <Command.Item
                      key={h.record.id}
                      value={`rec-${h.record.id}`}
                      onSelect={() => go({ name: 'record', id: h.record.id })}
                    >
                      <span className="cmdk-label">{h.record.name}</span>
                      <span className="cmdk-hint">{TYPE_LABEL[h.record.type]}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {shown.length > 0 && (
                <Command.Group heading="Commands">
                  {shown.map((c) => (
                    <Command.Item key={c.id} value={c.id} onSelect={() => void c.run()}>
                      <span className="cmdk-label">{c.label}</span>
                      {c.hint && <Kbd>{c.hint}</Kbd>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </>
          )}
        </Command.List>
      </Command>
    </div>
  )
}
