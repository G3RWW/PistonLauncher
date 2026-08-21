import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import type { Course, CourseFile, CourseItem, CourseProgress, Lesson, TaskItem } from './types';
import {
  loadCourses,
  saveCourses,
  loadAllCourseProgress,
  saveAllCourseProgress,
  loadActiveCourseId,
  saveActiveCourseId,
  loadCoursesFolder,
} from './storage';
import { setCurrentView } from './state';
import { renderView } from './render';
import { customAlert, customConfirm } from './dialogs';

// ============================================================
// Import + hydration
// ============================================================

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Basic shape-checking for a loaded course file — not exhaustive, just
// enough to turn "silently broken course" into a specific, readable
// error message pointing at what's wrong.
function validateCourseFile(data: unknown): string | null {
  if (!data || typeof data !== 'object') return 'File is not a valid course (not a JSON object).';
  const file = data as Record<string, unknown>;

  if (typeof file.title !== 'string' || !file.title.trim()) return 'Course is missing a title.';
  if (!Array.isArray(file.lessons) || file.lessons.length === 0) return 'Course needs at least one lesson.';

  for (const lessonRaw of file.lessons) {
    const lesson = lessonRaw as Record<string, unknown>;
    if (typeof lesson.title !== 'string' || !lesson.title.trim()) return 'A lesson is missing a title.';
    if (!Array.isArray(lesson.items) || lesson.items.length === 0) {
      return `Lesson "${lesson.title}" needs at least one item.`;
    }

    for (const itemRaw of lesson.items) {
      const item = itemRaw as Record<string, unknown>;
      if (item.type === 'theory') {
        if (typeof item.title !== 'string' || !item.title.trim()) {
          return `A theory item in "${lesson.title}" is missing a title.`;
        }
        if (typeof item.body !== 'string') return `Theory item "${item.title}" is missing body text.`;
      } else if (item.type === 'task') {
        if (typeof item.title !== 'string' || !item.title.trim()) {
          return `A task item in "${lesson.title}" is missing a title.`;
        }
        if (item.completion !== 'checkmark' && item.completion !== 'file-upload') {
          return `Task "${item.title}" needs "completion" set to "checkmark" or "file-upload".`;
        }
      } else {
        return `An item in "${lesson.title}" has an unknown "type" (must be "theory" or "task").`;
      }
    }
  }

  return null;
}

// Assigns stable ids to everything, since course authors shouldn't have
// to invent/maintain unique ids by hand in the file itself.
function hydrateCourseFile(file: CourseFile): Course {
  const courseId = genId('course');
  return {
    id: courseId,
    title: file.title,
    description: file.description,
    autoCreateFolder: file.autoCreateFolder,
    lessons: file.lessons.map((lesson, li): Lesson => {
      const lessonId = `${courseId}-l${li}`;
      return {
        id: lessonId,
        title: lesson.title,
        items: lesson.items.map((item, ii): CourseItem => {
          const itemId = `${lessonId}-i${ii}`;
          if (item.type === 'theory') {
            return { type: 'theory', id: itemId, title: item.title, body: item.body, links: item.links };
          }
          return {
            type: 'task',
            id: itemId,
            title: item.title,
            description: item.description,
            completion: item.completion,
            folder: item.folder,
          };
        }),
      };
    }),
  };
}

function hasFileUploadTask(course: Course): boolean {
  return course.lessons.some((l) => l.items.some((i) => i.type === 'task' && i.completion === 'file-upload'));
}

// Windows-illegal filename characters, so a course title can safely
// become a real subfolder name.
function safeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Course';
}

// Asks the user where this course's uploaded files should live: the
// Courses folder from Settings (if one is set), or a freshly-chosen
// folder — either way, appending a folder named after the course unless
// the course file explicitly opts out via "autoCreateFolder": false.
async function resolveCourseFilesFolder(course: Course): Promise<string | null> {
  const settingsFolder = loadCoursesFolder();
  let baseFolder: string | null = null;

  if (settingsFolder) {
    const useSettingsFolder = await customConfirm(
      'Where should this course\'s uploaded files go?',
      `Use the Courses folder from Settings (${settingsFolder})? Choose Cancel to pick a different folder for just this course.`,
    );
    if (useSettingsFolder) baseFolder = settingsFolder;
  }

  if (!baseFolder) {
    const picked = await open({ directory: true, multiple: false });
    if (!picked || typeof picked !== 'string') return null;
    baseFolder = picked;
  }

  if (course.autoCreateFolder === false) return baseFolder;
  return `${baseFolder}\\${safeFolderName(course.title)}`;
}

// Resolves a task's actual absolute upload folder from the course's
// base folder plus the task's own optional relative subpath.
export function resolveTaskUploadFolder(course: Course, task: TaskItem): string | null {
  if (!course.filesBaseFolder) return null;
  if (!task.folder) return course.filesBaseFolder;
  return `${course.filesBaseFolder}\\${task.folder}`;
}

