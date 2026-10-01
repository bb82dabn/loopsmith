import type { Composition, SerializedProject } from './types'
import { PROJECT_VERSION } from './types'
import { parseProjectFile } from './validation'

const AUTOSAVE_KEY = 'loopsmith:autosave:v1'

export function serializeProject(composition: Composition, savedAt = new Date().toISOString()): string {
  const project: SerializedProject = {
    format: 'loopsmith-project',
    version: PROJECT_VERSION,
    savedAt,
    composition,
  }
  return JSON.stringify(project, null, 2)
}

export function saveAutosave(composition: Composition): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeProject(composition))
  } catch {
    // Autosave is best-effort when browser storage is unavailable or full.
  }
}

export function loadAutosave(): Composition | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    return raw ? parseProjectFile(raw).composition : null
  } catch {
    return null
  }
}
