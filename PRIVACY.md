# mdbe Privacy Policy

Effective date: September 2, 2026

mdbe is a local-first Markdown reader and editor. This policy explains what data the extension handles, how it is used, and where it is stored.

## Data mdbe handles

mdbe handles the following data only to provide its user-facing Markdown features:

- **Website content:** Markdown text from a page whose URL matches a supported Markdown file extension. mdbe reads and renders that page locally in the browser.
- **User-selected local files:** Markdown content and file or folder names selected by the user through the browser's File System Access API. mdbe cannot browse arbitrary files or folders without the user's selection and browser permission.
- **Local preferences and recovery data:** Reader and editor settings, theme and font preferences, update-ready metadata, the current draft, and its file name.

mdbe does not collect or transmit this data to the mdbe developer, an analytics service, an advertising service, or any other third party.

## How data is used

The handled data is used only to:

- render Markdown pages;
- edit and save Markdown files selected by the user;
- show a lazy-loaded worktree for a folder selected by the user;
- remember extension preferences;
- recover an unsaved draft after a reload;
- detect conflicting file changes before writing; and
- notify the editor when a Chrome Web Store update is ready.

When the reader's optional auto-refresh setting is enabled, mdbe periodically requests the same Markdown URL that is already open to detect changes. That request goes only to the page's original host and is subject to that host's privacy practices. mdbe does not send the page content to an mdbe-operated server.

The optional Aside bridge works only in an open mdbe extension page. It exchanges revision-checked document operations within that page and does not create a network connection or bypass browser file permissions.

## Local storage and retention

- Reader preferences and update metadata are stored with Chrome extension storage on the user's device.
- Editor drafts, file names, theme, and appearance settings are stored in extension-local browser storage on the user's device.
- Stale per-tab drafts are automatically removed after 30 days.
- File and directory handles are not uploaded. They must be selected again after an extension reload.

Users can remove stored extension data by clearing mdbe's site or extension data, or by uninstalling mdbe.

## Permissions

- **activeTab:** lets user-invoked toolbar and keyboard actions communicate with the currently active Markdown tab.
- **storage:** stores local preferences and update-ready state.
- **Host access:** lets mdbe detect, read, and render Markdown documents opened from HTTP, HTTPS, or file URLs, and re-request the same document when optional auto-refresh is enabled.

mdbe does not use these permissions to build a browsing history, track activity across sites, or access unrelated page content for advertising or analytics.

## Sharing, sale, and advertising

mdbe does not sell user data. It does not share user data with third parties. It contains no advertising, analytics, telemetry, account system, or developer-operated backend.

## Remote code

All executable JavaScript used by mdbe is packaged with the extension. mdbe does not download or execute remotely hosted code.

## Security

mdbe relies on Chrome's extension isolation and File System Access permission prompts. Before overwriting a selected file, mdbe checks whether its on-disk contents changed and rejects the save if they no longer match the known baseline.

## Chrome Web Store Limited Use

mdbe's use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Changes

If mdbe's data practices change, this policy will be updated before the changed behavior is published. The effective date above will also be updated.

## Contact

For privacy questions or requests, open an issue at [github.com/ChangJunPark/mdbe/issues](https://github.com/ChangJunPark/mdbe/issues).