export async function importCourseFromFile() {
  try {
    const path = await open({ multiple: false, filters: [{ name: 'Course', extensions: ['json'] }] });
    if (!path || typeof path !== 'string') return;

    const raw = await readTextFile(path);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await customAlert('Could not load course', 'That file is not valid JSON.');
      return;
    }

    const error = validateCourseFile(parsed);
    if (error) {
      await customAlert('Could not load course', error);
      return;
    }

    const course = hydrateCourseFile(parsed as CourseFile);

    if (hasFileUploadTask(course)) {
      const filesBaseFolder = await resolveCourseFilesFolder(course);
      if (!filesBaseFolder) {
        await customAlert('Course not loaded', 'This course has file-upload tasks and needs a files folder to use for them.');
        return;
      }
      course.filesBaseFolder = filesBaseFolder;
    }

    const courses = loadCourses();
    courses.push(course);
    saveCourses(courses);

    setCurrentView({ type: 'courses' });
    renderView();
  } catch (err) {
    console.error('Failed to load course file:', err);
    await customAlert('Could not load course', 'Something went wrong reading that file.');
  }
}

// ============================================================
// Progress + sequential unlocking
// ============================================================

export function loadCourseProgress(courseId: string): CourseProgress {
  const all = loadAllCourseProgress();
  return all[courseId] ?? { theorySeen: {}, taskProgress: {} };
}

function saveCourseProgress(courseId: string, progress: CourseProgress) {
  const all = loadAllCourseProgress();
  all[courseId] = progress;
  saveAllCourseProgress(all);
}

function flattenItems(course: Course): CourseItem[] {
  return course.lessons.flatMap((l) => l.items);
}

function isItemSatisfied(item: CourseItem, progress: CourseProgress): boolean {
  if (item.type === 'theory') return !!progress.theorySeen[item.id];
  return !!progress.taskProgress[item.id]?.completed;
}

// Items unlock strictly in course order — a task only becomes available
// once every theory (and task) item before it, anywhere earlier in the
// course, has been satisfied. This is what guarantees tasks are only
// ever given after their theory.
export function isItemUnlocked(course: Course, itemId: string, progress: CourseProgress): boolean {
  const flat = flattenItems(course);
  const idx = flat.findIndex((i) => i.id === itemId);
  if (idx <= 0) return true; // first item (or not found — fail open rather than lock everything)
  return flat.slice(0, idx).every((i) => isItemSatisfied(i, progress));
}

export function courseCompletionFraction(course: Course, progress: CourseProgress): { done: number; total: number } {
  const flat = flattenItems(course);
  const done = flat.filter((i) => isItemSatisfied(i, progress)).length;
  return { done, total: flat.length };
}

// The next item the user hasn't satisfied yet — what the overlay's
// Course panel shows as "up next".
export function nextUnsatisfiedItem(course: Course, progress: CourseProgress): CourseItem | null {
  return flattenItems(course).find((i) => !isItemSatisfied(i, progress)) ?? null;
}

export function markTheorySeen(courseId: string, itemId: string) {
  const progress = loadCourseProgress(courseId);
  if (progress.theorySeen[itemId]) return;
  progress.theorySeen[itemId] = true;
  saveCourseProgress(courseId, progress);
}

export function completeTaskCheckmark(courseId: string, itemId: string) {
  const progress = loadCourseProgress(courseId);
  progress.taskProgress[itemId] = { completed: true, completedAt: Date.now() };
  saveCourseProgress(courseId, progress);
}

export function uncompleteTask(courseId: string, itemId: string) {
  const progress = loadCourseProgress(courseId);
  delete progress.taskProgress[itemId];
  saveCourseProgress(courseId, progress);
}

// Opens a file picker, copies the chosen file into the task's folder
// (creating it if needed) via the Rust side — plugin-fs's scope is
// oriented around explicitly-allowed roots, so a plain Rust std::fs
// copy sidesteps needing the task folder itself to be pre-declared.
export async function completeTaskFileUpload(courseId: string, itemId: string, folder: string): Promise<boolean> {
  try {
    const path = await open({ multiple: false });
    if (!path || typeof path !== 'string') return false;

    const fileName = await invoke<string>('copy_file_to_folder', { sourcePath: path, destFolder: folder });

    const progress = loadCourseProgress(courseId);
    progress.taskProgress[itemId] = { completed: true, completedAt: Date.now(), uploadedFileName: fileName };
    saveCourseProgress(courseId, progress);
    return true;
  } catch (err) {
    console.error('Failed to upload task file:', err);
    await customAlert('Upload failed', 'Could not copy that file into the task folder.');
    return false;
  }
}

