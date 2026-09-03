import debounce from 'lodash.debounce'
import { Crepe } from '@milkdown/crepe'
import { replaceAll } from '@milkdown/kit/utils'
import {
  installMdbeAsideBridge,
  type MdbeAsideDocument,
  type MdbeAsideSaveOutcome,
} from './aside-bridge'
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_EDITOR_APPEARANCE,
  editorFontStack,
  normalizeEditorAppearance,
  parseEditorAppearance,
  type EditorAppearance,
  type EditorFontId,
} from './appearance'
import {
  UPDATE_AVAILABLE_ACTION,
  UPDATE_READY_STORAGE_KEY,
  isNewerExtensionVersion,
  normalizeExtensionUpdateInfo,
  type ExtensionUpdateInfo,
} from '@/core/extension-update'
import {
  FileChangedOnDiskError,
  assertFileMatchesBaseline,
} from './file-conflict'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import './style.less'

const TAB_ID_KEY = 'mdbe:tab-id'
const navigation = performance.getEntriesByType(
  'navigation',
)[0] as PerformanceNavigationTiming
const existingTabId = sessionStorage.getItem(TAB_ID_KEY)
const tabId =
  navigation?.type === 'reload' && existingTabId ? existingTabId : createTabId()
sessionStorage.setItem(TAB_ID_KEY, tabId)

const DRAFT_PREFIX = 'mdbe:draft:'
const FILE_NAME_PREFIX = 'mdbe:file-name:'
const DRAFT_UPDATED_PREFIX = 'mdbe:draft-updated:'
const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const DRAFT_KEY = `${DRAFT_PREFIX}${tabId}`
const FILE_NAME_KEY = `${FILE_NAME_PREFIX}${tabId}`
const DRAFT_UPDATED_KEY = `${DRAFT_UPDATED_PREFIX}${tabId}`
const THEME_KEY = 'mdbe:theme'
const MARKDOWN_EXTENSIONS = ['.md', '.mdx', '.mkd', '.markdown']
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules'])
const STARTER_DOCUMENT = `# Welcome to mdbe

A local-first, Typora-style Markdown editor for your browser.

## Start here

1. Choose **Open folder** to show a Markdown worktree.
2. Select a file from the left sidebar.
3. Edit the rendered document directly.
4. Press \`⌘S\` or \`Ctrl+S\` to save.

> Files stay on your device. mdbe does not upload their contents.
`

type WritableFileHandle = {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{
    write(data: string): Promise<void>
    close(): Promise<void>
  }>
}

type DirectoryHandle = {
  kind: 'directory'
  name: string
  values(): AsyncIterableIterator<DirectoryHandle | WritableFileHandle>
}

type TreeNode =
  | {
      kind: 'file'
      name: string
      path: string
      handle: WritableFileHandle
    }
  | {
      kind: 'directory'
      name: string
      path: string
      handle: DirectoryHandle
      expanded: boolean
      loading: boolean
      children: TreeNode[] | null
    }

type PickerWindow = Window &
  typeof globalThis & {
    showDirectoryPicker?: (options?: object) => Promise<DirectoryHandle>
    showOpenFilePicker?: (options?: object) => Promise<WritableFileHandle[]>
    showSaveFilePicker?: (options?: object) => Promise<WritableFileHandle>
  }

const editorHost = requiredElement<HTMLElement>('milkdown-editor')
const fileName = requiredElement<HTMLElement>('file-name')
const currentPathElement = requiredElement<HTMLElement>('current-path')
const saveStatus = requiredElement<HTMLElement>('save-status')
const workspaceName = requiredElement<HTMLElement>('workspace-name')
const worktreeEmpty = requiredElement<HTMLElement>('worktree-empty')
const fileTree = requiredElement<HTMLElement>('file-tree')
const fallbackFileInput = requiredElement<HTMLInputElement>(
  'fallback-file-input',
)
const toggleWorktreeButton =
  requiredElement<HTMLButtonElement>('toggle-worktree')
const openWorkspaceButton = requiredElement<HTMLButtonElement>('open-workspace')
const openWorkspaceEmptyButton = requiredElement<HTMLButtonElement>(
  'open-workspace-empty',
)
const refreshWorkspaceButton =
  requiredElement<HTMLButtonElement>('refresh-workspace')
