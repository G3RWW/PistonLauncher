# Course templates

Courses are loaded from a plain JSON file via **File → Load Course...** — nothing needs to be built or compiled. This folder has three starting points:

| File | What it's for |
|---|---|
| `blank-skeleton.json` | The smallest valid course — one lesson, one theory item, one task. Start here for a real course of your own. |
| `color-theory-example.json` | A fuller worked example (2 lessons, both task types, video links) — read this to see every feature in context. |
| `test-course.json` | A course specifically built to exercise every behavior at once (sequencing, both completion types, cross-lesson locking) — load this to sanity-check the feature itself, not to learn the schema from. |

## Schema

```jsonc
{
  "title": "Course title",                 // required
  "description": "One-line summary",       // optional
  "autoCreateFolder": true,                 // optional, default true — see "File-upload folders" below
  "lessons": [                              // required, at least one
    {
      "title": "Lesson title",              // required
      "items": [                            // required, at least one
        {
          "type": "theory",                 // required
          "title": "Item title",            // required
          "body": "Plain text body.\n\nBlank line = new paragraph.",  // required
          "links": [                         // optional
            { "label": "Video label", "url": "https://..." }
          ]
        },
        {
          "type": "task",                   // required
          "title": "Item title",            // required
          "description": "What to do.",     // required
          "completion": "checkmark",        // required: "checkmark" or "file-upload"
          "folder": "Lesson1"                // optional, file-upload only — see below
        }
      ]
    }
  ]
}
```

You never invent ids — they're generated automatically the moment a course is loaded, and stay stable across app restarts.

## Sequencing

Items unlock **strictly in order across the whole course** — lesson boundaries don't reset anything. Item 5 doesn't unlock until items 1–4 are all satisfied, whether that's four theory items, four tasks, or a mix. This is what guarantees a task is never shown before its theory: put the theory item(s) a task depends on earlier in the same `items` array (or an earlier lesson).

- A `theory` item is "satisfied" once the learner clicks "I've read this."
- A `task` item is "satisfied" once it's checked off or its file is uploaded.

## File-upload folders

Unlike everything else in the file, a file-upload task's actual destination folder is **not written here as an absolute path** — it's resolved when the course is loaded, based on where you point it at import time (either the Courses folder from Settings, or a folder you pick just for that course). This avoids baking in a path that only exists on the author's machine.

- `autoCreateFolder` (course-level, defaults to `true`): whether a subfolder named after the course gets created automatically inside whichever base folder is chosen. Set to `false` if you want uploads to go straight into the chosen folder with no extra nesting.
- `folder` (per-task, optional): a subfolder path *relative to the course's resolved folder* — e.g. `"Lesson1"` groups that lesson's uploads together. Omit it entirely to have that task's file land straight in the course's folder.
- Tasks with `"completion": "checkmark"` ignore `folder` completely — it's only relevant to `"completion": "file-upload"`.

## Tips

- Keep one task's theory dependency directly before it in the same lesson where possible — it makes the course easier to reason about than depending on something several lessons back.
- `links` on a theory item are optional and can be an empty array or omitted entirely if there's nothing to link out to.
- There's no length limit on `body`, but very long text will scroll rather than paginate — consider splitting a long topic into multiple theory items instead of one huge one.
