import type { Course, CourseItem, CourseProgress } from '../core/types';
import { loadAllCourseProgress, saveAllCourseProgress } from '../core/storage';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { customAlert } from '../core/dialogs';

// Per-course progress storage, sequential unlocking, and the mutations
// that mark theory read / tasks complete.

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

export function isItemSatisfied(item: CourseItem, progress: CourseProgress): boolean {
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