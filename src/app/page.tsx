 "use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskView } from "@/domain/task";
import {
  createTask,
  isVisibleInView,
  matchesSearch,
  setDueDate,
  softDelete,
  toggleComplete,
  updateTitle,
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

  const visibleTasks = useMemo(
    () => tasks.filter((t) => isVisibleInView(t, view) && matchesSearch(t, query)),
    [tasks, view, query],
  );

  function handleAddTask() {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const dueAt = newDueDate ? parseLocalDate(newDueDate) : null;
      const task = createTask(title, { dueAt });
      setTasks((prev) => [task, ...prev]);
      setNewTitle("");
      setNewDueDate("");
    } catch {
      // ignore invalid
    }
  }

  function handleToggleComplete(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? toggleComplete(t) : t)));
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? softDelete(t) : t)));
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
    setEditingDueDate(task.dueAt ? task.dueAt.split("T")[0] : "");
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
                onClick={handleAddTask}
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
          {visibleTasks.length === 0 ? (
            <EmptyState view={view} />
          ) : (
            <ul className="flex flex-col gap-1">
              {visibleTasks.map((task) => (
                <li
                  key={task.id}
                  className="group flex items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-zinc-50"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleComplete(task.id)}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-300 text-xs text-zinc-500 transition group-hover:border-zinc-400"
                    aria-label={task.completed ? "标记为未完成" : "标记为完成"}
                  >
                    {task.completed ? "✓" : ""}
                  </button>

                  <div
                    className="flex-1 cursor-text"
                    onDoubleClick={() => handleStartEdit(task)}
                  >
                    {editingId === task.id ? (
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={handleCommitEdit}
                        onKeyDown={handleKeyDownEdit}
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          {editingDueId === task.id ? (
                            <input
                              type="date"
                              data-task-id={task.id}
                              value={editingDueDate}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditingDueDate(v);
                                // 日历选择会一次性给出完整 YYYY-MM-DD，直接保存并关闭
                                if (/^\d{4}-\d{2}-\d{2}$/.test(v) || v === "") {
                                  commitDueEditWithValue(task.id, v);
                                }
                              }}
                              onBlur={() => commitDueEdit(task.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  commitDueEdit(task.id);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  setEditingDueId(null);
                                  setEditingDueDate("");
                                }
                              }}
                              autoFocus
                              className="rounded-lg border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-700 outline-none focus:border-zinc-300"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => openDueEditor(task)}
                              className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-200"
                            >
                              📅 {task.dueAt ? formatDueDate(task.dueAt) : "设置日期"}
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
                    onClick={() => handleDelete(task.id)}
                    className="invisible ml-1 rounded-full px-2 py-1 text-xs text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-red-500 group-hover:visible group-hover:opacity-100"
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
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

