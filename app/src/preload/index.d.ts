import { ElectronAPI } from '@electron-toolkit/preload'
import type { KewApi } from '../shared/api'

declare global {
  interface Window {
    electron: ElectronAPI
    kew: KewApi
  }
}
