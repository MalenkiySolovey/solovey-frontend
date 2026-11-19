import { acquireStepUpToken } from '@/shared/composables/useSecurityOperations'
import Data from '@/store/modules/data'
import Ws from '@/store/ws'

export interface ImportProgress {
  readonly step: string
  readonly current: number
  readonly total: number
  readonly percent: number
  readonly currentTag?: string
  readonly currentName?: string
}

// The shell retains the session, realtime connection and data refresh.
export const acquireImportStepUp = (credential: string) =>
  acquireStepUpToken('backup.restore', 'database:compatible-import', credential)

export const connectImportProgress = () => Ws().connect()
export const readImportProgress = (): ImportProgress | null =>
  Ws().componentProgress['import-xui'] ?? null
export const refreshAfterImport = () => Data().loadData()
