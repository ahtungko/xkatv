import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectProjectMetadata, escapeHtml } from './project-metadata.mjs'

const roots: string[] = []
const base = {
  name: 'My TV',
  version: '3.2.1',
  description: 'Private cinema',
  author: { name: 'owner' },
  repository: { url: 'git+https://github.com/owner/my-tv.git' },
  bugs: { url: 'https://github.com/owner/my-tv/issues' },
}
const now = new Date('2026-10-22T12:00:00Z')
const sha = 'a'.repeat(40)
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'xkatv-metadata-'))
  roots.push(root)
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(base))
  return root
}
function snapshot(root: string, overrides = {}) {
  mkdirSync(path.join(root, '.generated'))
  writeFileSync(
    path.join(root, '.generated/project-metadata.json'),
    JSON.stringify({
      baseVersion: base.version,
      repository: 'https://github.com/owner/my-tv',
      commit: sha,
      changes: [{ sha, date: now.toISOString(), subject: 'feat: snapshot change' }],
      ...overrides,
    }),
  )
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!path.resolve(root).startsWith(path.join(path.resolve(tmpdir()), 'xkatv-metadata-')))
      throw new Error('Unexpected cleanup path')
    rmSync(root, { recursive: true, force: true })
  }
})

describe('自动项目信息', () => {
  it('从 package.json 读取名称、作者和链接，没有 Git 时明确缺少更新记录', () => {
    const root = fixture()
    const data = collectProjectMetadata({ root, env: { PRIVATE_SECRET: 'not-public' }, now })
    expect(data).toMatchObject({
      name: 'My TV',
      owner: 'owner',
      version: '3.2.1',
      description: 'Private cinema',
      repository: 'https://github.com/owner/my-tv',
      issues: 'https://github.com/owner/my-tv/issues',
      commit: null,
      updatedAt: null,
      builtAt: now.toISOString(),
      changes: [],
    })
    expect(JSON.stringify(data)).not.toContain('not-public')
  })

  it('Git 提交自动产生版本、提交时间和日志，重复构建保持相同版本', () => {
    const root = fixture()
    const git = (args: string[]) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim()
    git(['init'])
    git(['add', 'package.json'])
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Metadata test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '-m',
        'feat: add preview',
      ],
      {
        cwd: root,
        stdio: 'pipe',
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: '2026-10-20T12:00:00Z',
          GIT_COMMITTER_DATE: '2026-10-20T12:00:00Z',
        },
      },
    )
    const commit = git(['rev-parse', 'HEAD'])
    const first = collectProjectMetadata({ root, env: {}, now })
    const again = collectProjectMetadata({
      root,
      env: { GITHUB_SHA: commit.slice(0, 7) },
      now: new Date('2026-10-23T12:00:00Z'),
    })
    expect(first.version).toBe(`3.2.1+git.${commit.slice(0, 7)}`)
    expect(first.updatedAt).toBe('2026-10-20T12:00:00.000Z')
    expect(first.changes).toEqual([
      { sha: commit, date: first.updatedAt, subject: 'feat: add preview' },
    ])
    expect(again.version).toBe(first.version)
    expect(again.changes).toEqual(first.changes)
  })

  it('Docker 没有 .git 时复用匹配的公开快照，但项目字段仍从当前配置读取', () => {
    const root = fixture()
    snapshot(root, { name: 'stale name', owner: 'stale owner', PRIVATE_SECRET: 'not-public' })
    const data = collectProjectMetadata({ root, env: { VCS_REF: sha }, now })
    expect(data.name).toBe(base.name)
    expect(data.owner).toBe('owner')
    expect(data.version).toBe(`3.2.1+git.${sha.slice(0, 7)}`)
    expect(data.changes[0]?.subject).toBe('feat: snapshot change')
    expect(JSON.stringify(data)).not.toContain('not-public')
  })

  it('不把旧快照中的日志归到其他部署提交，日期缺失时保留构建时间', () => {
    const root = fixture()
    snapshot(root)
    const data = collectProjectMetadata({
      root,
      env: { VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40), BUILD_DATE: 'invalid' },
      now,
    })
    expect(data.version).toBe('3.2.1+git.bbbbbbb')
    expect(data.changes).toEqual([])
    expect(data.updatedAt).toBeNull()
    expect(data.builtAt).toBe(now.toISOString())
  })

  it('最多打包 20 条记录，异常时间不会进入快照日志', () => {
    const root = fixture()
    const changes = Array.from({ length: 25 }, (_, index) => ({
      sha,
      date: now.toISOString(),
      subject: `change ${index}`,
    }))
    changes[1].date = 'invalid'
    snapshot(root, { changes })
    const data = collectProjectMetadata({ root, env: {}, now })
    expect(data.changes).toHaveLength(19)
    expect(data.changes.some(change => change.subject === 'change 1')).toBe(false)
    expect(data.changes.some(change => change.subject === 'change 24')).toBe(false)
  })

  it('拒绝携带凭据或脚本协议的链接，并转义 HTML 插值', () => {
    const root = fixture()
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        ...pkg,
        repository: 'https://secret:token@example.com/repo',
        bugs: 'javascript:alert(1)',
      }),
    )
    const data = collectProjectMetadata({ root, env: { GITHUB_SHA: 'not-a-commit' }, now })
    expect(data.repository).toBe('')
    expect(data.issues).toBe('')
    expect(data.commit).toBeNull()
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    )
  })
})
