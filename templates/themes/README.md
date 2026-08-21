# Themes

This folder holds the app's built-in themes (`blueprint.css`, `steam.css`, `midnight.css`) plus one example of a fully custom theme (`aurora.css`) and a starting template for making your own (`template.css`).

## The two ways to make a theme

**1. Palette-only (simplest, covers 90% of cases)**

Set the ten CSS variables in `template.css`'s `:root` block to your own colors and you're done — every part of the app's base stylesheet reads its colors from these variables, so a palette swap alone reskins the whole app consistently. `blueprint.css`, `steam.css`, and `midnight.css` are all exactly this: nothing but a `:root` block.

**2. Full restyle (for deeper changes)**

Add ordinary CSS rules targeting specific selectors below the `:root` block. Your theme file loads *after* the app's own `styles.css`, so any rule you write simply wins the cascade for that selector — you're not fighting specificity, just adding overrides. `aurora.css` is a full example: it sets the ten variables *and* adds custom gradients, glowing borders, and gradient text on the logo, tiles, and buttons. Open it alongside `template.css` to see the pattern.

## Loading a theme

Themes aren't compiled into the app — they're loaded from disk at runtime via **Settings → Preferences → Themes → "+ Add Custom Theme File (.css)..."**. Point it at any `.css` file (doesn't need to live in this folder) and it's added to your theme list immediately, no rebuild required.

## The ten variables

| Variable | What it's for |
|---|---|
| `--ink` | Deepest background layer — window edges, some semi-transparent overlays |
| `--panel` | Main surface color — sidebar, header, cards, modals |
| `--panel-raised` | A lighter/elevated variant of `--panel` for nested surfaces (inputs, hovered rows) |
| `--line` | Borders and dividers |
| `--brass` | Primary accent — logo, active nav, primary buttons, progress bars |
| `--brass-dim` | Muted variant of `--brass` — scrollbar thumbs, secondary accents |
| `--moss` | Secondary accent — "positive/active" indicators (active course badge, completed items) |
| `--bone` | Primary text color |
| `--dim` | Secondary/muted text — labels, captions, timestamps |
| `--danger` | Destructive actions and errors — delete buttons, broken-path warnings |

Start from `template.css` — it has the same ten variables with comments explaining exactly where each one shows up in the app.
