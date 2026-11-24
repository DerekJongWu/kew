import { contextBridge, ipcRenderer } from 'electron'
import {
  KEW_METHODS,
  CHANGED_CHANNEL,
  MENU_UNDO_CHANNEL,
  FLUSH_CHANNEL,
  FLUSHED_CHANNEL,
  type Envelope,
  type KewBridge
} from '../shared/methods'

/** Returns the envelope as is; the renderer turns `{ error }` into a thrown Error (see api.ts). */
async function call(method: string, args: unknown[]): Promise<Envelope> {
  return (await ipcRenderer.invoke(`kew:${method}`, ...args)) as Envelope
}

const kew = {
  onChanged(cb: (changedIds: string[]) => void): () => void {
    const listener = (_: unknown, ids: string[]): void => cb(ids)
    ipcRenderer.on(CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(CHANGED_CHANNEL, listener)
  },
  onMenuUndo(cb: () => void): () => void {
    const listener = (): void => cb()
    ipcRenderer.on(MENU_UNDO_CHANNEL, listener)
    return () => ipcRenderer.removeListener(MENU_UNDO_CHANNEL, listener)
  },
  onFlush(cb: () => Promise<void>): () => void {
    // Always ack, even if saving failed, so the window can still close.
    const listener = (): void => {
      cb()
        .catch(() => undefined)
        .finally(() => ipcRenderer.send(FLUSHED_CHANNEL))
    }
    ipcRenderer.on(FLUSH_CHANNEL, listener)
    return () => ipcRenderer.removeListener(FLUSH_CHANNEL, listener)
  }
} as KewBridge
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
