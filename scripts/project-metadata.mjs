import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const commitHash = value => typeof value === 'string' && /^[a-f\d]{7,40}$/i.test(value)
const timestamp = value => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}
const webUrl = value => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href.replace(/\/$/, '')
      : ''
  } catch {
    return ''
  }
}

export function collectProjectMetadata({
  root = process.cwd(),
  env = process.env,
  now = new Date(),
} = {}) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const git = args => {
    try {
      return execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      }).trim()
    } catch {
      return ''
    }
  }
  const repository = webUrl(
    (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '')
      .replace(/^git\+/, '')
      .replace(/\.git$/, ''),
  )
  const name = pkg.name || 'TV'
  const owner = (typeof pkg.author === 'string' ? pkg.author : pkg.author?.name) || ''
  const baseVersion = pkg.version || '0.0.0'
  const localCommit = git(['rev-parse', 'HEAD'])
  const environmentCommit = [
    env.VCS_REF,
    env.VERCEL_GIT_COMMIT_SHA,
    env.GITHUB_SHA,
    env.CF_PAGES_COMMIT_SHA,
    env.COMMIT_REF,
  ].find(commitHash)
  let commit = environmentCommit || (commitHash(localCommit) ? localCommit : null)
  let changes = []
  if (localCommit && commit && localCommit.startsWith(commit)) {
    commit = localCommit
    const log = git(['log', '-20', '--first-parent', '--format=%H%x09%cI%x09%s'])
    changes = log.split('\n').flatMap(line => {
      const [sha, date, ...subject] = line.split('\t')
      const parsed = timestamp(date)
      return commitHash(sha) && parsed && subject.join('\t').trim()
        ? [{ sha, date: parsed, subject: subject.join('\t').trim() }]
        : []
    })
  } else {
    // Docker 构建上下文不包含 .git；CI 可预先生成仅含公开项目信息的快照。
    try {
      const cached = JSON.parse(
        readFileSync(path.join(root, '.generated/project-metadata.json'), 'utf8'),
      )
      if (
        cached.baseVersion === baseVersion &&
        cached.repository === repository &&
        commitHash(cached.commit) &&
        (!commit || cached.commit.startsWith(commit))
      ) {
        commit = cached.commit
        changes = Array.isArray(cached.changes)
          ? cached.changes.slice(0, 20).flatMap(change => {
              const date = timestamp(change.date)
              return commitHash(change.sha) && date && typeof change.subject === 'string'
                ? [{ sha: change.sha, date, subject: change.subject }]
                : []
            })
          : []
      }
    } catch {
      // 源码压缩包和没有历史记录的构建仍可正常生成站点。
    }
  }
  // 不把可能来自其他提交的旧记录标成当前构建的更新。
  if (changes[0]?.sha !== commit) changes = []
  return {
    name,
    owner,
    description: pkg.description || name,
    repository,
    issues:
      webUrl(typeof pkg.bugs === 'string' ? pkg.bugs : pkg.bugs?.url) ||
      (repository ? `${repository}/issues` : ''),
    baseVersion,
    version: commit ? `${baseVersion}+git.${commit.slice(0, 7)}` : baseVersion,
    commit,
    updatedAt: changes[0]?.date || timestamp(env.BUILD_DATE),
    builtAt: now.toISOString(),
    changes,
  }
}

export const escapeHtml = value =>
  String(value).replace(
    /[&<>"']/g,
    char =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char],
  )

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[process.argv.indexOf('--output') + 1]
  if (!process.argv.includes('--output') || !output)
    throw new Error('Usage: node scripts/project-metadata.mjs --output <file>')
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, JSON.stringify(collectProjectMetadata(), null, 2) + '\n')
}
