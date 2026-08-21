import { invoke } from '@tauri-apps/api/core';

export async function tryGetIcon(path: string): Promise<string | undefined> {
  try {
    const icon = await invoke<string>('get_app_icon', { path });
    return icon || undefined;
  } catch (err) {
    console.warn('Could not extract icon for', path, err);
    return undefined;
  }
}
