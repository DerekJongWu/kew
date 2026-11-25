// The window only ever shows Kew's own page. A file dropped from Finder (or any link that slips
// through) would otherwise navigate it to file://, dropping unsaved edits and handing the dropped
// page window.kew, with full write access to the vault.

/** The slice of Electron's WebContents this needs, so tests can pass a fake. */
export interface NavigationSource {
  on(event: 'will-navigate' | 'will-redirect', listener: (e: { preventDefault(): void }) => void): unknown
}

export function lockNavigation(wc: NavigationSource): void {
  const block = (e: { preventDefault(): void }): void => e.preventDefault()
  wc.on('will-navigate', block)
  wc.on('will-redirect', block)
}
