import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import type { Course, CourseFile, CourseItem, Lesson, TaskItem } from '../core/types';
import { loadCourses, saveCourses, loadCoursesFolder } from '../core/storage';
import { customAlert, customConfirm } from '../core/dialogs';
import { setCurrentView } from '../core/state';
import { renderView } from '../library/render';

// Loading a course from a JSON file: shape validation, id hydration
// (authors don't write ids by hand), and resolving where a course's
// file-upload tasks should actually save to on this machine.

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
