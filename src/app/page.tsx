 "use client";

import { useEffect, useMemo, useState } from "react";
import type { Task, TaskView } from "@/domain/task";
import {
  createTask,
  isVisibleInView,
  matchesSearch,
  softDelete,
  toggleComplete,
  updateTitle,
} from "@/domain/task";
import { loadTasks, saveTasks } from "@/data/taskStorage";

const DEFAULT_VIEW: TaskView = "inbox";

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<TaskView>(DEFAULT_VIEW);
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

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
      const task = createTask(title);
      setTasks((prev) => [task, ...prev]);
      setNewTitle("");
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
              onClick={handleAddTask}
              className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              disabled={!newTitle.trim()}
            >
              添加
            </button>
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

