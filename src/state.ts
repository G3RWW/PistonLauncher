import type { AppEntry, View } from './types';
import { loadApps, loadCategories } from './storage';

export let apps: AppEntry[] = loadApps();
export let categories: string[] = loadCategories();

// Independent collapse state — sidebar and main library never share one Set.
export const libraryCollapsed = new Set<string>();
export const sidebarCollapsed = new Set<string>();

export let currentView: View = { type: 'library' };
export let tileIndex = 0;

// `apps`/`categories` are reassigned (not just mutated) in a couple of
// places — imported bindings can't be reassigned directly from other
// modules, so those spots go through these setters instead.
export function setApps(next: AppEntry[]) {
  apps = next;
}
export function setCategories(next: string[]) {
  categories = next;
}
export function setCurrentView(view: View) {
  currentView = view;
}
export function resetTileIndex() {
  tileIndex = 0;
}
export function nextTileIndex(): number {
  return tileIndex++;
}

export function formatPlaytime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}