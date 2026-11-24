import { contextBridge, ipcRenderer } from 'electron'
import { KEW_METHODS, CHANGED_CHANNEL, type Envelope } from '../shared/methods'
import type { KewApi } from '../shared/api'

async function call(method: string, args: unknown[]): Promise<unknown> {
  const res = (await ipcRenderer.invoke(`kew:${method}`, ...args)) as Envelope
  if ('error' in res) {
    const e = new Error(res.error.message)
    e.name = res.error.name
    throw e
  }
  return res.value
}

const kew = {
  onChanged(cb: (changedIds: string[]) => void): () => void {
    const listener = (_: unknown, ids: string[]): void => cb(ids)
    ipcRenderer.on(CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(CHANGED_CHANNEL, listener)
  }
} as KewApi
for (const m of KEW_METHODS) {
  ;(kew as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => call(m, args)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('kew', kew)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.kew = kew
}