const newButton = requiredElement<HTMLButtonElement>('new-document')
const openButton = requiredElement<HTMLButtonElement>('open-document')
const saveButton = requiredElement<HTMLButtonElement>('save-document')
const saveAsButton = requiredElement<HTMLButtonElement>('save-as-document')
const updateBanner = requiredElement<HTMLElement>('update-banner')
const updateTitle = requiredElement<HTMLElement>('update-title')
const updateMessage = requiredElement<HTMLElement>('update-message')
const dismissUpdateButton = requiredElement<HTMLButtonElement>('dismiss-update')
const applyUpdateButton = requiredElement<HTMLButtonElement>('apply-update')
const appearanceButton = requiredElement<HTMLButtonElement>('toggle-appearance')
const appearancePanel = requiredElement<HTMLElement>('appearance-panel')
const closeAppearanceButton =
  requiredElement<HTMLButtonElement>('close-appearance')
const fontFamilySelect =
  requiredElement<HTMLSelectElement>('editor-font-family')
const fontSizeInput = requiredElement<HTMLInputElement>('editor-font-size')
const fontSizeValue = requiredElement<HTMLOutputElement>(
  'editor-font-size-value',
)
const lineHeightInput = requiredElement<HTMLInputElement>('editor-line-height')
const lineHeightValue = requiredElement<HTMLOutputElement>(
  'editor-line-height-value',
)
const resetAppearanceButton =
  requiredElement<HTMLButtonElement>('reset-appearance')
const themeButton = requiredElement<HTMLButtonElement>('toggle-theme')

let crepe: Crepe | null = null
let applyingContent = false
let currentMarkdown = ''
let lastSavedContent: string | null = null
let currentFileHandle: WritableFileHandle | null = null
let currentDiskBaseline: {
  handle: WritableFileHandle
  content: string
} | null = null
let currentFileName = 'untitled.md'
let currentPath = 'untitled.md'
let rootDirectoryHandle: DirectoryHandle | null = null
let rootNodes: TreeNode[] = []
let dirty = false
let saving = false
let documentRevision = 0
let pendingUpdate: ExtensionUpdateInfo | null = null

pruneExpiredDrafts()
const storedDraft = localStorage.getItem(DRAFT_KEY)
const hasStoredDraft = storedDraft !== null
if (hasStoredDraft) {
  currentFileName = localStorage.getItem(FILE_NAME_KEY) || 'untitled.md'
  currentPath = currentFileName
}
const initialMarkdown = storedDraft ?? STARTER_DOCUMENT
const storedTheme = localStorage.getItem(THEME_KEY)
const initialTheme =
  storedTheme === 'light' || storedTheme === 'dark'
    ? storedTheme
    : window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
let editorAppearance = parseEditorAppearance(
  localStorage.getItem(APPEARANCE_STORAGE_KEY),
)

const persistDraft = debounce(() => {
  localStorage.setItem(DRAFT_KEY, currentMarkdown)
  localStorage.setItem(FILE_NAME_KEY, currentFileName)
  localStorage.setItem(DRAFT_UPDATED_KEY, String(Date.now()))
}, 120)

applyTheme(initialTheme)
applyEditorAppearance(editorAppearance)
syncAppearanceControls()
bindEvents()
initializeUpdateHandling()
installMdbeAsideBridge(window, {
  getDocument: getAsideDocument,
  replaceMarkdown: replaceMarkdownFromAside,
  flushDraft: flushDraftForAside,
  save: saveCurrentFileForAside,
})
void createEditor(initialMarkdown, hasStoredDraft)

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing required element: #${id}`)
  return element as T
}

