import test from 'node:test'
import assert from 'node:assert/strict'

const loadBridge = () => import('../src/editor/aside-bridge.ts')

function createController(overrides = {}) {
  const calls = { replace: [], flush: 0, save: 0 }
  const state = {
    ready: true,
    fileName: 'notes.md',
    path: 'docs/notes.md',
    markdown: '# Notes\n',
    revision: 4,
    dirty: false,
    saving: false,
    canSave: true,
    status: 'Saved',
    ...overrides,
  }

  return {
    calls,
    state,
    controller: {
      getDocument: () => ({ ...state }),
      replaceMarkdown(markdown) {
        calls.replace.push(markdown)
        state.markdown = markdown
        state.revision += 1
        state.dirty = true
        state.status = 'Unsaved changes'
      },
      flushDraft() {
        calls.flush += 1
      },
      async save() {
        calls.save += 1
        state.dirty = false
        state.status = 'Saved locally'
        return {
          ok: true,
          savedRevision: state.revision,
          document: { apiVersion: 1, ...state },
        }
      },
    },
  }
}

test('exposes an immutable, versioned document snapshot', async () => {
  const { createMdbeAsideApi } = await loadBridge()
  const { controller } = createController()
  const api = createMdbeAsideApi(controller)

  assert.equal(Object.isFrozen(api), true)
  assert.equal(api.apiVersion, 1)
  assert.deepEqual(api.getDocument(), {
    apiVersion: 1,
    ready: true,
    fileName: 'notes.md',
    path: 'docs/notes.md',
    markdown: '# Notes\n',
    revision: 4,
    dirty: false,
    saving: false,
    canSave: true,
    status: 'Saved',
  })
})

test('rejects stale Aside edits without touching the document', async () => {
  const { createMdbeAsideApi } = await loadBridge()
  const { controller, calls } = createController()
  const api = createMdbeAsideApi(controller)

  const result = api.replaceMarkdown('# Stale edit\n', {
    expectedRevision: 3,
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'revision-conflict')
  assert.equal(result.document.revision, 4)
  assert.deepEqual(calls.replace, [])
  assert.equal(calls.flush, 0)
})

test('requires a revision for every Aside mutation', async () => {
  const { createMdbeAsideApi } = await loadBridge()
  const { controller, calls } = createController()
  const api = createMdbeAsideApi(controller)

  const replaced = api.replaceMarkdown('# Unsafe overwrite\n')
  const saved = await api.save()

  assert.equal(replaced.ok, false)
  assert.equal(replaced.reason, 'revision-required')
  assert.equal(saved.ok, false)
  assert.equal(saved.reason, 'revision-required')
  assert.deepEqual(calls.replace, [])
  assert.equal(calls.save, 0)
})

test('replaces Markdown and flushes its draft immediately', async () => {
  const { createMdbeAsideApi } = await loadBridge()
  const { controller, calls } = createController()
  const api = createMdbeAsideApi(controller)

  const result = api.replaceMarkdown('# Updated by Aside\n', {
    expectedRevision: 4,
  })

  assert.equal(result.ok, true)
  assert.equal(result.document.markdown, '# Updated by Aside\n')
  assert.equal(result.document.revision, 5)
  assert.equal(result.document.dirty, true)
  assert.deepEqual(calls.replace, ['# Updated by Aside\n'])
  assert.equal(calls.flush, 1)
})

test('reports a recovery-draft failure after preserving the edited document', async () => {
  const { createMdbeAsideApi } = await loadBridge()
  const { controller } = createController()
  controller.flushDraft = () => {
    throw new Error('quota exceeded')
  }
  const api = createMdbeAsideApi(controller)

  const result = api.replaceMarkdown('# Kept in editor\n', {
    expectedRevision: 4,
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'draft-write-failed')
  assert.equal(result.document.markdown, '# Kept in editor\n')
  assert.equal(result.document.dirty, true)
})

test('rejects non-string Markdown and an editor that is not ready', async () => {
  const { createMdbeAsideApi } = await loadBridge()
  const invalid = createController()
  const invalidApi = createMdbeAsideApi(invalid.controller)
  const invalidResult = invalidApi.replaceMarkdown(null)

  assert.equal(invalidResult.ok, false)
  assert.equal(invalidResult.reason, 'invalid-markdown')
  assert.deepEqual(invalid.calls.replace, [])

  const loading = createController({ ready: false })
  const loadingApi = createMdbeAsideApi(loading.controller)
  const loadingResult = loadingApi.replaceMarkdown('# Too early\n')

  assert.equal(loadingResult.ok, false)
  assert.equal(loadingResult.reason, 'editor-not-ready')
  assert.deepEqual(loading.calls.replace, [])
})

test('delegates a current-revision save to the writable document', async () => {
  const { createMdbeAsideApi } = await loadBridge()
  const { controller, calls } = createController({ dirty: true })
  const api = createMdbeAsideApi(controller)

  const result = await api.save({ expectedRevision: 4 })

  assert.equal(result.ok, true)
  assert.equal(result.savedRevision, 4)
  assert.equal(result.document.dirty, false)
  assert.equal(calls.save, 1)
})
