import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { kew } from '../api'
import { router } from '../router'
import { DESTINATIONS, SETTINGS, TYPE_LABEL } from '../lib/destinations'
import { plainError } from '../lib/actions'
import { defaultSelection, selectionKey, SEARCH_ITEM } from '../lib/command-selection'
import type { RecordType, SearchHit } from '../../../shared/api'
import { Kbd } from './Chip'

const NEW_TYPES: RecordType[] = ['company', 'person', 'meeting', 'theme', 'research']

interface Cmd {
  id: string
  label: string
  hint?: string
  run(): void | Promise<void>
}

/**
 * ⌘K: jump to any record by name, or run a command. "New <type>" closes the bar and opens the
 * same NewRecordDialog the list screens use, so there is one creation flow.
 */
export function CommandBar({
  onClose,
  onUndoLast,
  onNew
}: {
  onClose(): void
  onUndoLast(): Promise<void>
  onNew(type: RecordType): void
}): React.JSX.Element {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
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
    if (!q.trim()) return
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
  }, [q])

  const commands: Cmd[] = [
    ...NEW_TYPES.map((t) => ({
      id: `new-${t}`,
      label: `New ${TYPE_LABEL[t].toLowerCase()}`,
      run: () => {
        close()
        onNew(t)
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
  const shownHits = !q.trim() ? [] : hits
  const needle = q.trim().toLowerCase()
  const shown = commands.filter((c) => c.label.toLowerCase().includes(needle))
  // "Search notes for …" is pinned as the first row whenever there is a query; records (best
  // match first) and commands follow. Return still acts on the best record (see defaultSelection).
  // The highlight follows the list: a pick made with the mouse or arrows holds only until the
  // query or the (asynchronously arriving) hits change, then resets to the first record hit.
  const sel = { creating: false, dupes: null, hits: shownHits, commands: shown, q }
  const key = selectionKey(sel)
  const value = picked?.key === key ? picked.value : defaultSelection(sel)
  const shownError = q.trim() ? searchError : null

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
            close()
          }
        }}
      >
        <Command.Input
          autoFocus
          className="cmdk-input"
          value={q}
          onValueChange={setQ}
          placeholder="Jump to a record or run a command"
        />
        {shownError && (
          <p className="row-error cmdk-error" role="alert">
            {shownError}
          </p>
        )}
        <Command.List className="cmdk-list">
          <>
            <Command.Empty className="cmdk-empty">Nothing matches “{q.trim()}”.</Command.Empty>
            {needle && (
              <Command.Item
                className="cmdk-search-item"
                value={SEARCH_ITEM}
                onSelect={() => go({ name: 'search', q: q.trim() })}
              >
                <span className="cmdk-label">Search notes for “{q.trim()}”</span>
                <Kbd>⌘⇧F</Kbd>
              </Command.Item>
            )}
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
        </Command.List>
      </Command>
    </div>
  )
}
