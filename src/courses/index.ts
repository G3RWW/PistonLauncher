// Public entry point for the courses feature. The implementation is
// split across a few files by concern:
//   ./import.ts       - loading a course from a JSON file
//   ./progress.ts      - per-course progress + sequential unlocking
//   ./libraryPage.ts   - the Courses tab's library grid
//   ./detailPage.ts    - a single course's lessons/items view
// This file just re-exports what the rest of the app needs and wires up
// the one bit of global UI (the File menu's "Load Course..." button)
// that doesn't belong to either page.

export { importCourseFromFile, resolveTaskUploadFolder } from './import';
export {
  loadCourseProgress,
  courseCompletionFraction,
  isItemUnlocked,
  nextUnsatisfiedItem,
  markTheorySeen,
  completeTaskCheckmark,
  uncompleteTask,
  completeTaskFileUpload,
} from './progress';
export { renderCoursesPage } from './libraryPage';
export { renderCourseDetail } from './detailPage';

import { importCourseFromFile } from './import';

// ---- File menu: Load Course... ----
document.querySelector<HTMLButtonElement>('#load-course-btn')?.addEventListener('click', importCourseFromFile);
