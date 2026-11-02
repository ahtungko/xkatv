import type { ProjectMetadata } from '../src/shared/config/projectMetadata'

export function collectProjectMetadata(options?: {
  root?: string
  env?: Record<string, string | undefined>
  now?: Date
}): ProjectMetadata
export function escapeHtml(value: string): string
