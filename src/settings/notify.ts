import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';

// Ask once, up front, so permission is already sorted by the time a
// timer or reminder actually needs to fire — an OS prompt popping up at
// the exact moment focus ends would be a bad first impression.
let permissionReady: Promise<boolean> | null = null;
function ensurePermission(): Promise<boolean> {
  if (!permissionReady) {
    permissionReady = (async () => {
      try {
        if (await isPermissionGranted()) return true;
        const result = await requestPermission();
        return result === 'granted';
      } catch (err) {
        console.error('Failed to request notification permission:', err);
        return false;
      }
    })();
  }
  return permissionReady;
}
ensurePermission();

// System notification — this is what actually reaches the user when the
// overlay window is hidden, since a hidden webview has no visible UI to
// flash or highlight.
export async function notify(title: string, body: string) {
  try {
    if (await ensurePermission()) {
      sendNotification({ title, body });
    }
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}

// ---------------------------------------------------------------------
// Sound settings
// ---------------------------------------------------------------------

export type ChimeStyle = 'gentle' | 'classic' | 'ping' | 'custom' | 'none';

export const CHIME_STYLE_LABELS: Record<ChimeStyle, string> = {
  gentle: 'Gentle (default)',
  classic: 'Classic chime',
  ping: 'Quick ping',
  custom: 'Custom sound file',
  none: 'Off — notification only',
};

export type SoundSettings = {
  volume: number; // 0..1
  style: ChimeStyle;
  customPath: string | null; // absolute path to a user-picked audio file, used when style === 'custom'
};

const SOUND_SETTINGS_KEY = 'app-sound-settings';

// Gentle + a moderate volume is the default on purpose: a bright chime
// firing every 25 minutes gets grating fast. People who want something
// louder or sharper can change it from Settings > Sound.
const DEFAULT_SOUND_SETTINGS: SoundSettings = { volume: 0.35, style: 'gentle', customPath: null };

export function loadSoundSettings(): SoundSettings {
  const raw = localStorage.getItem(SOUND_SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SOUND_SETTINGS };
  try {
    return { ...DEFAULT_SOUND_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

export function saveSoundSettings(s: SoundSettings) {
  localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(s));
}

// Opens a native file picker for the user's own chime sound. Returns the
// picked path, or null if they cancelled or it failed.
export async function pickCustomChimeFile(): Promise<string | null> {
  try {
    const path = await open({
      multiple: false,
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] }],
    });
    return typeof path === 'string' ? path : null;
  } catch (err) {
    console.error('Failed to open sound file picker:', err);
    return null;
  }
}

// ---------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------

// A short audio cue as a second, harder-to-miss signal alongside the
// system notification. Runs even while the overlay window is hidden,
// since hiding it (as opposed to closing it) keeps this webview's JS —
// and its AudioContext — alive in the background.
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
  } catch (err) {
    console.error('Failed to create audio context:', err);
    return null;
  }
}

export type ChimeKind = 'focus-end' | 'break-end' | 'reminder';

// The "gentle" style: one calm tone per kind, just enough pitch
// difference to stay recognisable without being sharp. This is the
// default style.
const GENTLE_NOTES: Record<ChimeKind, number> = {
  'focus-end': 523.25, // C5
  'break-end': 392.0, // G4
  reminder: 440.0, // A4
};

// The original brighter triads, kept as an opt-in "classic" style.
const CLASSIC_NOTES: Record<ChimeKind, number[]> = {
  'focus-end': [880, 1108.73, 1318.51],
  'break-end': [659.25, 880],
  reminder: [988, 988],
};

function playTone(ctx: AudioContext, freq: number, startAt: number, peakGain: number, duration: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peakGain, startAt + Math.min(0.05, duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

function playSynthChime(kind: ChimeKind, style: 'gentle' | 'classic' | 'ping', volume: number) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (style === 'gentle') {
      playTone(ctx, GENTLE_NOTES[kind], ctx.currentTime, volume * 0.5, 0.9);
    } else if (style === 'ping') {
      playTone(ctx, 880, ctx.currentTime, volume * 0.5, 0.18);
    } else {
      CLASSIC_NOTES[kind].forEach((freq, i) => playTone(ctx, freq, ctx.currentTime + i * 0.16, volume * 0.6, 0.7));
    }
  } catch (err) {
    console.error('Failed to play chime:', err);
  }
}

// Reused across plays so rapid-fire reminders don't pile up players.
let customAudioEl: HTMLAudioElement | null = null;
function playCustomChime(path: string, volume: number) {
  try {
    if (!customAudioEl) customAudioEl = new Audio();
    customAudioEl.src = convertFileSrc(path);
    customAudioEl.volume = Math.max(0, Math.min(1, volume));
    customAudioEl.currentTime = 0;
    void customAudioEl.play().catch((err) => console.error('Failed to play custom chime:', err));
  } catch (err) {
    console.error('Failed to play custom chime:', err);
  }
}

// Plays the alert sound for a finished timer/reminder, honoring the
// user's chosen style, volume, and (if set) custom sound file.
export function playChime(kind: ChimeKind) {
  const { volume, style, customPath } = loadSoundSettings();
  if (style === 'none' || volume <= 0) return;
  if (style === 'custom') {
    if (customPath) playCustomChime(customPath, volume);
    else playSynthChime(kind, 'gentle', volume); // no file chosen yet — fall back quietly
    return;
  }
  playSynthChime(kind, style, volume);
}