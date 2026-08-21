import { openUrl } from '@tauri-apps/plugin-opener';
import { loadCourses, loadActiveCourseId } from '../../core/storage';
import {
  loadCourseProgress,
  courseCompletionFraction,
  nextUnsatisfiedItem,
  markTheorySeen,
  completeTaskCheckmark,
  completeTaskFileUpload,
  resolveTaskUploadFolder,
} from '../../courses';

// Shows the active course's next not-yet-satisfied item (theory or
// task), with a quick-complete control right in the overlay — so
// progressing through a course doesn't require switching back to the
// main window. Which course is "active" is set from the main app's
// Courses page.
export function buildCourseContent(content: HTMLDivElement) {
  content.innerHTML = '';

  const activeId = loadActiveCourseId();
  const course = activeId ? loadCourses().find((c) => c.id === activeId) : undefined;

  if (!course) {
    const empty = document.createElement('div');
    empty.className = 'overlay-empty-small';
    empty.textContent = 'No active course. Set one from Courses \u2192 Set as active for overlay.';
    content.appendChild(empty);
    return;
  }

  const progress = loadCourseProgress(course.id);
  const { done, total } = courseCompletionFraction(course, progress);

  const title = document.createElement('div');
  title.className = 'overlay-course-title';
  title.textContent = course.title;

  const progressLine = document.createElement('div');
  progressLine.className = 'overlay-reminder-countdown';
  progressLine.textContent = `${done}/${total} complete`;

  content.append(title, progressLine);

  const next = nextUnsatisfiedItem(course, progress);
  if (!next) {
    const doneMsg = document.createElement('div');
    doneMsg.className = 'overlay-empty-small';
    doneMsg.textContent = 'Course complete! 🎉';
    content.appendChild(doneMsg);
    return;
  }

  const itemTitle = document.createElement('div');
  itemTitle.className = 'overlay-course-item-title';
  itemTitle.textContent = (next.type === 'theory' ? '📖 ' : '📝 ') + next.title;
  content.appendChild(itemTitle);

  if (next.type === 'theory') {
    const body = document.createElement('div');
    body.className = 'overlay-course-item-body';
    body.textContent = next.body.split(/\n\s*\n/)[0]?.trim() ?? '';
    content.appendChild(body);

    if (next.links && next.links.length > 0) {
      const link = next.links[0];
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'overlay-course-link';
      a.textContent = `▶ ${link.label}`;
      a.addEventListener('click', () => {
        openUrl(link.url).catch((err) => console.error('Failed to open link:', err));
      });
      content.appendChild(a);
    }

    const doneBtn = document.createElement('button');
    doneBtn.className = 'overlay-action-btn';
    doneBtn.textContent = "I've read this";
    doneBtn.addEventListener('click', () => {
      markTheorySeen(course.id, next.id);
      buildCourseContent(content);
    });
    content.appendChild(doneBtn);
  } else {
    const desc = document.createElement('div');
    desc.className = 'overlay-course-item-body';
    desc.textContent = next.description;
    content.appendChild(desc);

    if (next.completion === 'checkmark') {
      const doneBtn = document.createElement('button');
      doneBtn.className = 'overlay-action-btn';
      doneBtn.textContent = 'Mark complete';
      doneBtn.addEventListener('click', () => {
        completeTaskCheckmark(course.id, next.id);
        buildCourseContent(content);
      });
      content.appendChild(doneBtn);
    } else {
      const uploadBtn = document.createElement('button');
      uploadBtn.className = 'overlay-action-btn';
      uploadBtn.textContent = 'Upload file...';
      uploadBtn.addEventListener('click', async () => {
        const folder = resolveTaskUploadFolder(course, next);
        if (!folder) return; // no files folder configured — main app surfaces the fix
        const ok = await completeTaskFileUpload(course.id, next.id, folder);
        if (ok) buildCourseContent(content);
      });
      content.appendChild(uploadBtn);
    }
  }
}

