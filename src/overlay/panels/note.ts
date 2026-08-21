import type { Session } from '../../core/types';
import { saveNote } from '../actions';

let noteDebounce: ReturnType<typeof setTimeout> | null = null;

export function buildNoteContent(content: HTMLDivElement, session: Session) {
  content.innerHTML = '';
  const noteWrap = document.createElement('div');
  noteWrap.className = 'overlay-note';
  const noteField = document.createElement('textarea');
  noteField.className = 'overlay-note-textarea';
  noteField.placeholder = 'Notes for this session...';
  noteField.value = session.note || '';
  noteField.addEventListener('input', () => {
    if (noteDebounce) clearTimeout(noteDebounce);
    noteDebounce = setTimeout(() => saveNote(session.id, noteField.value), 400);
  });
  noteWrap.appendChild(noteField);
  content.appendChild(noteWrap);
}
