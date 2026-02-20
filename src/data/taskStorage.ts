import type { Task } from "@/domain/task";
import { TASK_STORAGE_VERSION } from "@/domain/task";

const STORAGE_KEY = "todo-vibe/tasks";

type StoredPayload = {
  version: number;
  tasks: Task[];
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function loadTasks(): Task[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as StoredPayload | Task[];

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && typeof parsed === "object" && Array.isArray(parsed.tasks)) {
      return parsed.tasks;
    }

    return [];
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  if (!isBrowser()) return;

  const payload: StoredPayload = {
    version: TASK_STORAGE_VERSION,
    tasks,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota or serialization errors
  }
}

