import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PUBLIC_ENV_KEYS = [
  'XKA_SUPABASE_URL',
  'XKA_SUPABASE_ANON_KEY',
  'XKA_SUPABASE_PUBLISHABLE_KEY',
  'XKA_INITIAL_VIDEO_SOURCES',
  'XKA_TMDB_API_TOKEN',
  'XKA_TMDB_API_BASE_URL',
  'XKA_TMDB_IMAGE_BASE_URL',
  'XKA_DISABLE_ANALYTICS',
  'XKA_INITIAL_CONFIG',
  'XKA_INITIAL_LIVE_SUBSCRIPTIONS',
]

export function collectRuntimeConfig(environment = process.env) {
  return Object.fromEntries(
    PUBLIC_ENV_KEYS.filter(key => typeof environment[key] === 'string').map(key => [
      key,
      environment[key],
    ]),
  )
}

export function serializeRuntimeConfig(config) {
  const json = JSON.stringify(config)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
  return `globalThis.__XKA_RUNTIME_CONFIG__ = globalThis.__XKA_RUNTIME_CONFIG__ = Object.freeze(${json});\n`
}

export async function writeRuntimeConfig(outputPath, environment = process.env) {
  const resolvedOutput = resolve(outputPath)
  const temporaryOutput = `${resolvedOutput}.${process.pid}.tmp`
  await mkdir(dirname(resolvedOutput), { recursive: true })
  await writeFile(
    temporaryOutput,
    serializeRuntimeConfig(collectRuntimeConfig(environment)),
    'utf8',
  )
  await rename(temporaryOutput, resolvedOutput)
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  const outputPath = process.argv[2]
  if (!outputPath) {
    console.error('Usage: node scripts/generate-runtime-config.mjs <output-path>')
    process.exitCode = 1
  } else {
    await writeRuntimeConfig(outputPath)
  }
}
