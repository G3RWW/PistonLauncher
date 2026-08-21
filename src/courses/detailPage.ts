import { openUrl } from '@tauri-apps/plugin-opener';
import type { Course, Lesson, CourseItem, CourseProgress } from '../core/types';
import { loadCourses, saveCourses, loadAllCourseProgress, saveAllCourseProgress, loadActiveCourseId, saveActiveCourseId } from '../core/storage';
import { setCurrentView } from '../core/state';
import { renderView } from '../library/render';
import { customAlert, customConfirm } from '../core/dialogs';
import {
  loadCourseProgress,
  courseCompletionFraction,
  isItemUnlocked,
  isItemSatisfied,
  markTheorySeen,
  completeTaskCheckmark,
  uncompleteTask,
  completeTaskFileUpload,
} from './progress';
import { resolveTaskUploadFolder } from './import';

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
        const a = document.createElement('button');
        a.type = 'button';
        a.className = 'course-item-link';
        a.textContent = `▶ ${link.label}`;
        a.addEventListener('click', () => {
          openUrl(link.url).catch((err) => console.error('Failed to open link:', err));
        });
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
