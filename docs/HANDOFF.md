# mdbe handoff

## Goal

Turn the MIT-licensed Markdown Reader 2.x codebase into a local-first Markdown workbench without using or bypassing the proprietary 3.x Pro implementation.

## Current state

Version `0.1.0` is a worktree + WYSIWYG editor MVP:

- Dedicated `editor.html` extension page
- Lazy-loaded Markdown folder tree with nested directories
- Typora-style, Markdown-native editing with Milkdown Crepe
- One-click worktree file opening and write-back
- Individual file picker and download fallback
- Per-tab draft recovery across reloads, with 30-day stale-draft pruning
- Light/dark theme and collapsible, resizable worktree
- Existing Markdown URL reader retained
- mdbe branding and icon

The extension popup opens the editor in a new browser tab.

## Architecture

- `src/editor/index.html`: top toolbar, worktree, and WYSIWYG document shell
- `src/editor/index.ts`: Milkdown lifecycle, tree loading, state, draft persistence, shortcuts, and local file I/O
- `src/editor/style.less`: responsive workbench layout and Crepe theme overrides
- `src/core/markdown.ts` and `src/plugins/`: inherited renderer used by the separate URL-reader content script
- `build/webpack.common.js`: editor bundle, font asset handling, license files, and HTML copy steps

The editor is intentionally separate from the content script. This keeps directory/file picking in a top-level extension page and avoids coupling editor state to the lifecycle that transforms Markdown URLs.

The worktree reads one directory level at a time. A directory is scanned only when the user expands it. `.git` and `node_modules` are omitted; Markdown extensions are shown and other files are hidden.

## WYSIWYG model

Milkdown Crepe supplies a ProseMirror-based Markdown document model. The rendered document is edited directly; Markdown syntax is exposed only where the editing interaction needs it. `getMarkdown()` supplies the string written back to disk, and Milkdown's `replaceAll()` switches the active document.

This is structural round-tripping, not byte-preserving source editing. Whitespace, source layout, and unsupported custom syntax may be normalized. The README calls this out while the project is an MVP.

## Security decisions

- The WYSIWYG model renders raw HTML as an inert HTML node. Manual testing confirmed that `<script>` and event-handler payloads create no executable DOM nodes in the privileged extension page.
- File and folder names are inserted with DOM text APIs, not `innerHTML`.
- Draft keys include a per-tab identifier, avoiding silent overwrites between editor tabs. Stale draft entries are pruned after 30 days.
- File contents remain local. No network upload, analytics, or account backend was added.
- Milkdown AI features are explicitly disabled.
- The existing extension CSP retains `wasm-unsafe-eval` because the inherited URL reader's Graphviz renderer uses WebAssembly.

## File-handle behavior

A selected `FileSystemFileHandle` and `FileSystemDirectoryHandle` remain in memory while the editor tab stays open. After reload, the draft can be restored, but the user must reopen the worktree and choose a save destination again. **Save…** communicates that no writable file handle is connected.

On browsers without the File System Access API, an individual file can still be opened with an `<input type="file">`; saving downloads a copy. Folder worktrees currently require Chromium.

## Build and verification

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm build
node --test tests/*.mjs
```

Expected output:

- Unpacked extension: `extension/`
- Installable archive: `dist/mdbe-0.1.0.zip`

Verified manually in a Chromium page harness:

- Milkdown renders the starter Markdown as an editable document
- A mocked directory handle produces a nested, lazy-loaded worktree
- Clicking a tree file replaces the editor document
- Editing updates dirty status and Markdown serialization
- `Cmd/Ctrl+S`/Save writes the serialized Markdown to the active file handle
- Raw HTML and script/event payloads remain inert
- Theme switching works
- File download fallback and per-tab draft behavior remain available

Automated regression status: TypeScript clean, production build successful, and all inherited Graphviz routing tests passing.

## Recommended next work

1. Persist authorized file and directory handles in IndexedDB with permission revalidation.
2. Add explicit draft/recent-document management so drafts can be recovered after closing a tab, not only reloading it.
3. Add safe relative image resolution from the selected directory handle.
4. Add file creation, rename, delete, and full-text search to the worktree.
5. Add Playwright extension tests and CI release packaging.
6. Reduce Crepe's optional CodeMirror language chunks and KaTeX font assets if archive size becomes important.
7. Prepare browser-store privacy and permission documentation before publication.

## Upstream and license

mdbe is forked from [`md-reader/md-reader`](https://github.com/md-reader/md-reader). Keep the original MIT copyright and permission notice in redistributed copies or substantial portions.

Milkdown/Crepe is MIT-licensed, copyright 2020-present Mirone. Keep `THIRD_PARTY_NOTICES.md` in release archives.
