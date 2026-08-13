function closeGenericModals() {
  document.querySelectorAll<HTMLElement>('.modal:not(.hidden)').forEach((modal) => {
    if (modal.id === 'quick-launch-modal') return; // has its own dedicated handling in quickLaunch.ts
    modal.classList.add('hidden');
  });
}

document.querySelectorAll<HTMLElement>('.modal').forEach((modal) => {
  if (modal.id === 'quick-launch-modal') return; // already wired in quickLaunch.ts

  modal.addEventListener('click', (e) => {
    if (e.target !== modal) return; // only backdrop clicks, not clicks inside the content box
    if (modal.id === 'dialog-modal') {
      // Route through the existing Cancel button so the pending Promise in
      // showDialog() actually resolves, instead of just hiding the element.
      document.querySelector<HTMLButtonElement>('#dialog-cancel-btn')?.click();
    } else {
      modal.classList.add('hidden');
    }
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  const dialogModal = document.querySelector<HTMLElement>('#dialog-modal')!;
  if (!dialogModal.classList.contains('hidden')) {
    document.querySelector<HTMLButtonElement>('#dialog-cancel-btn')?.click();
    return;
  }

  const quickLaunchModal = document.querySelector<HTMLElement>('#quick-launch-modal')!;
  if (!quickLaunchModal.classList.contains('hidden')) return; // handled by quickLaunch.ts

  closeGenericModals();
});
