function closeAllHeaderMenus() {
  document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
}
document.addEventListener('click', closeAllHeaderMenus);

document.querySelectorAll<HTMLButtonElement>('.menu-trigger').forEach((trigger) => {
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = trigger.closest('.menu')!;
    const wasOpen = menu.classList.contains('open');
    closeAllHeaderMenus();
    if (!wasOpen) menu.classList.add('open');
  });
});

// A click on any button inside a dropdown should close the menu after
// that button's own handler runs, rather than leaving it open.
document.querySelectorAll<HTMLElement>('.menu-dropdown').forEach((dropdown) => {
  dropdown.addEventListener('click', () => {
    setTimeout(closeAllHeaderMenus, 0);
  });
});