async function createEditor(markdown: string, restoredDraft: boolean) {
  setControlsDisabled(true)

  const editor = new Crepe({
    root: editorHost,
    defaultValue: markdown,
    features: {
      [Crepe.Feature.AI]: false,
      [Crepe.Feature.TopBar]: false,
    },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: {
        text: 'Start writing…',
        mode: 'block',
      },
    },
  })

  editor.on(listener => {
    listener.markdownUpdated((_ctx, nextMarkdown) => {
      if (applyingContent || nextMarkdown === currentMarkdown) return
      currentMarkdown = nextMarkdown
      documentRevision += 1
      handleDocumentChange()
    })
  })

  try {
    await editor.create()
    crepe = editor
    currentMarkdown = editor.getMarkdown()
    documentRevision += 1
    lastSavedContent = restoredDraft ? null : currentMarkdown
    updateDocumentState(
      restoredDraft ? 'Draft restored · choose a file to save' : 'Ready',
    )
    updateSaveButton()
  } catch (error) {
    console.error(error)
    updateDocumentState('Could not start the editor')
  } finally {
    setControlsDisabled(false)
  }
}

function bindEvents() {
  toggleWorktreeButton.addEventListener('click', () => {
    document.body.classList.toggle('worktree-hidden')
  })
  openWorkspaceButton.addEventListener('click', openWorkspace)
  openWorkspaceEmptyButton.addEventListener('click', openWorkspace)
  refreshWorkspaceButton.addEventListener('click', refreshWorkspace)
  newButton.addEventListener('click', newDocument)
  openButton.addEventListener('click', openDocument)
  saveButton.addEventListener('click', () => saveDocument())
  saveAsButton.addEventListener('click', () => saveDocument(true))
  dismissUpdateButton.addEventListener('click', dismissPendingUpdate)
  applyUpdateButton.addEventListener('click', applyPendingUpdate)
  appearanceButton.addEventListener('click', toggleAppearancePanel)
  closeAppearanceButton.addEventListener('click', closeAppearancePanel)
  fontFamilySelect.addEventListener('change', () => {
    updateEditorAppearance({
      fontFamily: fontFamilySelect.value as EditorFontId,
    })
  })
  fontSizeInput.addEventListener('input', () => {
    updateEditorAppearance({ fontSize: Number(fontSizeInput.value) })
  })
  lineHeightInput.addEventListener('input', () => {
    updateEditorAppearance({ lineHeight: Number(lineHeightInput.value) })
  })
  resetAppearanceButton.addEventListener('click', resetEditorAppearance)
  themeButton.addEventListener('click', toggleTheme)
  fallbackFileInput.addEventListener('change', openFallbackFile)
  document.addEventListener('click', handleDocumentClick)
  window.addEventListener('storage', handleStorageChange)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('beforeunload', warnAboutUnsavedChanges)
}

function handleDocumentChange() {
  dirty = lastSavedContent === null || currentMarkdown !== lastSavedContent
  if (dirty) {
    persistDraft()
  } else {
    persistDraft.cancel()
    clearCurrentDraft()
  }
  updateDocumentState()
}

function replaceEditorContent(
  markdown: string,
  name: string,
  path: string,
  handle: WritableFileHandle | null,
  saved = true,
) {
  if (!crepe) return

  persistDraft.cancel()
  applyingContent = true
  try {
    crepe.editor.action(replaceAll(markdown, true))
    currentMarkdown = crepe.getMarkdown()
    documentRevision += 1
  } finally {
    applyingContent = false
  }

  currentFileName = name || 'untitled.md'
  currentPath = path || currentFileName
  currentFileHandle = handle
  currentDiskBaseline = handle && saved ? { handle, content: markdown } : null
  lastSavedContent = saved ? currentMarkdown : null
  clearCurrentDraft()
  updateDocumentState(saved ? 'Opened' : 'New document')
  updateSaveButton()
  renderTree()

  const editor = editorHost.querySelector<HTMLElement>('.ProseMirror')
  editor?.focus()
}

function newDocument() {
  if (saving || !confirmDiscard() || !crepe) return
  replaceEditorContent('', 'untitled.md', 'untitled.md', null, false)
}

async function openWorkspace() {
  const pickerWindow = window as PickerWindow
  if (!pickerWindow.showDirectoryPicker) {
    updateDocumentState('Folder worktrees require a Chromium browser')
    return
  }

  try {
    const handle = await pickerWindow.showDirectoryPicker({ mode: 'readwrite' })
    rootDirectoryHandle = handle
    workspaceName.textContent = handle.name
    refreshWorkspaceButton.disabled = false
    await refreshWorkspace()
  } catch (error) {
    handlePickerError(error, 'Could not open the folder')
  }
}