// ============================================================
// Courses page — library view
// ============================================================

export function renderCoursesPage() {
  const container = document.querySelector<HTMLDivElement>('#app-courses')!;
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'courses-page-header';

  const heading = document.createElement('h1');
  heading.textContent = 'Courses';

  const loadBtn = document.createElement('button');
  loadBtn.className = 'courses-load-btn';
  loadBtn.textContent = '+ Load Course...';
  loadBtn.addEventListener('click', importCourseFromFile);

  header.append(heading, loadBtn);
  container.appendChild(header);

  const courses = loadCourses();
  if (courses.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No courses loaded yet — load a course file to get started.';
    container.appendChild(empty);
    return;
  }

  const activeId = loadActiveCourseId();
  const grid = document.createElement('div');
  grid.className = 'courses-grid';

  for (const course of courses) {
    const progress = loadCourseProgress(course.id);
    const { done, total } = courseCompletionFraction(course, progress);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const isActive = course.id === activeId;

    const card = document.createElement('button');
    card.className = 'course-card' + (isActive ? ' course-card-active' : '');
    card.addEventListener('click', () => {
      setCurrentView({ type: 'course', id: course.id });
      renderView();
    });

    const title = document.createElement('div');
    title.className = 'course-card-title';
    title.textContent = course.title;

    const desc = document.createElement('div');
    desc.className = 'course-card-desc';
    desc.textContent = course.description || `${course.lessons.length} lesson${course.lessons.length === 1 ? '' : 's'}`;

    const progressBar = document.createElement('div');
    progressBar.className = 'course-card-progress-bar';
    const fill = document.createElement('div');
    fill.className = 'course-card-progress-fill';
    fill.style.width = `${pct}%`;
    progressBar.appendChild(fill);

    const progressLabel = document.createElement('div');
    progressLabel.className = 'course-card-progress-label';
    progressLabel.textContent = `${done}/${total} complete`;

    card.append(title, desc, progressBar, progressLabel);

    if (isActive) {
      const badge = document.createElement('div');
      badge.className = 'course-card-active-badge';
      badge.textContent = 'Active in overlay';
      card.appendChild(badge);
    }

    grid.appendChild(card);
  }

  container.appendChild(grid);
}

// ============================================================
// Course detail page — lessons + items
// ============================================================

