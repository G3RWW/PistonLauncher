import { getName, getVersion } from '@tauri-apps/api/app';

async function renderAboutBody() {
  const body = document.querySelector<HTMLDivElement>('#about-body')!;
  body.innerHTML = '';

  const [name, version] = await Promise.all([getName(), getVersion()]);

  const title = document.createElement('div');
  title.className = 'about-title';
  title.textContent = name;

  const versionEl = document.createElement('div');
  versionEl.className = 'about-version';
  versionEl.textContent = `Version ${version}`;

  const desc = document.createElement('p');
  desc.className = 'about-description';
  desc.textContent = 'A Steam-style launcher for tracking time spent in your everyday work apps.';

  body.append(title, versionEl, desc);
}

document.querySelector<HTMLButtonElement>('#about-btn')!.addEventListener('click', () => {
  renderAboutBody();
  document.querySelector('#about-modal')!.classList.remove('hidden');
});
document.querySelector<HTMLButtonElement>('#about-close-btn')!.addEventListener('click', () => {
  document.querySelector('#about-modal')!.classList.add('hidden');
});