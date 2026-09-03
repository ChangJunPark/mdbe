export const MDBE_ASIDE_API_VERSION = 1 as const

export type MdbeAsideDocument = {
  apiVersion: typeof MDBE_ASIDE_API_VERSION
  ready: boolean
  fileName: string
  path: string
  markdown: string
  revision: number
  dirty: boolean
  saving: boolean
  canSave: boolean
  status: string
}

export type MdbeAsideFailureReason =
  | 'editor-not-ready'
  | 'invalid-markdown'
  | 'revision-required'
  | 'revision-conflict'
  | 'replace-failed'
  | 'draft-write-failed'
  | 'save-in-progress'
  | 'no-file-handle'
  | 'file-changed-on-disk'
  | 'write-failed'

export type MdbeAsideFailure = {
  ok: false
  reason: MdbeAsideFailureReason
  document: MdbeAsideDocument
  message?: string
}

export type MdbeAsideMutationResult =
  | {
      ok: true
      document: MdbeAsideDocument
    }
  | MdbeAsideFailure

export type MdbeAsideSaveOutcome =
  | {
      ok: true
      savedRevision: number
    }
  | {
      ok: false
      reason: MdbeAsideFailureReason
      message?: string
    }

export type MdbeAsideSaveResult =
  | {
      ok: true
      savedRevision: number
      document: MdbeAsideDocument
    }
  | MdbeAsideFailure

export type MdbeAsideOptions = {
  expectedRevision: number
}

export type MdbeAsideApi = {
  readonly apiVersion: typeof MDBE_ASIDE_API_VERSION
  getDocument(): MdbeAsideDocument
  replaceMarkdown(
    markdown: string,
    options: MdbeAsideOptions,
  ): MdbeAsideMutationResult
  flushDraft(): MdbeAsideDocument
  save(options: MdbeAsideOptions): Promise<MdbeAsideSaveResult>
}

export type MdbeAsideController = {
  getDocument(): Omit<MdbeAsideDocument, 'apiVersion'>
  replaceMarkdown(markdown: string): void
  flushDraft(): void
  save(): Promise<MdbeAsideSaveOutcome>
}

type BridgeTarget = Window &
  typeof globalThis & {
    mdbe?: MdbeAsideApi
  }

function snapshot(controller: MdbeAsideController): MdbeAsideDocument {
  return {
    apiVersion: MDBE_ASIDE_API_VERSION,
    ...controller.getDocument(),
  }
}

function preflight(
  controller: MdbeAsideController,
  options?: MdbeAsideOptions,
): MdbeAsideFailure | null {
  const document = snapshot(controller)

  if (!document.ready) {
    return { ok: false, reason: 'editor-not-ready', document }
  }

  if (!Number.isInteger(options?.expectedRevision)) {
    return { ok: false, reason: 'revision-required', document }
  }

  if (options?.expectedRevision !== document.revision) {
    return { ok: false, reason: 'revision-conflict', document }
  }

  return null
}

export function createMdbeAsideApi(
  controller: MdbeAsideController,
): MdbeAsideApi {
  const api: MdbeAsideApi = {
    apiVersion: MDBE_ASIDE_API_VERSION,
    getDocument: () => snapshot(controller),
    replaceMarkdown: (
      markdown: string,
      options: MdbeAsideOptions,
    ): MdbeAsideMutationResult => {
      if (typeof markdown !== 'string') {
        return {
          ok: false,
          reason: 'invalid-markdown',
          document: snapshot(controller),
        }
      }

      const blocked = preflight(controller, options)
      if (blocked) return blocked

      try {
        controller.replaceMarkdown(markdown)
      } catch {
        return {
          ok: false,
          reason: 'replace-failed',
          document: snapshot(controller),
        }
      }

      try {
        controller.flushDraft()
      } catch {
        return {
          ok: false,
          reason: 'draft-write-failed',
          document: snapshot(controller),
          message: 'The recovery draft could not be persisted.',
        }
      }

      return { ok: true, document: snapshot(controller) }
    },
    flushDraft: () => {
      controller.flushDraft()
      return snapshot(controller)
    },
    save: async (options: MdbeAsideOptions): Promise<MdbeAsideSaveResult> => {
      const blocked = preflight(controller, options)
      if (blocked) return blocked

      const result = await controller.save()
      return { ...result, document: snapshot(controller) }
    },
  }

  return Object.freeze(api)
}

export function installMdbeAsideBridge(
  target: BridgeTarget,
  controller: MdbeAsideController,
) {
  const api = createMdbeAsideApi(controller)

  Object.defineProperty(target, 'mdbe', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: api,
  })

  document.documentElement.dataset.mdbeAsideApi = String(api.apiVersion)
  target.dispatchEvent(
    new CustomEvent('mdbe:aside-ready', {
      detail: { apiVersion: api.apiVersion },
    }),
  )

  return api
}
