import { loadCourses, loadActiveCourseId } from '../core/storage';
import { setCurrentView } from '../core/state';
import { renderView } from '../library/render';
import { importCourseFromFile } from './import';
import { loadCourseProgress, courseCompletionFraction } from './progress';

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