async function refreshWorkspace() {
  if (!rootDirectoryHandle) return

  refreshWorkspaceButton.disabled = true
  workspaceName.textContent = `${rootDirectoryHandle.name} · loading…`
  try {
    rootNodes = await readDirectory(rootDirectoryHandle, '')
    workspaceName.textContent = rootDirectoryHandle.name
    worktreeEmpty.hidden = true
    fileTree.hidden = false
    renderTree()
    updateDocumentState('Worktree refreshed')
  } catch (error) {
    console.error(error)
    workspaceName.textContent = rootDirectoryHandle.name
    updateDocumentState('Could not read the folder')
  } finally {
    refreshWorkspaceButton.disabled = false
  }
}

async function readDirectory(handle: DirectoryHandle, parentPath: string) {
  const nodes: TreeNode[] = []

  for await (const entry of handle.values()) {
    if (entry.kind === 'directory') {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue
      nodes.push({
        kind: 'directory',
        name: entry.name,
        path: joinPath(parentPath, entry.name),
        handle: entry,
        expanded: false,
        loading: false,
        children: null,
      })
    } else if (isMarkdownFile(entry.name)) {
      nodes.push({
        kind: 'file',
        name: entry.name,
        path: joinPath(parentPath, entry.name),
        handle: entry,
      })
    }
  }

  return nodes.sort(compareTreeNodes)
}

