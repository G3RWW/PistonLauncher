import { getName, getVersion } from '@tauri-apps/api/app';
import { resolveResource } from '@tauri-apps/api/path';
import { openPath } from '@tauri-apps/plugin-opener';

// Opens a bundled resource folder in the OS file explorer. Resource
// paths only resolve correctly relative to the running app (dev vs.
// installed), which is exactly what resolveResource is for — a plain
// hardcoded path would work in dev but break once installed.
async function openTemplateFolder(relativePath: string) {
  try {
    const resourcePath = await resolveResource(relativePath);
    await openPath(resourcePath);
  } catch (err) {
    console.error(`Failed to open template folder "${relativePath}":`, err);
  }
}

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
  desc.textContent = 'Launcher for tracking time spent in your everyday work apps with course and habit tracking.';

  const templatesSection = document.createElement('div');
  templatesSection.className = 'about-templates';

  const templatesLabel = document.createElement('div');
  templatesLabel.className = 'about-templates-label';
  templatesLabel.textContent = 'Templates';

  const coursesBtn = document.createElement('button');
  coursesBtn.className = 'about-template-btn';
  coursesBtn.textContent = 'Open Course Templates';
  coursesBtn.addEventListener('click', () => openTemplateFolder('templates/courses'));

  const themesBtn = document.createElement('button');
  themesBtn.className = 'about-template-btn';
  themesBtn.textContent = 'Open Theme Template';
  themesBtn.addEventListener('click', () => openTemplateFolder('templates/themes'));

  templatesSection.append(templatesLabel, coursesBtn, themesBtn);

  body.append(title, versionEl, desc, templatesSection);
}

document.querySelector<HTMLButtonElement>('#about-btn')!.addEventListener('click', () => {
  renderAboutBody();
  document.querySelector('#about-modal')!.classList.remove('hidden');
});
document.querySelector<HTMLButtonElement>('#about-close-btn')!.addEventListener('click', () => {
  document.querySelector('#about-modal')!.classList.add('hidden');
});