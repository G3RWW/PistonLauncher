import { invoke } from '@tauri-apps/api/core';
import type { AppEntry } from '../../core/types';
import { loadApps, loadSessions, saveSessions } from '../../core/storage';
import { initials } from '../../core/state';

export function buildQuickLaunchContent(content: HTMLDivElement, app: AppEntry) {
  content.innerHTML = '';
  const apps = loadApps();
  const siblings = apps.filter((a) => a.category === app.category && a.id !== app.id);

  if (siblings.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'overlay-empty-small';
    empty.textContent = 'No other apps in this category.';
    content.appendChild(empty);
    return;
  }

  for (const sibling of siblings) {
    const row = document.createElement('button');
    row.className = 'overlay-quicklaunch-row';
    row.title = `Launch ${sibling.name}`;
    row.addEventListener('click', async () => {
      row.disabled = true;
      try {
        const pid = await invoke<number>('launch_app', { path: sibling.path });
        // Record the session directly — same as the launcher's own
        // launchAndTrack. If this window closes before the app does,
        // the launcher's existing orphan-reconciliation on next startup
        // cleans it up, same safety net as any interrupted session.
        const sessions = loadSessions();
        sessions.push({ id: crypto.randomUUID(), appId: sibling.id, startedAt: Date.now(), pid });
        saveSessions(sessions);
      } catch (err) {
        console.error(`Quick-launch failed for ${sibling.name}:`, err);
      } finally {
        row.disabled = false;
      }
    });

    const icon = document.createElement('div');
    icon.className = 'overlay-quicklaunch-icon';
    if (sibling.icon) {
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${sibling.icon}`;
      icon.appendChild(img);
    } else {
      icon.textContent = initials(sibling.name);
    }

    const name = document.createElement('span');
    name.className = 'overlay-quicklaunch-name';
    name.textContent = sibling.name;

    row.append(icon, name);
    content.appendChild(row);
  }
}
