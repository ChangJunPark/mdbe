export const UPDATE_READY_STORAGE_KEY = 'mdbe:update-ready'
export const UPDATE_AVAILABLE_ACTION = 'mdbeUpdateAvailable'

export type ExtensionUpdateInfo = {
  version: string
  detectedAt: number
}

const VERSION_PATTERN = /^\d+(?:\.\d+){0,3}$/

export function normalizeExtensionUpdateInfo(
  value: unknown,
): ExtensionUpdateInfo | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<ExtensionUpdateInfo>
  if (
    typeof candidate.version !== 'string' ||
    !VERSION_PATTERN.test(candidate.version) ||
    typeof candidate.detectedAt !== 'number' ||
    !Number.isFinite(candidate.detectedAt) ||
    candidate.detectedAt <= 0
  ) {
    return null
  }

  return {
    version: candidate.version,
    detectedAt: candidate.detectedAt,
  }
}

export function compareExtensionVersions(left: string, right: string) {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (difference !== 0) return Math.sign(difference)
  }

  return 0
}

export function isNewerExtensionVersion(candidate: string, current: string) {
  if (!VERSION_PATTERN.test(candidate) || !VERSION_PATTERN.test(current)) {
    return false
  }
  return compareExtensionVersions(candidate, current) > 0
}
