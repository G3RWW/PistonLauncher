import { invoke } from '@tauri-apps/api/core';

const btn = document.querySelector<HTMLButtonElement>('#Launch-button')!;

btn.addEventListener('click', async () => {
  try {
    const pid = await invoke<number>('launch_app', { path: 'C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE' });
    console.log('launched, pid:', pid);

    const startedAt = Date.now();

    const interval = setInterval(async () => {
      const running = await invoke<boolean>('is_running', { pid });
      if (!running) {
        clearInterval(interval);
        const durationSec = Math.round((Date.now() - startedAt) / 1000);
        console.log(`closed. playtime: ${durationSec} seconds`);
      }
    }, 1500);

  } catch (err) {
    console.error('Launch failed:', err);
  }
});