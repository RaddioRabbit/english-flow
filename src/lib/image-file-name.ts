import type { ModuleId } from "./task-store";

function createStableSuffix(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

function sanitizeAsciiSegment(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\u0020-\u007E]/g, "")
    .trim()
    .replace(/[\\/:*?"<>|#%&{}[\]()]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.+$/g, "")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");

  const compact = normalized.slice(0, 60);
  if (compact) {
    return compact;
  }

  return `${fallback}_${createStableSuffix(value)}`;
}

export function buildGeneratedImageFileName(bookName: string, moduleId: ModuleId, date: string) {
  const safeBookName = sanitizeAsciiSegment(bookName, "book");
  const safeDate = sanitizeAsciiSegment(date, "date");
  return `${safeBookName}_${moduleId}_${safeDate}.png`;
}
