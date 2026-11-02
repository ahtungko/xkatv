/** CMS APIs may return numeric IDs despite the public string-ID interface. */
export function normalizeVodId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) value = String(value)
  return typeof value === 'string' && value.length <= 512 && /^[\w-]+$/.test(value) ? value : null
}
