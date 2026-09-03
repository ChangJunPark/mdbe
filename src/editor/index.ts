import debounce from 'lodash.debounce'
import { Crepe } from '@milkdown/crepe'
import { replaceAll } from '@milkdown/kit/utils'
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
const themeButton = requiredElement<HTMLButtonElement>('toggle-theme')

let crepe: Crepe | null = null
let applyingContent = false
let currentMarkdown = ''
let lastSavedContent: string | null = null
let currentFileHandle: WritableFileHandle | null = null
let currentFileName = 'untitled.md'
let currentPath = 'untitled.md'
let rootDirectoryHandle: DirectoryHandle | null = null
let rootNodes: TreeNode[] = []
let dirty = false
let saving = false

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

const persistDraft = debounce(() => {
  localStorage.setItem(DRAFT_KEY, currentMarkdown)
  localStorage.setItem(FILE_NAME_KEY, currentFileName)
  localStorage.setItem(DRAFT_UPDATED_KEY, String(Date.now()))
}, 120)

applyTheme(initialTheme)
bindEvents()
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
      if (applyingContent) return
      currentMarkdown = nextMarkdown
      handleDocumentChange()
    })
  })

  try {
    await editor.create()
    crepe = editor
    currentMarkdown = editor.getMarkdown()
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
  themeButton.addEventListener('click', toggleTheme)
  fallbackFileInput.addEventListener('change', openFallbackFile)
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
  crepe.editor.action(replaceAll(markdown, true))
  currentMarkdown = crepe.getMarkdown()
  applyingContent = false

  currentFileName = name || 'untitled.md'
  currentPath = path || currentFileName
  currentFileHandle = handle
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
      const markdownToSave = syncCurrentMarkdown()
      const writable = await targetFileHandle.createWritable()
      await writable.write(markdownToSave)
      await writable.close()
      currentFileHandle = targetFileHandle
      currentFileName = targetFileHandle.name
      if (!savingExistingFile) currentPath = currentFileName
      markContentSaved(markdownToSave, 'Saved locally')
      updateSaveButton()
      renderTree()
      return
    }

    downloadDocument()
  } catch (error) {
    if (isAbortError(error)) {
      updateDocumentState()
      return
    }
    console.error(error)
    downloadDocument('File access unavailable · downloaded a copy')
  } finally {
    saving = false
    setDocumentActionsDisabled(false)
  }
}

function downloadDocument(message = 'Downloaded') {
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
  markContentSaved(markdownToSave, message)
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
    handleDocumentChange()
  }
  return currentMarkdown
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
