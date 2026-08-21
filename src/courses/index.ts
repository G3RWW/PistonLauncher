// Public entry point for the courses feature. The implementation is
// split across a few files by concern:
//   ./import.ts       - loading a course from a JSON file
//   ./progress.ts      - per-course progress + sequential unlocking
//   ./libraryPage.ts   - the Courses tab's library grid
//   ./detailPage.ts    - a single course's lessons/items view
// The "Load Course..." action lives on the Courses page itself
// (libraryPage.ts) rather than in the File menu — it doesn't make sense
// to duplicate it in two places.

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