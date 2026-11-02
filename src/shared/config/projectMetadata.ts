export interface ProjectMetadata {
  name: string
  owner: string
  description: string
  repository: string
  issues: string
  baseVersion: string
  version: string
  commit: string | null
  updatedAt: string | null
  builtAt: string
  changes: { sha: string; date: string; subject: string }[]
}
