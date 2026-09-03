import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FileChangedOnDiskError,
  assertFileMatchesBaseline,
} from '../src/editor/file-conflict.ts'

function handleWithContent(content) {
  return {
    async getFile() {
      return {
        async text() {
          return content
        },
      }
    },
  }
}

test('allows a save when the on-disk Markdown still matches its baseline', async () => {
  await assert.doesNotReject(
    assertFileMatchesBaseline(
      handleWithContent('# Original\n'),
      '# Original\n',
    ),
  )
})

test('rejects a save after another writer changed the file', async () => {
  await assert.rejects(
    assertFileMatchesBaseline(
      handleWithContent('# External edit\n'),
      '# Original\n',
    ),
    error =>
      error instanceof FileChangedOnDiskError &&
      error.name === 'FileChangedOnDiskError',
  )
})
