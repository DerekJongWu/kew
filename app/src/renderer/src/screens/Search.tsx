import { useEffect, useRef, useState } from 'react'
import { kew, useQuery } from '../api'
import { router } from '../router'
import { plainError } from '../lib/actions'
import { TYPE_LABEL } from '../lib/destinations'
import { SEARCH_LIMIT, moveActive, splitSnippet } from '../lib/search'
import { Chip } from '../components/Chip'
import { EmptyState } from '../components/EmptyState'

/** Dispatched by ⌘⇧F so the input takes focus even when the search route is already showing. */
export const FOCUS_SEARCH = 'kew:focus-search'

const DEBOUNCE_MS = 350

/** Full-text search over names, aliases and bodies. The query lives in the route, so back/forward restore it. */
export function Search({ q }: { q: string }): React.JSX.Element {
  const [text, setText] = useState(q)
  const [picked, setPicked] = useState<{ data: unknown; i: number } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const sent = useRef(q) // the last query this screen put in the route

  // Back/forward brings a different q: show it. Our own navigation is already in the input.
  useEffect(() => {
    if (q !== sent.current) {
      sent.current = q
      setText(q)
    }
  }, [q])

  // Enter pushes a history entry; debounced typing only refines the current one.
  const submit = (value: string, how: 'navigate' | 'replace' = 'navigate'): void => {
    const next = value.trim()
    if (next === q) return
    sent.current = next
    router[how]({ name: 'search', q: next })
  }
  useEffect(() => {
    if (text.trim() === q) return
    const t = setTimeout(() => submit(text, 'replace'), DEBOUNCE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, q])

  useEffect(() => {
    const focus = (): void => {
      input.current?.focus()
      input.current?.select()
    }
    focus()
    window.addEventListener(FOCUS_SEARCH, focus)
    return () => window.removeEventListener(FOCUS_SEARCH, focus)
  }, [])

  const { data, error } = useQuery(
    async () => ({ q, hits: q ? await kew.search(q, SEARCH_LIMIT) : [] }),
    [q]
  )
  // `data` carries the query it answers, which lags behind q right after a change.
  const fresh = data?.q === q
  const hits = q && fresh ? data.hits : []
  const settled = fresh && text.trim() === q // results on screen answer what the input says
  // The highlight resets to the first result whenever a new result list arrives.
  const active = picked && picked.data === data ? picked.i : 0
  const setActive = (f: number | ((a: number) => number)): void =>
    setPicked({ data, i: typeof f === 'function' ? f(active) : f })
  const open = (id: string): void => router.navigate({ name: 'record', id })
  const current = hits[Math.min(active, hits.length - 1)]

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hits.length) return
      e.preventDefault()
      setActive((a) => moveActive(a, e.key === 'ArrowDown' ? 1 : -1, hits.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (settled && current) open(current.record.id)
      else submit(text)
    }
  }

  return (
    <div className="screen search">
      <header className="screen-head">
        <h1 className="screen-title">Search</h1>
      </header>
      <label className="visually-hidden" htmlFor="search-input">
        Search notes
      </label>
      <input
        id="search-input"
        ref={input}
        className="field search-input"
        type="search"
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls="search-results"
        aria-activedescendant={settled && current ? `hit-${current.record.id}` : undefined}
        placeholder="Search names and note text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      {error && (
        <p className="row-error" role="alert">
          Search failed: {plainError(error)}
        </p>
      )}
      {!q && !error && (
        <EmptyState title="Search your notes">
          Type a word or name. Results include text inside note bodies.
        </EmptyState>
      )}
      {q && !error && fresh && hits.length === 0 && (
        <EmptyState title={`Nothing matches “${q}”`}>
          Try a shorter word or a different spelling.
        </EmptyState>
      )}
      {hits.length > 0 && (
        <>
          <p className="search-count" aria-live="polite">
            {hits.length === SEARCH_LIMIT
              ? `Showing the first ${SEARCH_LIMIT} results`
              : `${hits.length} ${hits.length === 1 ? 'result' : 'results'}`}
          </p>
          <ul className="search-results" id="search-results" role="listbox" aria-label="Results">
            {hits.map((h, i) => (
              <li
                key={h.record.id}
                id={`hit-${h.record.id}`}
                role="option"
                aria-selected={i === active}
                className="search-hit"
                data-active={i === active}
                onMouseMove={() => i !== active && setActive(i)}
                onClick={() => open(h.record.id)}
              >
                <div className="search-hit-head">
                  <span className="search-name">{h.record.name}</span>
                  <Chip>{TYPE_LABEL[h.record.type]}</Chip>
                </div>
                <p className="search-snippet">
                  {splitSnippet(h.snippet).map((p, j) =>
                    p.hit ? <mark key={j}>{p.text}</mark> : <span key={j}>{p.text}</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
