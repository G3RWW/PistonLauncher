import type { AppEntry } from './types';

export function openAchievementsModal(app: AppEntry) {
  const body = document.querySelector<HTMLDivElement>('#achievements-modal-body')!;
  body.textContent = `No achievement set assigned to "${app.name}" yet.`;
  document.querySelector('#achievements-modal')!.classList.remove('hidden');
}

document.querySelector<HTMLButtonElement>('#achievements-close-btn')!.addEventListener('click', () => {
  document.querySelector('#achievements-modal')!.classList.add('hidden');
});
