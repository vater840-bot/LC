"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Folder as FolderIcon, X } from "lucide-react";
import type { Folder } from "@/lib/types";

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="lc-fade fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="lc-pop w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-md p-1 text-muted hover:bg-surface">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PromptDialog({
  title,
  label,
  initial = "",
  confirmText,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initial?: string;
  confirmText: string;
  onSubmit: (value: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    await onSubmit(value.trim());
    setBusy(false);
  }

  return (
    <Shell title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{label}</span>
          <input
            ref={ref}
            value={value}
            maxLength={120}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-brand"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-surface">
            Отмена
          </button>
          <button
            disabled={busy || !value.trim()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {confirmText}
          </button>
        </div>
      </form>
    </Shell>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmText,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Shell title={title} onClose={onClose}>
      <p className="text-sm text-muted">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-surface">
          Отмена
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
            setBusy(false);
          }}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
        >
          {confirmText}
        </button>
      </div>
    </Shell>
  );
}

export function MoveDialog({
  folders,
  blocked,
  count,
  onPick,
  onClose,
}: {
  folders: Folder[];
  blocked: Set<string>;
  count: number;
  onPick: (folderId: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  const children = (pid: string | null) =>
    folders
      .filter((f) => f.parent_id === pid && !blocked.has(f.id))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  function Branch({ pid, depth }: { pid: string | null; depth: number }) {
    return (
      <>
        {children(pid).map((f) => {
          const kids = children(f.id).length > 0;
          const isOpen = open.has(f.id);
          return (
            <div key={f.id}>
              <div
                className={`flex items-center gap-1 rounded-lg py-1.5 pr-2 text-sm ${
                  selected === f.id ? "bg-brand-soft text-brand-dark" : "hover:bg-surface"
                }`}
                style={{ paddingLeft: 6 + depth * 16 }}
              >
                <button
                  type="button"
                  aria-label={isOpen ? "Свернуть" : "Развернуть"}
                  className={`p-0.5 ${kids ? "" : "invisible"}`}
                  onClick={() =>
                    setOpen((s) => {
                      const n = new Set(s);
                      if (n.has(f.id)) n.delete(f.id);
                      else n.add(f.id);
                      return n;
                    })
                  }
                >
                  <ChevronRight className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-90" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(f.id)}
                  className="flex flex-1 items-center gap-2 truncate text-left"
                >
                  <FolderIcon className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.6} />
                  <span className="truncate">{f.name}</span>
                </button>
              </div>
              {isOpen && <Branch pid={f.id} depth={depth + 1} />}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <Shell title={`Переместить (${count})`} onClose={onClose}>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-line p-1">
        <Branch pid={null} depth={0} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-surface">
          Отмена
        </button>
        <button
          disabled={!selected || busy}
          onClick={async () => {
            if (!selected) return;
            setBusy(true);
            await onPick(selected);
            setBusy(false);
          }}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          Переместить сюда
        </button>
      </div>
    </Shell>
  );
}
