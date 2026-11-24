import { useState } from 'react'
import type { SetupPlan } from '../../../shared/api'
import { kew, useQuery } from '../api'
import { plainError } from '../lib/actions'
import {
  folderName,
  isFolderNotEmpty,
  isFolderMissing,
  notEmptyFolder,
  planSummary,
  prettyPath
} from '../lib/onboarding'
import { Button } from '../components/Button'

type Busy = 'sample' | 'empty' | 'folder' | 'confirm' | `recent:${string}` | null
type Step =
  { kind: 'home' } | { kind: 'plan'; plan: SetupPlan } | { kind: 'not-empty'; plan: SetupPlan }

/** First launch, and the way back to it from Settings › Vault: pick, create or open a vault. */
export function Onboarding({
  onOpened,
  onCancel
}: {
  onOpened: () => void
  onCancel?: () => void
}): React.JSX.Element {
  const [step, setStep] = useState<Step>({ kind: 'home' })
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set())

  /** Runs one call with a busy state; failures show inline in plain words. */
  const run = async (key: Exclude<Busy, null>, fn: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(plainError(e))
    } finally {
      setBusy(null)
    }
  }

  const create = (kind: 'sample' | 'empty', root?: string): Promise<void> =>
    run(kind, async () => {
      try {
        await kew.createVault(kind, root)
        onOpened()
      } catch (e) {
        if (!isFolderNotEmpty(e)) throw e
        const target = notEmptyFolder(e)
        if (!target) throw e
        setStep({ kind: 'not-empty', plan: await kew.planSetup(target) })
      }
    })

  const chooseThen = (key: 'folder' | 'empty'): Promise<void> =>
    run(key, async () => {
      const root = await kew.chooseFolder()
      if (!root) return
      if (key === 'empty') {
        try {
          await kew.createVault('empty', root)
          onOpened()
        } catch (e) {
          if (!isFolderNotEmpty(e)) throw e
          setStep({ kind: 'not-empty', plan: await kew.planSetup(notEmptyFolder(e) ?? root) })
        }
      } else setStep({ kind: 'plan', plan: await kew.planSetup(root) })
    })

  const confirm = (root: string): Promise<void> =>
    run('confirm', async () => {
      await kew.openVault(root)
      onOpened()
    })

  return (
    <div className="onboarding drag">
      <div className="onboarding-inner">
        <h1 className="onboarding-title">Welcome to Kew</h1>
        <p className="onboarding-lead">Your deal flow, in plain files you own.</p>

        {step.kind === 'home' ? (
          <>
            <ul className="paths" aria-label="Ways to start">
              <li className="path">
                <div className="path-text">
                  <p className="path-title">Try the sample vault</p>
                  <p className="path-desc">
                    Fictional companies and people, so you can look around first.
                  </p>
                </div>
                <Button
                  variant="primary"
                  disabled={busy !== null}
                  onClick={() => void create('sample')}
                >
                  {busy === 'sample' ? 'Creating…' : 'Try the sample'}
                </Button>
              </li>
              <li className="path">
                <div className="path-text">
                  <p className="path-title">Start my vault</p>
                  <p className="path-desc">
                    A new, empty vault in Documents/Kew.{' '}
                    <button
                      type="button"
                      className="link"
                      disabled={busy !== null}
                      onClick={() => void chooseThen('empty')}
                    >
                      Choose a different folder…
                    </button>
                  </p>
                </div>
                <Button disabled={busy !== null} onClick={() => void create('empty')}>
                  {busy === 'empty' ? 'Creating…' : 'Start my vault'}
                </Button>
              </li>
              <li className="path">
                <div className="path-text">
                  <p className="path-title">Open a folder</p>
                  <p className="path-desc">
                    Use notes you already have, such as an Obsidian vault. Your files stay as they
                    are.
                  </p>
                </div>
                <Button disabled={busy !== null} onClick={() => void chooseThen('folder')}>
                  {busy === 'folder' ? 'Opening…' : 'Open a folder…'}
                </Button>
              </li>
            </ul>
            {error && (
              <p className="onboarding-error" role="alert">
                {error}
              </p>
            )}
            <Recent
              busy={busy}
              gone={gone}
              onOpen={(root) =>
                void run(`recent:${root}`, async () => {
                  try {
                    await kew.openVault(root)
                    onOpened()
                  } catch (e) {
                    if (!isFolderMissing(e)) throw e
                    setGone((g) => new Set(g).add(root))
                  }
                })
              }
            />
            {onCancel && (
              <Button variant="ghost" className="onboarding-cancel" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </>
        ) : (
          <PlanCard
            plan={step.plan}
            notEmpty={step.kind === 'not-empty'}
            busy={busy === 'confirm'}
            error={error}
            onConfirm={() => void confirm(step.plan.root)}
            onCancel={() => {
              setStep({ kind: 'home' })
              setError(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

function PlanCard({
  plan,
  notEmpty,
  busy,
  error,
  onConfirm,
  onCancel
}: {
  plan: SetupPlan
  notEmpty: boolean
  busy: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}): React.JSX.Element {
  const s = planSummary(plan)
  return (
    <section className="plan" aria-labelledby="plan-title">
      <h2 className="plan-title" id="plan-title">
        {notEmpty ? 'That folder already has files' : `Open ${folderName(plan.root)}`}
      </h2>
      <p className="plan-path">{prettyPath(plan.root)}</p>
      {notEmpty && (
        <p className="plan-text">
          Kew only starts a new vault in an empty folder. You can open this one instead: your
          existing files stay as they are.
        </p>
      )}
      <p className="plan-text">{s.notes}.</p>
      {s.nothing ? (
        <p className="plan-text">This folder already has everything Kew needs.</p>
      ) : (
        <>
          <p className="plan-text">Kew will add:</p>
          <ul className="plan-list">
            {[...s.folders, ...s.files].map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p className="onboarding-error" role="alert">
          {error}
        </p>
      )}
      <div className="plan-actions">
        <Button variant="primary" disabled={busy} onClick={onConfirm}>
          {busy ? 'Opening…' : 'Open this folder'}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  )
}

/** Recent vaults. A folder that no longer exists reads "Not found" and can't be opened. */
function Recent({
  busy,
  gone,
  onOpen
}: {
  busy: Busy
  gone: ReadonlySet<string>
  onOpen: (root: string) => void
}): React.JSX.Element | null {
  const { data, error } = useQuery(async () => (await kew.getState()).recent, [])
  if (error)
    return (
      <p className="onboarding-error" role="alert">
        Couldn’t load your recent vaults. {plainError(error)}
      </p>
    )
  if (!data || data.length === 0) return null
  return (
    <section className="recent" aria-labelledby="recent-title">
      <h2 className="recent-title" id="recent-title">
        Recent
      </h2>
      <ul>
        {data.map((r) => (
          <li key={r.root} className="recent-row">
            <div className="recent-text">
              <p className="recent-name">{folderName(r.root)}</p>
              <p className="recent-path">{prettyPath(r.root)}</p>
            </div>
            {!r.exists || gone.has(r.root) ? (
              <span className="recent-missing">Not found</span>
            ) : (
              <Button disabled={busy !== null} onClick={() => onOpen(r.root)}>
                {busy === `recent:${r.root}` ? 'Opening…' : 'Open'}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
