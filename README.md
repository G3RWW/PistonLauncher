# Piston Launcher

A personal desktop app launcher for your everyday work and creative software. Organize your apps into categories, track how much time you actually spend in each one, and launch everything from one place — with an overlay you can keep on top of whatever you're working in.

Built with [Tauri](https://tauri.app) (Rust + a lightweight native WebView2).

App is created using AI (Claude AI).

## Features

- **Launch tracking** — every launch is logged as a real session (start/end), giving you accurate per-app and total playtime, viewable on the Stats page. If a tracked app self-updates and relaunches under a new process, tracking now carries over seamlessly instead of losing the session.
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
- **Themes** — three built-in themes (Blueprint, Steam, Midnight), plus support for fully custom themes: load any `.css` file from disk, saved to a reselectable, deletable list.
- **Sound settings** — control the volume and style of the chime played for focus-timer and reminder alerts (Gentle, Classic, Quick ping, or your own custom sound file), or turn sound off entirely and rely on the system notification alone.
- **Export/Import** — back up all your apps, categories, and playtime history to a JSON file, or restore from one.
- **Habit** — Duolingo-style daily streak tracking for one app of your choosing, with a dedicated page showing your current streak, best streak, and a 12-week activity heatmap.
- **Overlay** — a floating panel over your app to:
  - Control your current tracking session (pause or stop it)
  - Write freeform session notes that save automatically
  - Quick-launch other apps from the same category (e.g. jump straight from Adobe Illustrator to Adobe After Effects)
  - Check your weekly trend to see how much you use the app per week
  - Set and follow a daily goal for how long you want to work in a given app or project
  - Run a focus timer with configurable work/break intervals — get a sound and a system notification the moment a session ends, even if the overlay is closed
  - Set reminders for drinking water, stretching, or anything else — same sound + notification alert when one fires
  - See your Habit streak at a glance, no matter which app you're currently tracking

## Installing

Grab the latest installer from the [Releases](../../releases) page and run it. It's an unsigned build, so Windows SmartScreen will show a warning on first run — click **More info → Run anyway**.

## Updating

Grab the latest installer from the [Releases](../../releases) page and run it over your
existing install — no need to uninstall first. Your apps, sessions, and habit streak are
stored locally and aren't touched by the installer, so they'll carry over automatically.

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
- **Check usage** anytime from the **Stats** link in the header.
- **Track a habit** from the **Habit** link, or by setting an app as your habit from its detail page.
- **Configure everything** — themes, keyboard shortcuts, and sound alerts — from **Settings → Preferences**.
- **Back up your data** via **File → Export Data**, and restore it via **Import Data**.

### Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl + Space` | Open quick launch |
| `Esc` | Close quick launch, a dialog, or an open menu |
| `Ctrl+Alt+Shift+O` | Open overlay |
| `↑` / `↓` | Move selection in quick launch |
| `Enter` | Launch selected app / confirm a dialog |

(Also available in-app and changeable under **Settings → Preferences → Shortcuts**.)

> **Picking a custom overlay shortcut:** avoid single keys or combos commonly bound by games for other purposes — backtick (`` ` ``) in particular is the near-universal developer-console key in many game engines, and a game capturing it first can prevent the keypress from ever reaching Piston. A combo with two or three modifiers and an uncommon letter (e.g. `Ctrl+Alt+Shift+P`) is much less likely to collide.

## Tech stack

- **Backend:** Rust + [Tauri v2](https://tauri.app)
- **Frontend:** TypeScript, no framework — plain DOM manipulation
- **Bundler:** Vite

## Roadmap

- Streak freezes for the Habit system (protect a streak against one missed day)
- Support for multiple habit apps, each with its own streak
- Course overlay and page for personal learning, with a custom course system
- Online teacher–student functionality within the course page

## Changelog

### 0.1.8

**Added**
- Sound and system notifications for the focus timer and reminders — you're now alerted when either completes even if the overlay is closed.
- Sound settings under **Settings → Preferences → Sound**: volume control, choice of chime style (Gentle, Classic, Quick ping, or a custom sound file), and a test button.
- Unified **Settings** menu (Sound / Themes / Shortcuts), replacing the separate "Theme" and "Keyboard Shortcuts" entries.

**Fixed**
- `tauri-plugin-notification` was declared as a dependency but never registered — notifications now actually work.
- The focus timer and reminders now reset when the app closes, instead of continuing to run against wall-clock time and firing a backlog of stale alerts the next time the app opens.
- Fixed overlay panels occasionally appearing correctly placed but jumping outside the window the first time you tried to drag them.
- Tracked-app sessions no longer end when an app self-updates and relaunches under a new process ID — tracking now carries over to the new process automatically.
- Hardened the overlay's global shortcut registration and added a periodic self-check that quietly re-registers it if Windows silently drops it.
