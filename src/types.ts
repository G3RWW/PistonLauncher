export type AppEntry = {
  id: string;
  name: string;
  path: string;
  category: string;
  lastPlayed?: number;
  icon?: string; // base64 image data
  launchFailed?: boolean; // true if the last launch attempt errored (likely moved/uninstalled)
};

export type View = { type: 'library' } | { type: 'app'; id: string } | { type: 'stats' };

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