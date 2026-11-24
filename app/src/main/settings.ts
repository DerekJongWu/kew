import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface Settings {
  lastVault: string | null
  recent: string[]
}
const MAX_RECENT = 5

export function loadSettings(userData: string): Settings {
  try {
    const raw = JSON.parse(
      readFileSync(join(userData, 'settings.json'), 'utf8')
    ) as Partial<Settings>
    const recent = Array.isArray(raw.recent) ? raw.recent.filter((r) => typeof r === 'string') : []
    return {
      lastVault: typeof raw.lastVault === 'string' ? raw.lastVault : null,
      recent: [...new Set(recent)].slice(0, MAX_RECENT)
    }
  } catch {
    return { lastVault: null, recent: [] }
  }
}

export function saveSettings(userData: string, s: Settings): void {
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(userData, 'settings.json'), JSON.stringify(s, null, 2))
}

/** Records `root` as the last and most recent vault: de-duplicated, capped at 5. */
export function rememberVault(userData: string, root: string): Settings {
  const cur = loadSettings(userData)
  const next = {
    lastVault: root,
    recent: [root, ...cur.recent.filter((r) => r !== root)].slice(0, MAX_RECENT)
  }
  saveSettings(userData, next)
  return next
}
