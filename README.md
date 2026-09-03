# mdbe

A local-first Markdown workbench that runs in a browser extension.

> MVP status: usable for local editing, but not yet published to a browser store.

## What it does

- Shows Markdown files from a selected folder in a lazy-loaded worktree
- Provides Typora-style, Markdown-native WYSIWYG editing powered by [Milkdown Crepe](https://milkdown.dev/)
- Opens a worktree file with one click and saves changes back to the same local file
- Opens and saves individual `.md`, `.mdx`, `.mkd`, and `.markdown` files
- Falls back to downloading a copy when direct file access is unavailable
- Recovers an unsaved draft when the same editor tab reloads, with stale drafts pruned after 30 days
- Supports light and dark themes and a collapsible, resizable sidebar
- Keeps the original Markdown URL reader, including its diagram and rendering plugins

File contents are processed locally. mdbe does not add an upload, analytics, or account service.

## Try it locally

Requirements: Node.js 18+ and pnpm 9+.

```bash
pnpm install --frozen-lockfile
pnpm build
```

Open the browser's extension management page, enable developer mode, and load the generated `extension/` directory as an unpacked extension. Click the extension icon and choose **Open mdbe editor**.

The production archive is written to `dist/mdbe-<version>.zip`.

## Keyboard shortcuts

| Action          | Shortcut           |
| --------------- | ------------------ |
| Save            | `Cmd/Ctrl+S`       |
| Save as         | `Cmd/Ctrl+Shift+S` |
| Open file       | `Cmd/Ctrl+O`       |
| Open folder     | `Cmd/Ctrl+Shift+O` |
| New document    | `Cmd/Ctrl+Alt+N`   |
| Toggle worktree | `Cmd/Ctrl+Alt+B`   |

## Current limitations

- Folder worktrees and direct write-back depend on the File System Access API and are currently best supported by Chromium browsers. Other browsers can open a single file and download an edited copy.
- File and folder permissions last for the current tab session. After a reload, a recovered draft must be connected to a destination again with **Save…**, and the folder must be reopened.
- WYSIWYG editing serializes the Markdown document model. It can normalize whitespace or source formatting, and unsupported custom syntax may not round-trip exactly. Keep a backup of irreplaceable files while this is an MVP.
- Raw HTML is represented as inert Markdown content in the editor and is never executed with extension privileges.
- Relative local image paths are not resolved yet because browser file handles do not expose a conventional filesystem base URL.

## Upstream and license

mdbe is forked from [md-reader/md-reader](https://github.com/md-reader/md-reader), originally created by Bener. The upstream 2.x source and mdbe modifications are distributed under the [MIT License](./LICENSE). The original copyright and license notice are preserved.

The WYSIWYG editor uses Milkdown/Crepe under the MIT License. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