function compareTreeNodes(a: TreeNode, b: TreeNode) {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function renderTree() {
  fileTree.replaceChildren()
  appendTreeNodes(fileTree, rootNodes, 0)
}

function appendTreeNodes(
  parent: HTMLElement,
  nodes: TreeNode[],
  depth: number,
) {
  nodes.forEach(node => {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = `mdbe__tree-row ${node.kind}`
    row.style.setProperty('--tree-depth', String(depth))
    row.setAttribute('role', 'treeitem')
    row.setAttribute('aria-level', String(depth + 1))

    if (node.kind === 'directory') {
      row.setAttribute('aria-expanded', String(node.expanded))
      const chevron = document.createElement('span')
      chevron.className = 'mdbe__chevron'
      chevron.textContent = node.loading ? '·' : node.expanded ? '⌄' : '›'
      row.append(chevron, createTreeIcon('directory'), node.name)
      row.addEventListener('click', () => toggleDirectory(node))
    } else {
      row.classList.toggle(
        'active',
        node.path === currentPath && node.handle === currentFileHandle,
      )
      row.append(createTreeIcon('file'), node.name)
      row.addEventListener('click', () => openTreeFile(node))
    }

    parent.appendChild(row)

    if (node.kind === 'directory' && node.expanded && node.children) {
      appendTreeNodes(parent, node.children, depth + 1)
    }
  })
}

function createTreeIcon(kind: 'directory' | 'file') {
  const icon = document.createElement('span')
  icon.className = `mdbe__tree-icon ${kind}`
  icon.setAttribute('aria-hidden', 'true')
  return icon
}

async function toggleDirectory(node: Extract<TreeNode, { kind: 'directory' }>) {
  if (node.loading) return

  if (!node.children) {
    node.loading = true
    renderTree()
    try {
      node.children = await readDirectory(node.handle, node.path)
    } catch (error) {
      console.error(error)
      updateDocumentState(`Could not read ${node.name}`)
      node.children = []
    } finally {
      node.loading = false
    }
  }

  node.expanded = !node.expanded
  renderTree()
}

async function openTreeFile(node: Extract<TreeNode, { kind: 'file' }>) {
  if (saving || !confirmDiscard()) return

  try {
    const file = await node.handle.getFile()
    const markdown = await file.text()
    replaceEditorContent(markdown, file.name, node.path, node.handle)
  } catch (error) {
    console.error(error)
    updateDocumentState(`Could not open ${node.name}`)
  }
}

async function openDocument() {
  if (saving || !confirmDiscard()) return

  const pickerWindow = window as PickerWindow
  if (!pickerWindow.showOpenFilePicker) {
    fallbackFileInput.value = ''
    fallbackFileInput.click()
    return
  }

  try {
    const handles = await pickerWindow.showOpenFilePicker({
      multiple: false,
      types: [markdownFileType()],
    })
    const handle = handles[0]
    if (!handle) return

    const file = await handle.getFile()
    replaceEditorContent(await file.text(), file.name, file.name, handle)
  } catch (error) {
    handlePickerError(error, 'Could not open the file')
  }
}

async function openFallbackFile() {
  const file = fallbackFileInput.files?.[0]
  if (!file || saving) return
  replaceEditorContent(await file.text(), file.name, file.name, null)
}

async function saveDocument(forceSaveAs = false) {
  if (!crepe || saving) return

  saving = true
  setDocumentActionsDisabled(true)
  updateDocumentState('Saving…')

  const pickerWindow = window as PickerWindow
  let targetFileHandle = forceSaveAs ? null : currentFileHandle

  try {
    if (!targetFileHandle && pickerWindow.showSaveFilePicker) {
      const options: Record<string, unknown> = {
        suggestedName: ensureMarkdownExtension(currentFileName),
        types: [markdownFileType()],
      }
      if (rootDirectoryHandle) options.startIn = rootDirectoryHandle
      targetFileHandle = await pickerWindow.showSaveFilePicker(options)
    }

    if (targetFileHandle) {
      const savingExistingFile =
        !forceSaveAs && targetFileHandle === currentFileHandle
      await writeToFileHandle(targetFileHandle, savingExistingFile)
      return
    }

    downloadDocument()
  } catch (error) {
    if (isAbortError(error)) {
      updateDocumentState()
      return
    }
    if (error instanceof FileChangedOnDiskError) {
      persistDraft.flush()
      updateDocumentState('File changed on disk · reopen it or use Save as')
      return
    }
    console.error(error)
    downloadDocument('Source save failed · downloaded a recovery copy', false)
  } finally {
    saving = false
    setDocumentActionsDisabled(false)
    syncUpdateBanner()
  }
}

async function writeToFileHandle(
  targetFileHandle: WritableFileHandle,
  preservePath: boolean,
) {
  const markdownToSave = syncCurrentMarkdown()
  const savedRevision = documentRevision

  await withExclusiveSaveLock(targetFileHandle, preservePath, async () => {
    if (preservePath) {
      if (
        !currentDiskBaseline ||
        currentDiskBaseline.handle !== targetFileHandle
      ) {
        throw new FileChangedOnDiskError()
      }
      await assertFileMatchesBaseline(
        targetFileHandle,
        currentDiskBaseline.content,
      )
    }

    const writable = await targetFileHandle.createWritable()
    await writable.write(markdownToSave)
    await writable.close()
  })

  currentFileHandle = targetFileHandle
  currentDiskBaseline = { handle: targetFileHandle, content: markdownToSave }
  currentFileName = targetFileHandle.name
  if (!preservePath) currentPath = currentFileName
  markContentSaved(markdownToSave, 'Saved locally')
  updateSaveButton()
  renderTree()
  return savedRevision
}

async function withExclusiveSaveLock<T>(
  targetFileHandle: WritableFileHandle,
  preservePath: boolean,
  save: () => Promise<T>,
) {
  const lockManager = (
    navigator as Navigator & {
      locks?: {
        request<Result>(
          name: string,
          callback: () => Promise<Result>,
        ): Promise<Result>
      }
    }
  ).locks
  if (!lockManager) return save()

  const workspace = rootDirectoryHandle?.name || 'single-file'
  const targetPath = preservePath ? currentPath : targetFileHandle.name
  const lockName = `mdbe:save:${workspace}:${targetPath}`
  return lockManager.request(lockName, save)
}

async function saveCurrentFileForAside(): Promise<MdbeAsideSaveOutcome> {
  if (!crepe) {
    return { ok: false, reason: 'editor-not-ready' }
  }

  if (saving) {
    return { ok: false, reason: 'save-in-progress' }
  }

  if (!currentFileHandle) {
    flushDraftForAside()
    return {
      ok: false,
      reason: 'no-file-handle',
      message: 'Open the file or folder in mdbe before asking Aside to save.',
    }
  }

  saving = true
  setDocumentActionsDisabled(true)
  updateDocumentState('Saving changes from Aside…')

  let result: MdbeAsideSaveOutcome
  try {
    const savedRevision = await writeToFileHandle(currentFileHandle, true)
    result = { ok: true, savedRevision }
  } catch (error) {
    console.error(error)
    flushDraftForAside()
    if (error instanceof FileChangedOnDiskError) {
      updateDocumentState('File changed on disk · Aside did not overwrite it')
      result = {
        ok: false,
        reason: 'file-changed-on-disk',
        message:
          'Reopen the file and merge the external changes before saving.',
      }
    } else {
      updateDocumentState('Aside could not save the local file')
      result = {
        ok: false,
        reason: 'write-failed',
        message: 'The writable file handle rejected the save.',
      }
    }
  } finally {
    saving = false
    setDocumentActionsDisabled(false)
    syncUpdateBanner()
  }

  return result
}

function downloadDocument(message = 'Downloaded', markAsSaved = true) {
  const markdownToSave = syncCurrentMarkdown()
  const blob = new Blob([markdownToSave], {
    type: 'text/markdown;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = ensureMarkdownExtension(currentFileName)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  if (markAsSaved) {
    markContentSaved(markdownToSave, message)
  } else {
    persistDraft.flush()
    updateDocumentState(message)
  }
}

function markContentSaved(savedMarkdown: string, message: string) {
  lastSavedContent = savedMarkdown
  dirty = currentMarkdown !== lastSavedContent
  if (dirty) {
    persistDraft()
  } else {
    persistDraft.cancel()
    clearCurrentDraft()
  }
  updateDocumentState(dirty ? `${message} · newer changes unsaved` : message)
}

function updateDocumentState(message?: string) {
  dirty = lastSavedContent === null || currentMarkdown !== lastSavedContent
  saveStatus.textContent = message || (dirty ? 'Unsaved changes' : 'Saved')
  saveStatus.classList.toggle('dirty', dirty)
  fileName.textContent = currentFileName
  currentPathElement.textContent = currentPath
  document.title = `${dirty ? '• ' : ''}${currentFileName} · mdbe`
  syncUpdateBanner()
  window.dispatchEvent(
    new CustomEvent('mdbe:state-change', {
      detail: { revision: documentRevision, dirty, saving },
    }),
  )
}

function updateSaveButton() {
  saveButton.textContent = currentFileHandle ? 'Save' : 'Save…'
  saveButton.title = currentFileHandle
    ? `Save changes to ${currentFileName}`
    : 'Choose a local Markdown file to save'
}

function setControlsDisabled(disabled: boolean) {
  openWorkspaceButton.disabled = disabled
  openWorkspaceEmptyButton.disabled = disabled
  setDocumentActionsDisabled(disabled)
}

function setDocumentActionsDisabled(disabled: boolean) {
  newButton.disabled = disabled
  openButton.disabled = disabled
  saveButton.disabled = disabled
  saveAsButton.disabled = disabled
}

function markdownFileType() {
  return {
    description: 'Markdown documents',
    accept: {
      'text/markdown': MARKDOWN_EXTENSIONS,
    },
  }
}

function isMarkdownFile(name: string) {
  const lowerName = name.toLowerCase()
  return MARKDOWN_EXTENSIONS.some(extension => lowerName.endsWith(extension))
}

function ensureMarkdownExtension(name: string) {
  return isMarkdownFile(name) ? name : `${name}.md`
}

function joinPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name
}

function syncCurrentMarkdown() {
  if (!crepe || applyingContent) return currentMarkdown

  const latestMarkdown = crepe.getMarkdown()
  if (latestMarkdown !== currentMarkdown) {
    currentMarkdown = latestMarkdown
    documentRevision += 1
    handleDocumentChange()
  }
  return currentMarkdown
}

function getAsideDocument(): Omit<MdbeAsideDocument, 'apiVersion'> {
  return {
    ready: crepe !== null,
    fileName: currentFileName,
    path: currentPath,
    markdown: syncCurrentMarkdown(),
    revision: documentRevision,
    dirty,
    saving,
    canSave: crepe !== null && currentFileHandle !== null && !saving,
    status: saveStatus.textContent || '',
  }
}

function replaceMarkdownFromAside(markdown: string) {
  if (!crepe) return

  persistDraft.cancel()
  applyingContent = true
  try {
    crepe.editor.action(replaceAll(markdown, true))
    currentMarkdown = crepe.getMarkdown()
    documentRevision += 1
  } finally {
    applyingContent = false
  }
  handleDocumentChange()
}

function flushDraftForAside() {
  syncCurrentMarkdown()
  if (dirty) persistDraft.flush()
}

function confirmDiscard() {
  syncCurrentMarkdown()
  return !dirty || window.confirm('Discard your unsaved changes?')
}

function handlePickerError(error: unknown, message: string) {
  if (isAbortError(error)) return
  console.error(error)
  updateDocumentState(message)
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function hasExtensionRuntime() {
  return (
    typeof chrome !== 'undefined' &&
    Boolean(chrome.runtime?.id) &&
    Boolean(chrome.storage?.local)
  )
}

function initializeUpdateHandling() {
  if (!hasExtensionRuntime()) return

  chrome.runtime.onUpdateAvailable.addListener(({ version }) => {
    const update = { version, detectedAt: Date.now() }
    chrome.storage.local.set({ [UPDATE_READY_STORAGE_KEY]: update }, () => {
      void chrome.runtime.lastError
    })
    showPendingUpdate(update)
  })

  chrome.runtime.onMessage.addListener(message => {
    if (message?.action !== UPDATE_AVAILABLE_ACTION) return false
    showPendingUpdate(message.data)
    return false
  })

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return
    const changedUpdate = changes[UPDATE_READY_STORAGE_KEY]
    if (!changedUpdate) return
    if (changedUpdate.newValue === undefined) {
      pendingUpdate = null
      syncUpdateBanner()
      return
    }
    showPendingUpdate(changedUpdate.newValue)
  })

  chrome.storage.local.get(UPDATE_READY_STORAGE_KEY, items => {
    if (chrome.runtime.lastError) return
    showPendingUpdate(items[UPDATE_READY_STORAGE_KEY])
  })
}

