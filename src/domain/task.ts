export type TaskId = string;

export type Task = {
  id: TaskId;
  title: string;
  completed: boolean;
  dueAt: string | null; // ISO string or null
  parentId: TaskId | null; // 父任务 ID，null 表示顶级任务
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
};

export type TaskView = "inbox" | "today" | "upcoming" | "completed" | "calendar";

export const TASK_STORAGE_VERSION = 1;

export function createTask(
  title: string,
  options?: { dueAt?: Date | null; parentId?: TaskId | null; now?: Date },
): Task {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Task title cannot be empty");
  }

  const now = options?.now ?? new Date();
  const id = crypto.randomUUID();
  const timestamp = now.toISOString();

  const { cleanTitle, tags } = extractTags(trimmed);

  return {
    id,
    title: cleanTitle || trimmed,
    completed: false,
    dueAt: options?.dueAt ? options.dueAt.toISOString() : null,
    parentId: options?.parentId ?? null,
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

export function setCompleted(
  task: Task,
  completed: boolean,
  now: Date = new Date(),
): Task {
  return {
    ...task,
    completed,
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
      // 无截止日期的任务（含已完成），完成后保留在列表中以删除线展示
      return !dueDate;
    case "completed":
      return task.completed;
    case "today":
      if (!dueDate) return false;
      return isSameDay(dueDate, now);
    case "upcoming":
      if (!dueDate) return false;
      return isWithinNextDays(dueDate, now, 7) && !isSameDay(dueDate, now);
    case "calendar":
      return false; // 日历视图单独渲染，不通过 visibleTasks
    default:
      return true;
  }
}

/** 取任务截止日期的本地日期字符串 YYYY-MM-DD，无 dueAt 返回 null */
export function getTaskDueDateKey(task: Task): string | null {
  if (!task.dueAt) return null;
  return task.dueAt.split("T")[0];
}

export function matchesSearch(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (task.title.toLowerCase().includes(q)) return true;
  if (task.tags.some((tag) => tag.toLowerCase().includes(q))) return true;

  return false;
}

/** 任务树节点，包含任务和子任务 */
export type TaskTreeNode = {
  task: Task;
  children: TaskTreeNode[];
  depth: number;
};

/** 构建任务树结构 */
export function buildTaskTree(tasks: Task[]): TaskTreeNode[] {
  const taskMap = new Map<TaskId, TaskTreeNode>();
  const roots: TaskTreeNode[] = [];

  // 第一遍：创建所有节点
  for (const task of tasks) {
    if (task.deletedAt) continue;
    taskMap.set(task.id, {
      task,
      children: [],
      depth: 0,
    });
  }

  // 第二遍：只建立父子关系，不在这里算 depth（避免子任务先于父任务被遍历时 depth 错误）
  for (const task of tasks) {
    if (task.deletedAt) continue;
    const node = taskMap.get(task.id)!;
    if (task.parentId && taskMap.has(task.parentId)) {
      const parent = taskMap.get(task.parentId)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 第三遍：从根开始遍历，正确计算每层 depth
  function assignDepth(nodes: TaskTreeNode[], depth: number): void {
    for (const node of nodes) {
      node.depth = depth;
      assignDepth(node.children, depth + 1);
    }
  }
  assignDepth(roots, 0);

  // 按创建时间排序：先添加的在上、后添加的在下
  function sortNodes(nodes: TaskTreeNode[]): TaskTreeNode[] {
    return nodes
      .sort((a, b) => a.task.createdAt.localeCompare(b.task.createdAt))
      .map((node) => ({
        ...node,
        children: sortNodes(node.children),
      }));
  }

  return sortNodes(roots);
}

/** 扁平化任务树（深度优先） */
export function flattenTaskTree(nodes: TaskTreeNode[]): TaskTreeNode[] {
  const result: TaskTreeNode[] = [];
  function traverse(node: TaskTreeNode) {
    result.push(node);
    for (const child of node.children) {
      traverse(child);
    }
  }
  for (const node of nodes) {
    traverse(node);
  }
  return result;
}

/** 获取任务的所有子任务 ID（递归） */
export function getAllDescendantIds(
  taskId: TaskId,
  tasks: Task[],
): Set<TaskId> {
  const result = new Set<TaskId>();
  function collect(id: TaskId) {
    for (const task of tasks) {
      if (task.parentId === id && !task.deletedAt) {
        result.add(task.id);
        collect(task.id);
      }
    }
  }
  collect(taskId);
  return result;
}

/** 获取任务的祖先 ID 列表（从父到根） */
export function getAncestorIds(taskId: TaskId, tasks: Task[]): TaskId[] {
  const result: TaskId[] = [];
  const task = tasks.find((t) => t.id === taskId && !t.deletedAt);
  if (!task?.parentId) return result;
  let currentId: TaskId | null = task.parentId;
  while (currentId) {
    const parent = tasks.find((t) => t.id === currentId && !t.deletedAt);
    if (!parent) break;
    result.push(parent.id);
    currentId = parent.parentId;
  }
  return result;
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

