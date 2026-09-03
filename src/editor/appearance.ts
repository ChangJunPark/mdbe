export const APPEARANCE_STORAGE_KEY = 'mdbe:appearance:v1'

export const EDITOR_FONT_OPTIONS = [
  { id: 'pretendard', label: 'Pretendard' },
  { id: 'system', label: 'System sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'monospace', label: 'Monospace' },
] as const

export type EditorFontId = typeof EDITOR_FONT_OPTIONS[number]['id']

export type EditorAppearance = {
  fontFamily: EditorFontId
  fontSize: number
  lineHeight: number
}

export const DEFAULT_EDITOR_APPEARANCE: EditorAppearance = Object.freeze({
  fontFamily: 'pretendard',
  fontSize: 16,
  lineHeight: 1.72,
})

const FONT_STACKS: Record<EditorFontId, string> = {
  pretendard:
    "'Pretendard', ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  system:
    "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
  monospace: "ui-monospace, 'SFMono-Regular', Consolas, monospace",
}

const FONT_IDS = new Set<EditorFontId>(
  EDITOR_FONT_OPTIONS.map(option => option.id),
)

function clampNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  precision: number,
) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  const clamped = Math.min(maximum, Math.max(minimum, number))
  const factor = 10 ** precision
  return Math.round(clamped * factor) / factor
}

export function normalizeEditorAppearance(value: unknown): EditorAppearance {
  const candidate =
    value && typeof value === 'object'
      ? (value as Partial<EditorAppearance>)
      : {}
  const fontFamily = FONT_IDS.has(candidate.fontFamily as EditorFontId)
    ? (candidate.fontFamily as EditorFontId)
    : DEFAULT_EDITOR_APPEARANCE.fontFamily

  return {
    fontFamily,
    fontSize: clampNumber(
      candidate.fontSize,
      DEFAULT_EDITOR_APPEARANCE.fontSize,
      12,
      24,
      0,
    ),
    lineHeight: clampNumber(
      candidate.lineHeight,
      DEFAULT_EDITOR_APPEARANCE.lineHeight,
      1.2,
      2.4,
      2,
    ),
  }
}

export function parseEditorAppearance(serialized: string | null) {
  if (!serialized) return { ...DEFAULT_EDITOR_APPEARANCE }

  try {
    return normalizeEditorAppearance(JSON.parse(serialized))
  } catch {
    return { ...DEFAULT_EDITOR_APPEARANCE }
  }
}

export function editorFontStack(fontFamily: EditorFontId) {
  return FONT_STACKS[fontFamily]
}