function showPendingUpdate(value: unknown) {
  const update = normalizeExtensionUpdateInfo(value)
  if (!update || !hasExtensionRuntime()) return

  const currentVersion = chrome.runtime.getManifest().version
  if (!isNewerExtensionVersion(update.version, currentVersion)) {
    pendingUpdate = null
    syncUpdateBanner()
    chrome.storage.local.remove(UPDATE_READY_STORAGE_KEY)
    return
  }

  pendingUpdate = update
  if (dirty) flushDraftForAside()
  syncUpdateBanner()
}

function updateDismissedKey(version: string) {
  return `mdbe:update-dismissed:${version}`
}

function syncUpdateBanner() {
  if (
    !pendingUpdate ||
    sessionStorage.getItem(updateDismissedKey(pendingUpdate.version)) === '1'
  ) {
    updateBanner.hidden = true
    return
  }

  updateBanner.hidden = false
  updateTitle.textContent = `mdbe ${pendingUpdate.version} is ready`
  updateMessage.textContent = dirty
    ? 'Save your changes before restarting to update.'
    : 'Restart mdbe to finish the update.'
  applyUpdateButton.disabled = dirty || saving
  applyUpdateButton.textContent = dirty
    ? 'Save changes first'
    : 'Restart to update'
}

function dismissPendingUpdate() {
  if (pendingUpdate) {
    sessionStorage.setItem(updateDismissedKey(pendingUpdate.version), '1')
  }
  updateBanner.hidden = true
}

