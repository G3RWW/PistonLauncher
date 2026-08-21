export type AppEntry = {
  id: string;
  name: string;
  path: string;
  category: string;
  lastPlayed?: number;
  icon?: string; // base64 image data
  launchFailed?: boolean; // true if the last launch attempt errored (likely moved/uninstalled)
};

export type View = { type: 'library' } | { type: 'app'; id: string } | { type: 'stats' } | { type: 'habit' } | { type: 'courses' } | { type: 'course'; id: string };

export type ThemeName = 'blueprint' | 'steam' | 'midnight' | 'custom';

export type ScannedApp = { name: string; path: string; category: string };

export type Session = {
  id: string;
  appId: string;
  startedAt: number;
  endedAt?: number;
  pid?: number;
  note?: string;
  pausedAt?: number; // set while currently paused; cleared on resume/end
  pausedMs?: number; // accumulated total paused time, excluding any open pause
};

// ============================================================
// Courses
// ============================================================

export type TheoryLink = { label: string; url: string };

// A theory item is plain text (paragraphs separated by blank lines) plus
// an optional list of links out to videos or other resources — no
// markdown parser, just something simple a course author can hand-write.
export type TheoryItem = {
  type: 'theory';
  id: string;
  title: string;
  body: string;
  links?: TheoryLink[];
};

export type TaskCompletionMode = 'checkmark' | 'file-upload';

export type TaskItem = {
  type: 'task';
  id: string;
  title: string;
  description: string;
  completion: TaskCompletionMode;
  // For file-upload tasks: an optional subfolder path, relative to the
  // course's resolved files folder (Course.filesBaseFolder) — e.g.
  // "Lesson1". Omit it to upload straight into the course's base folder.
  folder?: string;
};

export type CourseItem = TheoryItem | TaskItem;

export type Lesson = {
  id: string;
  title: string;
  items: CourseItem[];
};

export type Course = {
  id: string;
  title: string;
  description?: string;
  lessons: Lesson[];
  // Whether picking a files folder (from Settings or freshly chosen) at
  // import time should auto-create a "<Course title>" subfolder inside
  // it, rather than using that folder directly. Defaults to true.
  autoCreateFolder?: boolean;
  // The actual, resolved, absolute base folder for this course's
  // file-upload tasks — set once at import time, not authored.
  filesBaseFolder?: string;
};

// The shape of the JSON file a course is authored/loaded from. Ids are
// deliberately absent here — they're generated at import time (see
// courses.ts) so course authors don't have to invent/maintain unique ids
// by hand.
export type CourseFileTheoryItem = { type: 'theory'; title: string; body: string; links?: TheoryLink[] };
export type CourseFileTaskItem = {
  type: 'task';
  title: string;
  description: string;
  completion: TaskCompletionMode;
  folder?: string;
};
export type CourseFileItem = CourseFileTheoryItem | CourseFileTaskItem;
export type CourseFileLesson = { title: string; items: CourseFileItem[] };
export type CourseFile = { title: string; description?: string; autoCreateFolder?: boolean; lessons: CourseFileLesson[] };

export type TaskProgressEntry = {
  completed: boolean;
  completedAt?: number;
  uploadedFileName?: string; // for file-upload tasks, whatever got copied in
};

// Keyed by item id — flat, since item ids are unique within a course
// regardless of which lesson they belong to.
export type CourseProgress = {
  theorySeen: Record<string, boolean>;
  taskProgress: Record<string, TaskProgressEntry>;
};