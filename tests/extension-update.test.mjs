import test from 'node:test'
import assert from 'node:assert/strict'

const loadUpdate = () => import('../src/core/extension-update.ts')

test('normalizes a valid Chrome update notification', async () => {
  const { normalizeExtensionUpdateInfo } = await loadUpdate()

  assert.deepEqual(
    normalizeExtensionUpdateInfo({ version: '0.2.1', detectedAt: 12345 }),
    { version: '0.2.1', detectedAt: 12345 },
  )
})

test('rejects malformed update data from storage or messages', async () => {
  const { normalizeExtensionUpdateInfo } = await loadUpdate()

  assert.equal(normalizeExtensionUpdateInfo(null), null)
  assert.equal(
    normalizeExtensionUpdateInfo({ version: 'next', detectedAt: 12345 }),
    null,
  )
  assert.equal(
    normalizeExtensionUpdateInfo({ version: '0.2.1', detectedAt: 'today' }),
    null,
  )
})

test('compares Chrome extension versions numerically', async () => {
  const { compareExtensionVersions, isNewerExtensionVersion } =
    await loadUpdate()

  assert.equal(compareExtensionVersions('0.10.0', '0.2.9'), 1)
  assert.equal(compareExtensionVersions('1.0', '1.0.0'), 0)
  assert.equal(compareExtensionVersions('1.2.3', '2.0.0'), -1)
  assert.equal(isNewerExtensionVersion('0.2.1', '0.2.0'), true)
  assert.equal(isNewerExtensionVersion('0.2.0', '0.2.0'), false)
  assert.equal(isNewerExtensionVersion('invalid', '0.2.0'), false)
})