function applyPendingUpdate() {
  if (!pendingUpdate || !hasExtensionRuntime() || saving) return

  syncCurrentMarkdown()
  flushDraftForAside()
  if (dirty) {
    syncUpdateBanner()
    saveButton.focus()
    return
  }

  applyUpdateButton.disabled = true
  applyUpdateButton.textContent = 'Restarting…'
  chrome.runtime.reload()
}

function applyEditorAppearance(appearance: EditorAppearance) {
  const root = document.documentElement
  root.dataset.mdbeEditorFont = appearance.fontFamily
  root.style.setProperty(
    '--mdbe-editor-font-family',
    editorFontStack(appearance.fontFamily),
  )
  root.style.setProperty('--mdbe-editor-font-size', `${appearance.fontSize}px`)
  root.style.setProperty(
    '--mdbe-editor-line-height',
    String(appearance.lineHeight),
  )
}

function updateEditorAppearance(update: Partial<EditorAppearance>) {
  editorAppearance = normalizeEditorAppearance({
    ...editorAppearance,
    ...update,
  })
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(editorAppearance))
  applyEditorAppearance(editorAppearance)
  syncAppearanceControls()
}

function resetEditorAppearance() {
  updateEditorAppearance({ ...DEFAULT_EDITOR_APPEARANCE })
}

