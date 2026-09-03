import test from 'node:test'
import assert from 'node:assert/strict'

const loadAppearance = () => import('../src/editor/appearance.ts')

test('uses Pretendard with readable editor defaults', async () => {
  const { DEFAULT_EDITOR_APPEARANCE, editorFontStack } = await loadAppearance()

  assert.deepEqual(DEFAULT_EDITOR_APPEARANCE, {
    fontFamily: 'pretendard',
    fontSize: 16,
    lineHeight: 1.72,
  })
  assert.match(editorFontStack('pretendard'), /^'Pretendard'/)
})

test('normalizes stored appearance values into supported bounds', async () => {
  const { normalizeEditorAppearance } = await loadAppearance()

  assert.deepEqual(
    normalizeEditorAppearance({
      fontFamily: 'monospace',
      fontSize: 99,
      lineHeight: 0.5,
    }),
    {
      fontFamily: 'monospace',
      fontSize: 24,
      lineHeight: 1.2,
    },
  )
})

test('falls back safely for malformed or unsupported settings', async () => {
  const { parseEditorAppearance } = await loadAppearance()

  assert.deepEqual(parseEditorAppearance('{broken'), {
    fontFamily: 'pretendard',
    fontSize: 16,
    lineHeight: 1.72,
  })
  assert.deepEqual(
    parseEditorAppearance(
      JSON.stringify({
        fontFamily: 'url(javascript:bad)',
        fontSize: 'large',
        lineHeight: null,
      }),
    ),
    {
      fontFamily: 'pretendard',
      fontSize: 16,
      lineHeight: 1.2,
    },
  )
})
