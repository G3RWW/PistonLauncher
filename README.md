# Piston Launcher

A personal desktop app launcher — think Steam, but for your everyday work and creative software. Organize your apps into categories, track how much time you actually spend in each one, and launch everything from one place.

Built with [Tauri](https://tauri.app) (Rust + a lightweight native webview), so it stays small and fast without bundling a full browser.

## Features

- **Launch tracking** — every launch is logged as a real session (start/end), giving you accurate per-app and total playtime, viewable in the Stats page.
- **Categories** — drag and drop tiles between categories, or let auto-categorization group newly added apps by vendor automatically.
- **Add apps three ways**:
  - Drag a `.exe` straight onto the window
  - Scan your Start Menu and bulk-select what to add
  - Add manually by name/path/category
- **Icon extraction** — real icons are pulled directly from each `.exe`, no manual asset hunting.
- **Recently Played** shelf and a live **Now Running** indicator in the header with a ticking timer.
- **Duplicate-launch guard** — won't spawn a second process if an app is already open.
- **Broken-path detection** — flags an app if its last launch failed (e.g. moved or uninstalled), with a one-click path fix.
- **Quick launch** — `Ctrl+Space` anywhere opens a searchable, keyboard-navigable launcher.
- **Themes** — three built-in themes (Blueprint, Steam, Midnight), plus support for fully custom themes: load any `.css` file from disk, and it's saved to a reselectable, deletable list.
- **Export/Import** — back up all your apps, categories, and playtime history to a JSON file, or restore from one.
- **Custom dialogs throughout** — no native browser popups; everything is styled to match the app.

## Installing

Grab the latest installer from the [Releases](../../releases) page and run it. It's an unsigned build, so Windows SmartScreen will show a warning on first run — click **More info → Run anyway**.

## Building from source

**Prerequisites:**
- [Node.js](https://nodejs.org)
- [Rust](https://rustup.rs)

```bash
git clone <this-repo-url>
cd piston-launcher
npm install
npm run tauri dev
```

To build a distributable installer:

```bash
npm run tauri build
```

Installers land in `src-tauri/target/release/bundle/` (`nsis/` for the `.exe` installer, `wix/` for the `.msi`).

## Usage

- **Add apps** via the **File** menu — drag-and-drop, Start Menu scan, or manual entry.
- **Launch** an app by clicking its icon; click its name instead to open a detail page with stats.
- **Reorganize** by dragging a tile into a different category section.
- **Manage categories** via the **Categories** menu, or rename/delete one from its heading in the library.
- **Check usage** anytime from the **Stats** link in the sidebar.
- **Switch themes** via **View → Theme**.
- **Back up your data** via **File → Export Data**, and restore it via **Import Data**.

### Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl + Space` | Open quick launch |
| `Esc` | Close quick launch, a dialog, or an open menu |
| `↑` / `↓` | Move selection in quick launch |
| `Enter` | Launch selected app / confirm a dialog |

(Also available in-app under **Help → Keyboard Shortcuts**.)

## Tech stack

- **Backend:** Rust + [Tauri v2](https://tauri.app)
- **Frontend:** TypeScript, no framework — plain DOM manipulation
- **Bundler:** Vite

## Roadmap

- Achievement sets tied to individual apps (data model and detail-page UI are already in place, ready for this)
- Per-session history views (daily/weekly breakdowns)
