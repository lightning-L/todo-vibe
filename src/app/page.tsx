 "use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskView } from "@/domain/task";
import {
  buildTaskTree,
  createTask,
  getAllDescendantIds,
  getAncestorIds,
  getAncestorTitles,
  getEffectiveDueDate,
  getTaskDueDateKey,
  isVisibleInView,
  matchesSearch,
  setCompleted,
  setDueDate,
  softDelete,
  toggleComplete,
  updateTitle,
  type TaskTreeNode,
} from "@/domain/task";
import { loadTasks, saveTasks } from "@/data/taskStorage";

const DEFAULT_VIEW: TaskView = "inbox";

/** 将 YYYY-MM-DD 解析为本地日期（避免被当作 UTC 午夜导致时区差一天） */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<TaskView>(DEFAULT_VIEW);
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState<string>("");
  const newDueDateInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDueId, setEditingDueId] = useState<string | null>(null);
  const [editingDueDate, setEditingDueDate] = useState("");
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [calendarFocusedDate, setCalendarFocusedDate] = useState(() => new Date());
  const [calendarViewMode, setCalendarViewMode] = useState<"day" | "week" | "month">("month");

  // 初始加载
  useEffect(() => {
    const initial = loadTasks();
    setTasks(initial);
  }, []);

  // 持久化
  useEffect(() => {
    if (tasks.length === 0) {
      saveTasks([]);
    } else {
      saveTasks(tasks);
    }
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter(
      (t) => isVisibleInView(t, view, new Date(), tasks) && matchesSearch(t, query),
    );
    return buildTaskTree(filtered);
  }, [tasks, view, query]);

  /** 日历视图：按有效截止日期分组，仅显示叶子任务（无子任务） */
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    const hasChildren = (task: Task) =>
      tasks.some((other) => !other.deletedAt && other.parentId === task.id);
    for (const t of tasks) {
      if (t.deletedAt) continue;
      if (!matchesSearch(t, query)) continue;
      if (hasChildren(t)) continue;
      const key = getTaskDueDateKey(t, tasks);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks, query]);

  function handleAddTask(parentId?: string | null) {
    const title = parentId ? subtaskTitle.trim() : newTitle.trim();
    if (!title) return;
    try {
      const dueAt = newDueDate ? parseLocalDate(newDueDate) : null;
      const task = createTask(title, { dueAt, parentId: parentId ?? null });
      setTasks((prev) => [task, ...prev]);
      if (parentId) {
        setSubtaskTitle("");
        setAddingSubtaskFor(null);
        setExpandedTasks((prev) => new Set(prev).add(parentId));
      } else {
        setNewTitle("");
        setNewDueDate("");
      }
    } catch {
      // ignore invalid
    }
  }

  function handleToggleComplete(id: string) {
    setTasks((prev) => {
      let next = prev.map((t) => (t.id === id ? toggleComplete(t) : t));
      // 若当前任务变为完成，检查祖先：当某祖先的全部子任务都完成时，将该祖先也标为完成
      const ancestorIds = getAncestorIds(id, next);
      for (const aid of ancestorIds) {
        const descIds = getAllDescendantIds(aid, next);
        // 只判断「所有子任务是否都完成」，不要求父任务本身已勾选
        const allDescendantsDone =
          descIds.size > 0 &&
          [...descIds].every(
            (tid) => next.find((t) => t.id === tid)?.completed,
          );
        const ancestor = next.find((t) => t.id === aid);
        if (allDescendantsDone && ancestor && !ancestor.completed) {
          next = next.map((t) => (t.id === aid ? setCompleted(t, true) : t));
        }
      }
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleDelete(id: string) {
    const descendants = getAllDescendantIds(id, tasks);
    const totalCount = 1 + descendants.size;
    const message =
      totalCount > 1
        ? `确定删除该任务及其 ${descendants.size} 项子任务吗？共 ${totalCount} 项。`
        : "确定删除该任务吗？";
    if (!window.confirm(message)) return;

    const toDelete = new Set([id, ...descendants]);
    setTasks((prev) =>
      prev.map((t) => (toDelete.has(t.id) ? softDelete(t) : t)),
    );
  }

  function handleStartEdit(task: Task) {
    setEditingId(task.id);
    setEditingTitle(task.title);
  }

  function handleCommitEdit() {
    if (!editingId) return;
    const title = editingTitle.trim();
    if (!title) {
      setEditingId(null);
      setEditingTitle("");
      return;
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === editingId ? updateTitle(t, title) : t)),
    );
    setEditingId(null);
    setEditingTitle("");
  }

  function handleKeyDownNew(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTask();
    }
  }

  function handleKeyDownEdit(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommitEdit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setEditingId(null);
      setEditingTitle("");
    }
  }

  function openDueEditor(task: Task) {
    setEditingDueId(task.id);
    const effective = task.dueAt || getEffectiveDueDate(task, tasks);
    setEditingDueDate(effective ? effective.split("T")[0] : "");
    // 延迟一帧，确保 input 已渲染，然后尝试打开日历选择器
    setTimeout(() => {
      const input = document.querySelector(
        `input[type="date"][data-task-id="${task.id}"]`,
      ) as HTMLInputElement | null;
      if (input) {
        input.focus();
        // 如果浏览器支持 showPicker API，直接打开日历
        if ("showPicker" in input && typeof input.showPicker === "function") {
          try {
            input.showPicker();
          } catch {
            // 某些浏览器可能不支持或需要用户手势，忽略错误
          }
        }
      }
    }, 0);
  }

  function commitDueEdit(taskId: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? setDueDate(t, editingDueDate ? parseLocalDate(editingDueDate) : null)
          : t,
      ),
    );
    setEditingDueId(null);
    setEditingDueDate("");
  }

  /** 用指定日期值保存并关闭（日历选择后直接调用，无需再按回车） */
  function commitDueEditWithValue(taskId: string, value: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? setDueDate(t, value ? parseLocalDate(value) : null)
          : t,
      ),
    );
    setEditingDueId(null);
    setEditingDueDate("");
  }

  const activeCount = tasks.filter((t) => !t.completed && !t.deletedAt).length;

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-6 font-sans text-zinc-900 antialiased sm:px-6 sm:py-10">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-3xl bg-white/90 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.12)] backdrop-blur-md sm:p-6">
        <header className="flex items-baseline justify-between gap-2">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
              Todo Vibe
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              长期个人待办 · 轻盈 Apple 风
            </p>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
            {activeCount} 个待办
          </span>
        </header>

        <section className="mt-1 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-2xl bg-zinc-100/80 px-3 py-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={handleKeyDownNew}
                placeholder="添加任务，然后回车（支持 #tag）"
                className="flex-1 border-none bg-transparent text-[15px] outline-none placeholder:text-zinc-400"
              />
              <button
                type="button"
                onClick={() => {
                  if (newDueDateInputRef.current) {
                    newDueDateInputRef.current.focus();
                    if (
                      "showPicker" in newDueDateInputRef.current &&
                      typeof newDueDateInputRef.current.showPicker === "function"
                    ) {
                      try {
                        newDueDateInputRef.current.showPicker();
                      } catch {
                        // 某些浏览器可能不支持或需要用户手势，忽略错误
                      }
                    }
                  }
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  newDueDate
                    ? "bg-zinc-900 text-white shadow-sm hover:bg-zinc-800"
                    : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
                }`}
                title="选择截止日期"
              >
                📅
              </button>
              <input
                ref={newDueDateInputRef}
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="sr-only"
                aria-label="截止日期"
                min={new Date().toISOString().split("T")[0]}
              />
              <button
                type="button"
                onClick={() => handleAddTask()}
                className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                disabled={!newTitle.trim()}
              >
                添加
              </button>
            </div>
            {newDueDate && (
              <div className="flex items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2">
                <span className="text-xs text-zinc-600">截止日期：</span>
                <span className="text-xs font-medium text-zinc-900">
                  {formatDueDate(parseLocalDate(newDueDate).toISOString())}
                </span>
                <button
                  type="button"
                  onClick={() => setNewDueDate("")}
                  className="ml-auto rounded-full px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200"
                >
                  清除
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <nav className="inline-flex rounded-full bg-zinc-100 p-1 text-xs font-medium text-zinc-600">
              <ViewChip label="Inbox" value="inbox" current={view} onChange={setView} />
              <ViewChip label="Today" value="today" current={view} onChange={setView} />
              <ViewChip
                label="Upcoming"
                value="upcoming"
                current={view}
                onChange={setView}
              />
              <ViewChip
                label="Completed"
                value="completed"
                current={view}
                onChange={setView}
              />
              <ViewChip
                label="Calendar"
                value="calendar"
                current={view}
                onChange={setView}
              />
            </nav>

            <div className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 text-xs text-zinc-500">
              <span className="hidden sm:inline">搜索</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="标题或标签"
                className="min-w-0 flex-1 border-none bg-transparent text-xs outline-none placeholder:text-zinc-400"
              />
            </div>
          </div>
        </section>

        <section className="mt-2">
          {view === "calendar" ? (
            <CalendarView
              tasks={tasks}
              focusedDate={calendarFocusedDate}
              setFocusedDate={setCalendarFocusedDate}
              viewMode={calendarViewMode}
              setViewMode={setCalendarViewMode}
              tasksByDate={tasksByDate}
              formatDueDate={formatDueDate}
              onToggleComplete={handleToggleComplete}
              onStartEdit={handleStartEdit}
              onDelete={handleDelete}
              editingId={editingId}
              editingTitle={editingTitle}
              onSetEditingTitle={setEditingTitle}
              onCommitEdit={handleCommitEdit}
              onKeyDownEdit={handleKeyDownEdit}
            />
          ) : visibleTasks.length === 0 ? (
            <EmptyState view={view} />
          ) : (
            <TaskList
              tasks={tasks}
              nodes={visibleTasks}
              expandedTasks={expandedTasks}
              editingId={editingId}
              editingTitle={editingTitle}
              editingDueId={editingDueId}
              editingDueDate={editingDueDate}
              addingSubtaskFor={addingSubtaskFor}
              subtaskTitle={subtaskTitle}
              onToggleComplete={handleToggleComplete}
              onToggleExpand={toggleExpand}
              onStartEdit={handleStartEdit}
              onCommitEdit={handleCommitEdit}
              onKeyDownEdit={handleKeyDownEdit}
              onSetEditingTitle={setEditingTitle}
              onOpenDueEditor={openDueEditor}
              onCommitDueEdit={commitDueEdit}
              onCommitDueEditWithValue={commitDueEditWithValue}
              onSetEditingDueDate={setEditingDueDate}
              onDelete={handleDelete}
              onSetAddingSubtaskFor={setAddingSubtaskFor}
              onSetSubtaskTitle={setSubtaskTitle}
              onAddSubtask={handleAddTask}
              formatDueDate={formatDueDate}
            />
          )}
        </section>
      </main>
    </div>
  );
}

type ViewChipProps = {
  label: string;
  value: TaskView;
  current: TaskView;
  onChange: (view: TaskView) => void;
};

function ViewChip({ label, value, current, onChange }: ViewChipProps) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`rounded-full px-3 py-1 transition ${
        active
          ? "bg-white text-zinc-900 shadow-sm"
          : "text-zinc-500 hover:bg-white/80 hover:text-zinc-900"
      }`}
    >
      {label}
    </button>
  );
}

function formatDueDate(isoString: string): string {
  const datePart = isoString.split("T")[0];
  const date = parseLocalDate(datePart);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (isSameDay(date, today)) {
    return "今天";
  } else if (isSameDay(date, tomorrow)) {
    return "明天";
  } else {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type TaskListProps = {
  tasks: Task[];
  nodes: TaskTreeNode[];
  expandedTasks: Set<string>;
  editingId: string | null;
  editingTitle: string;
  editingDueId: string | null;
  editingDueDate: string;
  addingSubtaskFor: string | null;
  subtaskTitle: string;
  onToggleComplete: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onStartEdit: (task: Task) => void;
  onCommitEdit: () => void;
  onKeyDownEdit: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSetEditingTitle: (title: string) => void;
  onOpenDueEditor: (task: Task) => void;
  onCommitDueEdit: (taskId: string) => void;
  onCommitDueEditWithValue: (taskId: string, value: string) => void;
  onSetEditingDueDate: (value: string) => void;
  onDelete: (id: string) => void;
  onSetAddingSubtaskFor: (id: string | null) => void;
  onSetSubtaskTitle: (title: string) => void;
  onAddSubtask: (parentId: string) => void;
  formatDueDate: (isoString: string) => string;
};

function TaskList({
  tasks,
  nodes,
  expandedTasks,
  editingId,
  editingTitle,
  editingDueId,
  editingDueDate,
  addingSubtaskFor,
  subtaskTitle,
  onToggleComplete,
  onToggleExpand,
  onStartEdit,
  onCommitEdit,
  onKeyDownEdit,
  onSetEditingTitle,
  onOpenDueEditor,
  onCommitDueEdit,
  onCommitDueEditWithValue,
  onSetEditingDueDate,
  onDelete,
  onSetAddingSubtaskFor,
  onSetSubtaskTitle,
  onAddSubtask,
  formatDueDate,
}: TaskListProps) {
  return (
    <ul className="flex flex-col gap-1">
      {nodes.map((node) => {
        const task = node.task;
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedTasks.has(task.id);
        const isParentExpanded = node.depth === 0 || expandedTasks.has(task.parentId!);

        // 如果父任务折叠，不显示子任务
        if (node.depth > 0 && !isParentExpanded) {
          return null;
        }

        return (
          <React.Fragment key={task.id}>
            <li
              className="group flex items-center gap-2 rounded-2xl px-2 py-1.5 hover:bg-zinc-50"
              style={
                node.depth > 0
                  ? { paddingLeft: `${8 + node.depth * 24}px` }
                  : undefined
              }
            >
              {hasChildren && (
                <button
                  type="button"
                  onClick={() => onToggleExpand(task.id)}
                  className="flex h-4 w-4 items-center justify-center text-xs text-zinc-400 hover:text-zinc-600"
                  aria-label={isExpanded ? "折叠" : "展开"}
                >
                  {isExpanded ? "▼" : "▶"}
                </button>
              )}
              {!hasChildren && <div className="w-4" />}

              <button
                type="button"
                onClick={() => onToggleComplete(task.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-xs text-zinc-500 transition group-hover:border-zinc-400"
                aria-label={task.completed ? "标记为未完成" : "标记为完成"}
              >
                {task.completed ? "✓" : ""}
              </button>

              <div
                className="flex-1 cursor-text"
                onDoubleClick={() => onStartEdit(task)}
              >
                {editingId === task.id ? (
                  <input
                    autoFocus
                    value={editingTitle}
                    onChange={(e) => onSetEditingTitle(e.target.value)}
                    onBlur={onCommitEdit}
                    onKeyDown={onKeyDownEdit}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[15px] outline-none ring-0 focus:border-zinc-300"
                  />
                ) : (
                  <div className="flex flex-col gap-1">
                    <p
                      className={`text-[15px] leading-snug ${
                        task.completed
                          ? "text-zinc-400 line-through"
                          : "text-zinc-900"
                      }`}
                    >
                      {task.title}
                    </p>
                    {getAncestorTitles(task, tasks).length > 0 && (
                      <p className="text-[11px] text-zinc-400">
                        {getAncestorTitles(task, tasks).join(" | ")}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {editingDueId === task.id ? (
                        <input
                          type="date"
                          data-task-id={task.id}
                          value={editingDueDate}
                          onChange={(e) => {
                            const v = e.target.value;
                            onSetEditingDueDate(v);
                            if (/^\d{4}-\d{2}-\d{2}$/.test(v) || v === "") {
                              onCommitDueEditWithValue(task.id, v);
                            }
                          }}
                          onBlur={() => onCommitDueEdit(task.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              onCommitDueEdit(task.id);
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              onSetEditingDueDate("");
                            }
                          }}
                          autoFocus
                          className="rounded-lg border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-700 outline-none focus:border-zinc-300"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenDueEditor(task)}
                          className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-200"
                        >
                          📅{getEffectiveDueDate(task, tasks)
                              ? ` ${formatDueDate(getEffectiveDueDate(task, tasks)!)}`
                              : ""}
                        </button>
                      )}
                      {task.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onSetAddingSubtaskFor(task.id)}
                className="invisible ml-1 flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-blue-500 group-hover:visible group-hover:opacity-100"
                title="添加子任务"
              >
                +
              </button>

              <button
                type="button"
                onClick={() => onDelete(task.id)}
                className="invisible ml-1 rounded-full px-2 py-1 text-xs text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-red-500 group-hover:visible group-hover:opacity-100"
              >
                删除
              </button>
            </li>

            {addingSubtaskFor === task.id && (
              <li
                className="flex items-center gap-2 rounded-2xl bg-zinc-50 px-2 py-1.5"
                style={{ paddingLeft: `${8 + (node.depth + 1) * 24}px` }}
              >
                <div className="w-4" />
                <div className="w-5" />
                <input
                  autoFocus
                  value={subtaskTitle}
                  onChange={(e) => onSetSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAddSubtask(task.id);
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      onSetAddingSubtaskFor(null);
                      onSetSubtaskTitle("");
                    }
                  }}
                  onBlur={() => {
                    if (subtaskTitle.trim()) {
                      onAddSubtask(task.id);
                    } else {
                      onSetAddingSubtaskFor(null);
                    }
                  }}
                  placeholder="输入子任务标题..."
                  className="flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[15px] outline-none ring-0 focus:border-zinc-300"
                />
              </li>
            )}

            {hasChildren && isExpanded && (
              <TaskList
                tasks={tasks}
                nodes={node.children}
                expandedTasks={expandedTasks}
                editingId={editingId}
                editingTitle={editingTitle}
                editingDueId={editingDueId}
                editingDueDate={editingDueDate}
                addingSubtaskFor={addingSubtaskFor}
                subtaskTitle={subtaskTitle}
                onToggleComplete={onToggleComplete}
                onToggleExpand={onToggleExpand}
                onStartEdit={onStartEdit}
                onCommitEdit={onCommitEdit}
                onKeyDownEdit={onKeyDownEdit}
                onSetEditingTitle={onSetEditingTitle}
                onOpenDueEditor={onOpenDueEditor}
                onCommitDueEdit={onCommitDueEdit}
                onCommitDueEditWithValue={onCommitDueEditWithValue}
                onSetEditingDueDate={onSetEditingDueDate}
                onDelete={onDelete}
                onSetAddingSubtaskFor={onSetAddingSubtaskFor}
                onSetSubtaskTitle={onSetSubtaskTitle}
                onAddSubtask={onAddSubtask}
                formatDueDate={formatDueDate}
              />
            )}
          </React.Fragment>
        );
      })}
    </ul>
  );
}

function toDateKey(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function getWeekStart(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  return x;
}

type CalendarViewProps = {
  tasks: Task[];
  focusedDate: Date;
  setFocusedDate: (d: Date) => void;
  viewMode: "day" | "week" | "month";
  setViewMode: (m: "day" | "week" | "month") => void;
  tasksByDate: Map<string, Task[]>;
  formatDueDate: (iso: string) => string;
  onToggleComplete: (id: string) => void;
  onStartEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  editingId: string | null;
  editingTitle: string;
  onSetEditingTitle: (title: string) => void;
  onCommitEdit: () => void;
  onKeyDownEdit: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

function CalendarTaskRow({
  task,
  ancestorTitles,
  editingId,
  editingTitle,
  onSetEditingTitle,
  onCommitEdit,
  onKeyDownEdit,
  onToggleComplete,
  onStartEdit,
  onDelete,
  compact,
}: {
  task: Task;
  ancestorTitles?: string[];
  editingId: string | null;
  editingTitle: string;
  onSetEditingTitle: (t: string) => void;
  onCommitEdit: () => void;
  onKeyDownEdit: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onToggleComplete: (id: string) => void;
  onStartEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}) {
  const isCompact = compact ?? false;
  const showAncestors = ancestorTitles && ancestorTitles.length > 0;
  return (
    <div
      className={`group flex items-start gap-1.5 rounded px-1.5 py-0.5 text-left hover:bg-zinc-100 ${
        isCompact ? "py-0.5" : "py-1"
      }`}
    >
      <button
        type="button"
        onClick={() => onToggleComplete(task.id)}
        className={`mt-0.5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-[10px] ${
          isCompact ? "flex h-3.5 w-3.5" : "flex h-4 w-4 text-xs"
        }`}
      >
        {task.completed ? "✓" : ""}
      </button>
      <div className="min-w-0 flex-1">
        <span
          className={`block truncate ${
            task.completed ? "text-zinc-400 line-through" : "text-zinc-800"
          } ${isCompact ? "text-[10px]" : "text-sm"}`}
          onDoubleClick={() => onStartEdit(task)}
          title={task.title}
        >
          {editingId === task.id ? (
            <input
              autoFocus
              value={editingTitle}
              onChange={(e) => onSetEditingTitle(e.target.value)}
              onBlur={onCommitEdit}
              onKeyDown={onKeyDownEdit}
              className="w-full truncate rounded border border-zinc-200 bg-white px-1 text-[10px]"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            task.title
          )}
        </span>
        {showAncestors && (
          <span
            className={`block truncate text-zinc-400 ${isCompact ? "text-[9px]" : "text-[10px]"}`}
            title={ancestorTitles.join(" | ")}
          >
            {ancestorTitles.join(" | ")}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        className="hidden shrink-0 rounded p-0.5 text-zinc-400 hover:bg-red-100 hover:text-red-500 group-hover:block"
      >
        ×
      </button>
    </div>
  );
}

function CalendarView({
  tasks,
  focusedDate,
  setFocusedDate,
  viewMode,
  setViewMode,
  tasksByDate,
  formatDueDate,
  onToggleComplete,
  onStartEdit,
  onDelete,
  editingId,
  editingTitle,
  onSetEditingTitle,
  onCommitEdit,
  onKeyDownEdit,
}: CalendarViewProps) {
  const today = new Date();
  const todayKey = toDateKey(today);

  const prev = () => {
    const next = new Date(focusedDate);
    if (viewMode === "day") next.setDate(next.getDate() - 1);
    else if (viewMode === "week") next.setDate(next.getDate() - 7);
    else next.setMonth(next.getMonth() - 1);
    setFocusedDate(next);
  };
  const next = () => {
    const next = new Date(focusedDate);
    if (viewMode === "day") next.setDate(next.getDate() + 1);
    else if (viewMode === "week") next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    setFocusedDate(next);
  };

  const title =
    viewMode === "day"
      ? `${focusedDate.getFullYear()}年${focusedDate.getMonth() + 1}月${focusedDate.getDate()}日`
      : viewMode === "week"
        ? (() => {
            const start = getWeekStart(new Date(focusedDate));
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
          })()
        : `${focusedDate.getFullYear()}年${focusedDate.getMonth() + 1}月`;

  return (
    <div className="rounded-2xl bg-zinc-50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-200"
          >
            ‹
          </button>
          <span className="min-w-[140px] text-center text-sm font-semibold text-zinc-900">
            {title}
          </span>
          <button
            type="button"
            onClick={next}
            className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-200"
          >
            ›
          </button>
        </div>
        <nav className="inline-flex rounded-lg bg-zinc-200 p-0.5 text-xs font-medium text-zinc-600">
          {(["day", "week", "month"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-md px-2.5 py-1 transition ${
                viewMode === mode ? "bg-white text-zinc-900 shadow-sm" : "hover:bg-white/60"
              }`}
            >
              {mode === "day" ? "日" : mode === "week" ? "周" : "月"}
            </button>
          ))}
        </nav>
      </div>

      {viewMode === "day" && (
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div
            className={`mb-2 text-sm font-semibold ${
              todayKey === toDateKey(focusedDate) ? "text-blue-600" : "text-zinc-700"
            }`}
          >
            {formatDueDate(`${toDateKey(focusedDate)}T00:00:00.000Z`)}
          </div>
          <div className="space-y-0.5">
            {(tasksByDate.get(toDateKey(focusedDate)) ?? []).map((task) => (
              <CalendarTaskRow
                key={task.id}
                task={task}
                ancestorTitles={getAncestorTitles(task, tasks)}
                editingId={editingId}
                editingTitle={editingTitle}
                onSetEditingTitle={onSetEditingTitle}
                onCommitEdit={onCommitEdit}
                onKeyDownEdit={onKeyDownEdit}
                onToggleComplete={onToggleComplete}
                onStartEdit={onStartEdit}
                onDelete={onDelete}
                compact={false}
              />
            ))}
          </div>
        </div>
      )}

      {viewMode === "week" && (
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
            <div key={w} className="py-1 font-medium text-zinc-500">
              {w}
            </div>
          ))}
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(getWeekStart(new Date(focusedDate)));
            d.setDate(d.getDate() + i);
            const dateKey = toDateKey(d);
            const dayTasks = tasksByDate.get(dateKey) ?? [];
            const isToday = dateKey === todayKey;
            return (
              <div
                key={dateKey}
                className={`min-h-[80px] rounded-lg border p-1.5 ${
                  isToday ? "border-blue-300 bg-blue-50/50" : "border-zinc-200 bg-white"
                }`}
              >
                <div
                  className={`mb-1 text-right text-[11px] ${
                    isToday ? "font-semibold text-blue-600" : "text-zinc-700"
                  }`}
                >
                  {d.getDate()}
                </div>
                <div className="space-y-0.5">
                  {dayTasks.map((task) => (
                    <CalendarTaskRow
                      key={task.id}
                      task={task}
                      ancestorTitles={getAncestorTitles(task, tasks)}
                      editingId={editingId}
                      editingTitle={editingTitle}
                      onSetEditingTitle={onSetEditingTitle}
                      onCommitEdit={onCommitEdit}
                      onKeyDownEdit={onKeyDownEdit}
                      onToggleComplete={onToggleComplete}
                      onStartEdit={onStartEdit}
                      onDelete={onDelete}
                      compact
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "month" && (() => {
        const year = focusedDate.getFullYear();
        const month = focusedDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days: (number | null)[] = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let d = 1; d <= daysInMonth; d++) days.push(d);
        return (
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
              <div key={w} className="py-1 font-medium text-zinc-500">
                {w}
              </div>
            ))}
            {days.map((d, i) => {
              if (d === null) {
                return <div key={`e-${i}`} className="min-h-[60px]" />;
              }
              const dateKey =
                year +
                "-" +
                String(month + 1).padStart(2, "0") +
                "-" +
                String(d).padStart(2, "0");
              const dayTasks = tasksByDate.get(dateKey) ?? [];
              const isToday = dateKey === todayKey;
              return (
                <div
                  key={dateKey}
                  className={`min-h-[60px] rounded-lg border p-1 ${
                    isToday ? "border-blue-300 bg-blue-50/50" : "border-zinc-200 bg-white"
                  }`}
                >
                  <div
                    className={`mb-1 text-right ${
                      isToday ? "font-semibold text-blue-600" : "text-zinc-700"
                    }`}
                  >
                    {d}
                  </div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map((task) => (
                      <CalendarTaskRow
                        key={task.id}
                        task={task}
                        ancestorTitles={getAncestorTitles(task, tasks)}
                        editingId={editingId}
                        editingTitle={editingTitle}
                        onSetEditingTitle={onSetEditingTitle}
                        onCommitEdit={onCommitEdit}
                        onKeyDownEdit={onKeyDownEdit}
                        onToggleComplete={onToggleComplete}
                        onStartEdit={onStartEdit}
                        onDelete={onDelete}
                        compact
                      />
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="text-[10px] text-zinc-400">
                        +{dayTasks.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

function EmptyState({ view }: { view: TaskView }) {
  let title = "轻轻一敲，开始记录你的想法";
  let hint = "试着输入一个任务标题，然后按回车。";

  if (view === "today") {
    title = "今天暂时没有任务";
    hint = "为任务设置日期后会出现在这里。";
  } else if (view === "upcoming") {
    title = "接下来 7 天很空闲";
    hint = "规划一些未来要做的事吧。";
  } else if (view === "completed") {
    title = "还没有完成的记录";
    hint = "完成任务后会出现在这里。";
  }

  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
      <p className="text-[15px] font-medium text-zinc-600">{title}</p>
      <p className="text-xs text-zinc-400">{hint}</p>
    </div>
  );
}

