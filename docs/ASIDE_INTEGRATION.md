# Aside integration

mdbe v0.2 exposes a narrow, page-local bridge so Aside can revise the Markdown document that the user has already opened in the editor.

## Security boundary

The bridge is available only inside `editor.html`. It can read and replace the current document, flush its recovery draft, and save through the current writable file handle. It cannot enumerate arbitrary filesystem paths, open a native picker, or bypass Chrome's file permission prompt.

The user must first open a folder or file in mdbe. If the current document has no writable handle, `save()` returns `no-file-handle` instead of downloading a copy or opening a picker.

## API

The immutable API is exposed as `window.mdbe`:

```ts
const document = window.mdbe.getDocument()

const replaced = window.mdbe.replaceMarkdown(nextMarkdown, {
  expectedRevision: document.revision,
})

if (replaced.ok) {
  const saved = await window.mdbe.save({
    expectedRevision: replaced.document.revision,
  })
}
```

`getDocument()` returns the current Markdown plus its filename, worktree path, revision, dirty state, save state, and whether a writable file handle is connected.

Every write must include `expectedRevision`; omitting it returns `revision-required`. If a person edits the document after the agent reads it, mdbe returns `revision-conflict` instead of overwriting the newer editor content. Before a source-file save, mdbe also rereads the file inside a cross-tab save lock; an external editor or another mdbe tab changing it returns `file-changed-on-disk` instead of overwriting it. The agent must reread and merge before retrying. Replacement and recovery-draft failures are also returned explicitly rather than being reported as successful edits.

A successful `replaceMarkdown()` immediately flushes the per-tab recovery draft. It does not modify the source file until `save()` succeeds. A save is complete only when the result has `ok: true` and `document.dirty: false`.

## Events

- `mdbe:aside-ready`: the versioned bridge was installed
- `mdbe:state-change`: the document revision, dirty state, or saving state changed

Events do not include file contents. Use `getDocument()` for an atomic snapshot.
