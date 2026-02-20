export type TaskId = string;

export type Task = {
  id: TaskId;
  title: string;
  completed: boolean;
  dueAt: string | null; // ISO string or null
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
};

export type TaskView = "inbox" | "today" | "upcoming" | "completed";

export const TASK_STORAGE_VERSION = 1;

export function createTask(title: string, now: Date = new Date()): Task {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Task title cannot be empty");
  }

  const id = crypto.randomUUID();
  const timestamp = now.toISOString();

  const { cleanTitle, tags } = extractTags(trimmed);

  return {
    id,
    title: cleanTitle || trimmed,
    completed: false,
    dueAt: null,
    tags,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: TASK_STORAGE_VERSION,
  };
}

export function toggleComplete(task: Task, now: Date = new Date()): Task {
  return {
    ...task,
    completed: !task.completed,
    updatedAt: now.toISOString(),
  };
}

export function updateTitle(task: Task, title: string, now: Date = new Date()): Task {
  const trimmed = title.trim();
  if (!trimmed) {
    return task;
  }
  const { cleanTitle, tags } = extractTags(trimmed);

  return {
    ...task,
    title: cleanTitle || trimmed,
    tags,
    updatedAt: now.toISOString(),
  };
}

export function softDelete(task: Task, now: Date = new Date()): Task {
  return {
    ...task,
    deletedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function setDueDate(task: Task, dueAt: Date | null, now: Date = new Date()): Task {
  return {
    ...task,
    dueAt: dueAt ? dueAt.toISOString() : null,
    updatedAt: now.toISOString(),
  };
}

export function isVisibleInView(task: Task, view: TaskView, now: Date = new Date()): boolean {
  if (task.deletedAt) return false;

  const dueDate = task.dueAt ? new Date(task.dueAt) : null;

  switch (view) {
    case "inbox":
      return !task.completed;
    case "completed":
      return task.completed;
    case "today":
      if (!dueDate) return false;
      return isSameDay(dueDate, now);
    case "upcoming":
      if (!dueDate) return false;
      return isWithinNextDays(dueDate, now, 7) && !isSameDay(dueDate, now);
    default:
      return true;
  }
}

export function matchesSearch(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (task.title.toLowerCase().includes(q)) return true;
  if (task.tags.some((tag) => tag.toLowerCase().includes(q))) return true;

  return false;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isWithinNextDays(date: Date, from: Date, days: number): boolean {
  const start = startOfDay(from).getTime();
  const end = startOfDay(addDays(from, days)).getTime();
  const time = date.getTime();
  return time > start && time < end;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function extractTags(raw: string): { cleanTitle: string; tags: string[] } {
  const words = raw.split(/\s+/);
  const tags: string[] = [];
  const titleWords: string[] = [];

  for (const w of words) {
    if (w.startsWith("#") && w.length > 1) {
      tags.push(w.slice(1));
    } else {
      titleWords.push(w);
    }
  }

  return {
    cleanTitle: titleWords.join(" ").trim(),
    tags,
  };
}