export function renderCourseDetail(courseId: string) {
  const container = document.querySelector<HTMLDivElement>('#app-courses')!;
  container.innerHTML = '';

  const course = loadCourses().find((c) => c.id === courseId);
  if (!course) {
    setCurrentView({ type: 'courses' });
    renderView();
    return;
  }

  const progress = loadCourseProgress(course.id);
  const activeId = loadActiveCourseId();
  const isActive = course.id === activeId;

  const header = document.createElement('div');
  header.className = 'course-detail-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'course-back-btn';
  backBtn.textContent = '← All courses';
  backBtn.addEventListener('click', () => {
    setCurrentView({ type: 'courses' });
    renderView();
  });

  const title = document.createElement('h1');
  title.textContent = course.title;

  const actions = document.createElement('div');
  actions.className = 'course-detail-actions';

  const activeBtn = document.createElement('button');
  activeBtn.className = 'course-active-btn';
  activeBtn.textContent = isActive ? '✓ Active in overlay' : 'Set as active for overlay';
  activeBtn.disabled = isActive;
  activeBtn.addEventListener('click', () => {
    saveActiveCourseId(course.id);
    renderCourseDetail(course.id);
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'course-remove-btn';
  removeBtn.textContent = 'Remove course';
  removeBtn.addEventListener('click', async () => {
    const ok = await customConfirm(
      'Remove this course?',
      "This removes the course and your progress on it. This can't be undone.",
      true,
    );
    if (!ok) return;
    saveCourses(loadCourses().filter((c) => c.id !== course.id));
    const allProgress = loadAllCourseProgress();
    delete allProgress[course.id];
    saveAllCourseProgress(allProgress);
    if (loadActiveCourseId() === course.id) saveActiveCourseId(null);
    setCurrentView({ type: 'courses' });
    renderView();
  });

  actions.append(activeBtn, removeBtn);
  header.append(backBtn, title, actions);
  container.appendChild(header);

  if (course.description) {
    const desc = document.createElement('p');
    desc.className = 'course-detail-desc';
    desc.textContent = course.description;
    container.appendChild(desc);
  }

  const { done, total } = courseCompletionFraction(course, progress);
  const progressLine = document.createElement('div');
  progressLine.className = 'course-detail-progress-line';
  progressLine.textContent = `${done}/${total} complete`;
  container.appendChild(progressLine);

  const lessonsWrap = document.createElement('div');
  lessonsWrap.className = 'course-lessons';
  for (const lesson of course.lessons) {
    lessonsWrap.appendChild(buildLessonSection(course, lesson, progress));
  }
  container.appendChild(lessonsWrap);
}

function buildLessonSection(course: Course, lesson: Lesson, progress: CourseProgress): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'course-lesson';

  const heading = document.createElement('h2');
  heading.className = 'course-lesson-title';
  heading.textContent = lesson.title;
  wrap.appendChild(heading);

  for (const item of lesson.items) {
    wrap.appendChild(buildItemRow(course, item, progress));
  }

  return wrap;
}

function buildItemRow(course: Course, item: CourseItem, progress: CourseProgress): HTMLDivElement {
  const unlocked = isItemUnlocked(course, item.id, progress);
  const satisfied = isItemSatisfied(item, progress);

  const row = document.createElement('div');
  row.className =
    'course-item' +
    (item.type === 'theory' ? ' course-item-theory' : ' course-item-task') +
    (satisfied ? ' course-item-done' : '') +
    (!unlocked ? ' course-item-locked' : '');

  const titleRow = document.createElement('div');
  titleRow.className = 'course-item-title-row';

  const icon = document.createElement('span');
  icon.className = 'course-item-icon';
  icon.textContent = !unlocked ? '🔒' : satisfied ? '✓' : item.type === 'theory' ? '📖' : '📝';

  const titleEl = document.createElement('span');
  titleEl.className = 'course-item-title';
  titleEl.textContent = item.title;

  titleRow.append(icon, titleEl);
  row.appendChild(titleRow);

  if (!unlocked) {
    const lockedNote = document.createElement('div');
    lockedNote.className = 'course-item-locked-note';
    lockedNote.textContent = 'Complete the previous item to unlock this.';
    row.appendChild(lockedNote);
    return row;
  }

  if (item.type === 'theory') {
    const body = document.createElement('div');
    body.className = 'course-item-body';
    for (const para of item.body.split(/\n\s*\n/)) {
      if (!para.trim()) continue;
      const p = document.createElement('p');
      p.textContent = para.trim();
      body.appendChild(p);
    }
    row.appendChild(body);

    if (item.links && item.links.length > 0) {
      const linksWrap = document.createElement('div');
      linksWrap.className = 'course-item-links';
      for (const link of item.links) {
        const a = document.createElement('a');
        a.href = link.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'course-item-link';
        a.textContent = `▶ ${link.label}`;
        linksWrap.appendChild(a);
      }
      row.appendChild(linksWrap);
    }

    if (!satisfied) {
      const doneBtn = document.createElement('button');
      doneBtn.className = 'course-item-action-btn';
      doneBtn.textContent = "I've read this";
      doneBtn.addEventListener('click', () => {
        markTheorySeen(course.id, item.id);
        renderCourseDetail(course.id);
      });
      row.appendChild(doneBtn);
    }
  } else {
    const desc = document.createElement('div');
    desc.className = 'course-item-body';
    const p = document.createElement('p');
    p.textContent = item.description;
    desc.appendChild(p);
    row.appendChild(desc);

    if (!satisfied) {
      if (item.completion === 'checkmark') {
        const doneBtn = document.createElement('button');
        doneBtn.className = 'course-item-action-btn';
        doneBtn.textContent = 'Mark complete';
        doneBtn.addEventListener('click', () => {
          completeTaskCheckmark(course.id, item.id);
          renderCourseDetail(course.id);
        });
        row.appendChild(doneBtn);
      } else {
        const uploadBtn = document.createElement('button');
        uploadBtn.className = 'course-item-action-btn';
        uploadBtn.textContent = 'Upload file...';
        uploadBtn.addEventListener('click', async () => {
          const folder = resolveTaskUploadFolder(course, item);
          if (!folder) {
            await customAlert('No files folder set', 'This course has no files folder configured — remove and reload it to set one up.');
            return;
          }
          const ok = await completeTaskFileUpload(course.id, item.id, folder);
          if (ok) renderCourseDetail(course.id);
        });
        row.appendChild(uploadBtn);
      }
    } else {
      const entry = progress.taskProgress[item.id];
      const doneNote = document.createElement('div');
      doneNote.className = 'course-item-done-note';
      doneNote.textContent = entry?.uploadedFileName ? `Uploaded: ${entry.uploadedFileName}` : 'Completed';
      row.appendChild(doneNote);

      const undoBtn = document.createElement('button');
      undoBtn.className = 'course-item-undo-btn';
      undoBtn.textContent = 'Undo';
      undoBtn.addEventListener('click', () => {
        uncompleteTask(course.id, item.id);
        renderCourseDetail(course.id);
      });
      row.appendChild(undoBtn);
    }
  }

  return row;
}

// ---- File menu: Load Course... ----
document.querySelector<HTMLButtonElement>('#load-course-btn')?.addEventListener('click', importCourseFromFile);