function syncAppearanceControls() {
  fontFamilySelect.value = editorAppearance.fontFamily
  fontSizeInput.value = String(editorAppearance.fontSize)
  fontSizeValue.value = `${editorAppearance.fontSize} px`
  lineHeightInput.value = String(editorAppearance.lineHeight)
  lineHeightValue.value = editorAppearance.lineHeight.toFixed(2)
}

function toggleAppearancePanel() {
  if (appearancePanel.hidden) {
    appearancePanel.hidden = false
    appearanceButton.setAttribute('aria-expanded', 'true')
    fontFamilySelect.focus()
  } else {
    closeAppearancePanel()
  }
}

function closeAppearancePanel() {
  appearancePanel.hidden = true
  appearanceButton.setAttribute('aria-expanded', 'false')
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target
  if (
    appearancePanel.hidden ||
    !(target instanceof Node) ||
    appearancePanel.contains(target) ||
    appearanceButton.contains(target)
  ) {
    return
  }
  closeAppearancePanel()
}

function handleStorageChange(event: StorageEvent) {
  if (event.key !== APPEARANCE_STORAGE_KEY) return
  editorAppearance = parseEditorAppearance(event.newValue)
  applyEditorAppearance(editorAppearance)
  syncAppearanceControls()
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.mdbeTheme = theme
  localStorage.setItem(THEME_KEY, theme)
  themeButton.textContent = theme === 'dark' ? 'Light' : 'Dark'
  themeButton.title = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`
}

function toggleTheme() {
  applyTheme(
    document.documentElement.dataset.mdbeTheme === 'dark' ? 'light' : 'dark',
  )
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !appearancePanel.hidden) {
    closeAppearancePanel()
    appearanceButton.focus()
    return
  }

  if (!(event.metaKey || event.ctrlKey)) return

  const key = event.key.toLowerCase()
  if (key === 's') {
    event.preventDefault()
    void saveDocument(event.shiftKey)
  } else if (key === 'o' && event.shiftKey) {
    event.preventDefault()
    void openWorkspace()
  } else if (key === 'o') {
    event.preventDefault()
    void openDocument()
  } else if (key === 'n' && event.altKey) {
    event.preventDefault()
    newDocument()
  } else if (key === 'b' && event.altKey) {
    event.preventDefault()
    document.body.classList.toggle('worktree-hidden')
  }
}

function warnAboutUnsavedChanges(event: BeforeUnloadEvent) {
  syncCurrentMarkdown()
  if (!dirty) return
  persistDraft.flush()
  event.preventDefault()
  event.returnValue = ''
}

function clearCurrentDraft() {
  localStorage.removeItem(DRAFT_KEY)
  localStorage.removeItem(FILE_NAME_KEY)
  localStorage.removeItem(DRAFT_UPDATED_KEY)
}

function pruneExpiredDrafts() {
  const cutoff = Date.now() - DRAFT_RETENTION_MS
  Object.keys(localStorage).forEach(key => {
    if (!key.startsWith(DRAFT_UPDATED_PREFIX)) return

    const updatedAt = Number(localStorage.getItem(key))
    if (Number.isFinite(updatedAt) && updatedAt >= cutoff) return

    const expiredTabId = key.slice(DRAFT_UPDATED_PREFIX.length)
    localStorage.removeItem(`${DRAFT_PREFIX}${expiredTabId}`)
    localStorage.removeItem(`${FILE_NAME_PREFIX}${expiredTabId}`)
    localStorage.removeItem(key)
  })
}

function createTabId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
