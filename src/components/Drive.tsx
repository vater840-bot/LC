"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Menu,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
  Upload,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { FileRow, Folder } from "@/lib/types";
import { escapeLike, fileKind, formatBytes, formatDate, kindLabel, type Kind } from "@/lib/utils";
import { KindIcon } from "./FileIcon";
import { ConfirmDialog, MoveDialog, PromptDialog } from "./Dialogs";
import { Preview } from "./Preview";

const BUCKET = "lc-files";
const PAGE = 100;

type View = { type: "folder"; id: string | null } | { type: "recent" };
type Sort = "date" | "name" | "type";
type Sel = { kind: "file" | "folder"; id: string };
type Upload = { id: string; name: string; progress: number; status: "run" | "done" | "error"; error?: string };
type Toast = { id: number; text: string; error?: boolean };
type Dialog =
  | { t: "newFolder" }
  | { t: "rename"; target: Sel; name: string }
  | { t: "move"; targets: Sel[] }
  | { t: "delete"; targets: Sel[] }
  | null;

const key = (s: Sel) => `${s.kind}:${s.id}`;
const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

function hasFiles(e: React.DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

function dbError(message: string, code?: string) {
  if (code === "23505") return "Папка с таким названием уже существует.";
  return message;
}

export function Drive({ email, name }: { email: string; name: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>({ type: "folder", id: null });
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("date");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, Sel>>(new Map());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [dropFolder, setDropFolder] = useState<string | null>(null);

  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const requested = useRef<Set<string>>(new Set());
  const reqId = useRef(0);

  const toast = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const searching = query.length > 0;
  const currentFolderId = view.type === "folder" ? view.id : null;

  // ---------- data loading ----------
  const loadFolders = useCallback(async () => {
    const { data, error } = await supabase.from("folders").select("*").order("name");
    if (error) {
      setLoadError(error.message);
      return;
    }
    setFolders(data as Folder[]);
  }, [supabase]);

  const loadFiles = useCallback(async () => {
    const id = ++reqId.current;
    let q = supabase.from("files").select("*");

    if (searching) {
      q = q.ilike("name", `%${escapeLike(query)}%`).order("created_at", { ascending: false });
    } else if (view.type === "recent") {
      q = q.order("created_at", { ascending: false });
    } else if (view.id) {
      q = q.eq("folder_id", view.id);
      q =
        sort === "name"
          ? q.order("name", { ascending: true })
          : sort === "type"
            ? q.order("mime_type", { ascending: true }).order("name", { ascending: true })
            : q.order("created_at", { ascending: false });
    } else {
      if (id === reqId.current) {
        setFiles([]);
        setLoading(false);
      }
      return;
    }

    const { data, error } = await q.range(0, limit - 1);
    if (id !== reqId.current) return;
    if (error) {
      setLoadError(error.message);
    } else {
      setLoadError(null);
      setFiles(data as FileRow[]);
    }
    setLoading(false);
  }, [supabase, view, query, searching, sort, limit]);

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id, display_name, email");
    if (data) {
      setProfiles(
        Object.fromEntries(data.map((p) => [p.id, p.display_name || p.email?.split("@")[0] || "Участник"])),
      );
    }
  }, [supabase]);

  useEffect(() => {
    void loadFolders();
    void loadProfiles();
  }, [loadFolders, loadProfiles]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(queryInput.trim());
      setLimit(PAGE);
    }, 250);
    return () => clearTimeout(t);
  }, [queryInput]);

  // realtime sync between members
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    refreshRef.current = () => {
      void loadFolders();
      void loadFiles();
    };
  }, [loadFolders, loadFiles]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current(), 300);
    };
    const channel = supabase
      .channel("lc-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "folders" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "files" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void loadProfiles())
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, loadProfiles]);

  // thumbnails for visible images
  useEffect(() => {
    const need = files.filter(
      (f) => fileKind(f.mime_type, f.name) === "image" && !requested.current.has(f.id) && f.size < 15_000_000,
    );
    if (!need.length) return;
    need.forEach((f) => requested.current.add(f.id));
    (async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(
        need.map((f) => f.storage_path),
        3600,
      );
      if (!data) return;
      const next: Record<string, string> = {};
      data.forEach((d, i) => {
        if (d.signedUrl) next[need[i].id] = d.signedUrl;
      });
      setThumbs((t) => ({ ...t, ...next }));
    })();
  }, [files, supabase]);

  // close menu on outside click
  useEffect(() => {
    if (!menuFor) return;
    const h = () => setMenuFor(null);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [menuFor]);

  // ---------- derived ----------
  const visibleFolders = useMemo(() => {
    let list: Folder[];
    if (searching) {
      const q = query.toLowerCase();
      list = folders.filter((f) => f.name.toLowerCase().includes(q));
    } else if (view.type === "recent") {
      list = [];
    } else {
      list = folders.filter((f) => f.parent_id === view.id);
    }
    return [...list].sort((a, b) => collator.compare(a.name, b.name));
  }, [folders, view, query, searching]);

  const visibleFiles = useMemo(() => {
    if (searching || view.type === "recent") return files;
    const copy = [...files];
    if (sort === "name") copy.sort((a, b) => collator.compare(a.name, b.name));
    if (sort === "type")
      copy.sort(
        (a, b) =>
          collator.compare(kindLabel[fileKind(a.mime_type, a.name)], kindLabel[fileKind(b.mime_type, b.name)]) ||
          collator.compare(a.name, b.name),
      );
    return copy;
  }, [files, sort, searching, view]);

  const previewable = visibleFiles;
  const previewIndex = previewId ? previewable.findIndex((f) => f.id === previewId) : -1;

  const crumbs = useMemo(() => {
    const out: Folder[] = [];
    let cur = currentFolderId ? folderById.get(currentFolderId) : undefined;
    while (cur) {
      out.unshift(cur);
      cur = cur.parent_id ? folderById.get(cur.parent_id) : undefined;
    }
    return out;
  }, [currentFolderId, folderById]);

  const title = searching
    ? `Результаты: «${query}»`
    : view.type === "recent"
      ? "Недавно загруженные"
      : (crumbs[crumbs.length - 1]?.name ?? "Все папки");

  // ---------- navigation ----------
  function go(v: View) {
    setView(v);
    setQueryInput("");
    setQuery("");
    setLimit(PAGE);
    setLoading(true);
    setSelected(new Map());
    setDrawer(false);
  }

  function openFolder(id: string | null) {
    go({ type: "folder", id });
    if (id) {
      setExpanded((s) => {
        const n = new Set(s);
        let cur = folderById.get(id);
        while (cur?.parent_id) {
          n.add(cur.parent_id);
          cur = folderById.get(cur.parent_id);
        }
        return n;
      });
    }
  }

  // ---------- selection ----------
  function toggle(s: Sel) {
    setSelected((m) => {
      const n = new Map(m);
      if (n.has(key(s))) n.delete(key(s));
      else n.set(key(s), s);
      return n;
    });
  }

  // ---------- actions ----------
  async function download(f: FileRow) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 120, {
      download: f.name,
    });
    if (error || !data) return toast("Не удалось скачать файл.", true);
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function createFolder(name: string) {
    const { error } = await supabase.from("folders").insert({ name, parent_id: currentFolderId });
    if (error) return toast(dbError(error.message, error.code), true);
    setDialog(null);
    await loadFolders();
  }

  async function rename(target: Sel, name: string) {
    const table = target.kind === "file" ? "files" : "folders";
    const { error } = await supabase.from(table).update({ name }).eq("id", target.id);
    if (error) return toast(dbError(error.message, error.code), true);
    setDialog(null);
    await Promise.all([loadFolders(), loadFiles()]);
  }

  function descendantsOf(ids: string[]): Set<string> {
    const out = new Set(ids);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) {
        if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) {
          out.add(f.id);
          grew = true;
        }
      }
    }
    return out;
  }

  async function move(targets: Sel[], dest: string) {
    const fileIds = targets.filter((t) => t.kind === "file").map((t) => t.id);
    const folderIds = targets.filter((t) => t.kind === "folder").map((t) => t.id);
    if (fileIds.length) {
      const { error } = await supabase.from("files").update({ folder_id: dest }).in("id", fileIds);
      if (error) return toast(error.message, true);
    }
    for (const id of folderIds) {
      const { error } = await supabase.from("folders").update({ parent_id: dest }).eq("id", id);
      if (error) return toast(dbError(error.message, error.code), true);
    }
    setDialog(null);
    setSelected(new Map());
    toast(`Перемещено: ${targets.length}`);
    await Promise.all([loadFolders(), loadFiles()]);
  }

  async function removePaths(paths: string[]) {
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
      if (error) throw error;
    }
  }

  async function remove(targets: Sel[]) {
    try {
      const fileIds = targets.filter((t) => t.kind === "file").map((t) => t.id);
      const folderIds = targets.filter((t) => t.kind === "folder").map((t) => t.id);

      const paths: string[] = [];
      if (fileIds.length) {
        const { data } = await supabase.from("files").select("storage_path").in("id", fileIds);
        data?.forEach((r) => paths.push(r.storage_path));
      }
      for (const id of folderIds) {
        const { data, error } = await supabase.rpc("folder_subtree_file_paths", { root: id });
        if (error) throw error;
        (data as { storage_path: string }[]).forEach((r) => paths.push(r.storage_path));
      }

      await removePaths(paths);
      if (fileIds.length) {
        const { error } = await supabase.from("files").delete().in("id", fileIds);
        if (error) throw error;
      }
      if (folderIds.length) {
        const { error } = await supabase.from("folders").delete().in("id", folderIds);
        if (error) throw error;
      }

      if (currentFolderId && descendantsOf(folderIds).has(currentFolderId)) {
        openFolder(null);
      }
      setDialog(null);
      setSelected(new Map());
      toast(`Удалено: ${targets.length}`);
      await Promise.all([loadFolders(), loadFiles()]);
    } catch (e) {
      toast(e instanceof Error ? `Ошибка удаления: ${e.message}` : "Ошибка удаления.", true);
    }
  }

  // ---------- upload ----------
  function putWithProgress(path: string, file: File, token: string, onProgress: (p: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.setRequestHeader("cache-control", "max-age=3600");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        if (xhr.status === 413) {
          return reject(new Error("Файл слишком большой для текущего тарифа Supabase (на Free — до 50 МБ)."));
        }
        let msg = `Ошибка загрузки (${xhr.status})`;
        try {
          msg = JSON.parse(xhr.responseText).message ?? msg;
        } catch {
          /* ignore */
        }
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error("Нет соединения с сервером."));
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      xhr.send(body);
    });
  }

  async function uploadOne(file: File, folderId: string) {
    const id = crypto.randomUUID();
    const patch = (p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, ...p } : x)));
    setUploads((u) => [...u, { id, name: file.name, progress: 0, status: "run" }]);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Сессия истекла. Войдите заново.");

      const ext = file.name.includes(".") ? file.name.split(".").pop()!.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) : "";
      const path = `${folderId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

      await putWithProgress(path, file, session.access_token, (p) => patch({ progress: p }));

      const { error } = await supabase.from("files").insert({
        folder_id: folderId,
        name: file.name.slice(0, 255),
        storage_path: path,
        mime_type: file.type || null,
        size: file.size,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw new Error(error.message);
      }
      patch({ progress: 1, status: "done" });
    } catch (e) {
      patch({ status: "error", error: e instanceof Error ? e.message : "Ошибка загрузки" });
    }
  }

  async function uploadFiles(list: FileList | File[], folderId: string | null) {
    const arr = Array.from(list).filter((f) => f.size > 0 || f.type);
    if (!arr.length) return;
    if (!folderId) {
      toast("Сначала откройте папку, куда нужно загрузить файлы.", true);
      return;
    }
    const queue = [...arr];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) await uploadOne(f, folderId);
    };
    await Promise.all([worker(), worker(), worker()]);
    await loadFiles();
  }

  // ---------- drag & drop ----------
  function onDragEnter(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    dragDepth.current++;
    setDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }
  function onDrop(e: React.DragEvent, folderId: string | null = currentFolderId) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    setDropFolder(null);
    void uploadFiles(e.dataTransfer.files, folderId);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  // ---------- render helpers ----------
  const selectedList = Array.from(selected.values());
  const canUploadHere = !searching && view.type === "folder" && !!view.id;
  const hasMore = !searching ? files.length >= limit : files.length >= limit;
  const empty = !loading && visibleFolders.length === 0 && visibleFiles.length === 0;
  const activeUploads = uploads.filter((u) => u.status === "run").length;

  function ItemMenu({ s, file }: { s: Sel; file?: FileRow }) {
    const k = key(s);
    const open = menuFor === k;
    const folder = s.kind === "folder" ? folderById.get(s.id) : undefined;
    const locked = folder?.is_system;
    return (
      <div className="relative">
        <button
          aria-label="Действия"
          onClick={(e) => {
            e.stopPropagation();
            setMenuFor(open ? null : k);
          }}
          className="rounded-md p-1 text-muted hover:bg-white hover:text-ink"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {open && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="lc-pop absolute right-0 top-7 z-30 w-48 rounded-xl border border-line bg-white p-1 text-sm shadow-lg"
          >
            {file && (
              <button
                onClick={() => {
                  setMenuFor(null);
                  void download(file);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface"
              >
                <Download className="h-4 w-4" /> Скачать
              </button>
            )}
            {!locked && (
              <>
                <button
                  onClick={() => {
                    setMenuFor(null);
                    setDialog({ t: "rename", target: s, name: file?.name ?? folder?.name ?? "" });
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface"
                >
                  <Pencil className="h-4 w-4" /> Переименовать
                </button>
                <button
                  onClick={() => {
                    setMenuFor(null);
                    setDialog({ t: "move", targets: [s] });
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface"
                >
                  <FolderInput className="h-4 w-4" /> Переместить
                </button>
                <button
                  onClick={() => {
                    setMenuFor(null);
                    setDialog({ t: "delete", targets: [s] });
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-brand hover:bg-brand-soft"
                >
                  <Trash2 className="h-4 w-4" /> Удалить
                </button>
              </>
            )}
            {locked && <p className="px-3 py-2 text-xs text-muted">Системную папку нельзя изменить.</p>}
          </div>
        )}
      </div>
    );
  }

  function Check({ s }: { s: Sel }) {
    const on = selected.has(key(s));
    return (
      <button
        aria-label={on ? "Снять выбор" : "Выбрать"}
        aria-pressed={on}
        onClick={(e) => {
          e.stopPropagation();
          toggle(s);
        }}
        className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${
          on
            ? "border-brand bg-brand text-white"
            : "border-line bg-white text-transparent hover:border-brand group-hover:text-line"
        } ${on || selected.size ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </button>
    );
  }

  function FolderCard({ f }: { f: Folder }) {
    const s: Sel = { kind: "folder", id: f.id };
    const isDrop = dropFolder === f.id;
    const parentName = searching && f.parent_id ? folderById.get(f.parent_id)?.name : null;
    const common = {
      onClick: () => (selected.size ? toggle(s) : openFolder(f.id)),
      onDragOver: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDropFolder(f.id);
      },
      onDragLeave: () => setDropFolder((d) => (d === f.id ? null : d)),
      onDrop: (e: React.DragEvent) => onDrop(e, f.id),
    };
    if (layout === "list") {
      return (
        <div
          {...common}
          className={`group grid cursor-pointer grid-cols-[24px_1fr_auto] items-center gap-3 border-b border-line px-3 py-2.5 text-sm hover:bg-surface sm:grid-cols-[24px_1fr_140px_100px_180px_32px] ${
            isDrop ? "bg-brand-soft" : ""
          }`}
        >
          <Check s={s} />
          <div className="flex min-w-0 items-center gap-3">
            <FolderIcon className="h-5 w-5 shrink-0 text-brand" strokeWidth={1.6} />
            <span className="truncate font-medium">{f.name}</span>
            {parentName && <span className="hidden truncate text-xs text-muted sm:inline">в {parentName}</span>}
          </div>
          <span className="hidden text-muted sm:block">{f.created_by ? (profiles[f.created_by] ?? "") : "Система"}</span>
          <span className="hidden text-muted sm:block">Папка</span>
          <span className="hidden text-muted sm:block">{formatDate(f.created_at)}</span>
          <ItemMenu s={s} />
        </div>
      );
    }
    return (
      <div
        {...common}
        className={`group relative flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3 transition hover:border-brand/40 hover:shadow-sm ${
          isDrop ? "border-brand bg-brand-soft" : "border-line"
        } ${selected.has(key(s)) ? "border-brand bg-brand-soft" : ""}`}
      >
        <FolderIcon className="h-8 w-8 shrink-0 text-brand" strokeWidth={1.4} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{f.name}</p>
          <p className="truncate text-xs text-muted">{parentName ? `в ${parentName}` : "Папка"}</p>
        </div>
        <div className="absolute left-2 top-2">
          <Check s={s} />
        </div>
        <ItemMenu s={s} />
      </div>
    );
  }

  function FileCard({ f }: { f: FileRow }) {
    const s: Sel = { kind: "file", id: f.id };
    const kind: Kind = fileKind(f.mime_type, f.name);
    const thumb = thumbs[f.id];
    const owner = f.created_by ? (profiles[f.created_by] ?? "") : "";
    const where = (searching || view.type === "recent") && folderById.get(f.folder_id)?.name;
    const open = () => (selected.size ? toggle(s) : setPreviewId(f.id));

    if (layout === "list") {
      return (
        <div
          onClick={open}
          className={`group grid cursor-pointer grid-cols-[24px_1fr_auto] items-center gap-3 border-b border-line px-3 py-2.5 text-sm hover:bg-surface sm:grid-cols-[24px_1fr_140px_100px_180px_32px] ${
            selected.has(key(s)) ? "bg-brand-soft" : ""
          }`}
        >
          <Check s={s} />
          <div className="flex min-w-0 items-center gap-3">
            <KindIcon kind={kind} className="h-5 w-5 shrink-0 text-muted" />
            <span className="truncate">{f.name}</span>
            {where && <span className="hidden truncate text-xs text-muted sm:inline">в {where}</span>}
          </div>
          <span className="hidden truncate text-muted sm:block">{owner}</span>
          <span className="hidden text-muted sm:block">{formatBytes(f.size)}</span>
          <span className="hidden text-muted sm:block">{formatDate(f.created_at)}</span>
          <ItemMenu s={s} file={f} />
        </div>
      );
    }

    return (
      <div
        onClick={open}
        className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-white transition hover:border-brand/40 hover:shadow-sm ${
          selected.has(key(s)) ? "border-brand ring-1 ring-brand" : "border-line"
        }`}
      >
        <div className="flex aspect-[4/3] items-center justify-center bg-surface">
          {kind === "image" && thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <KindIcon kind={kind} className="h-10 w-10 text-muted/70" />
          )}
        </div>
        <div className="flex items-center gap-1 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={f.name}>
              {f.name}
            </p>
            <p className="truncate text-xs text-muted">
              {kindLabel[kind]} · {formatBytes(f.size)}
              {where ? ` · ${where}` : ""}
            </p>
          </div>
          <ItemMenu s={s} file={f} />
        </div>
        <div className="absolute left-2 top-2">
          <Check s={s} />
        </div>
      </div>
    );
  }

  function Tree({ pid, depth }: { pid: string | null; depth: number }) {
    const kids = folders.filter((f) => f.parent_id === pid).sort((a, b) => collator.compare(a.name, b.name));
    return (
      <>
        {kids.map((f) => {
          const hasKids = folders.some((x) => x.parent_id === f.id);
          const isOpen = expanded.has(f.id);
          const active = view.type === "folder" && view.id === f.id && !searching;
          return (
            <div key={f.id}>
              <div
                className={`flex items-center gap-0.5 rounded-lg pr-2 text-sm ${
                  active ? "bg-brand-soft font-medium text-brand-dark" : "text-ink hover:bg-surface"
                }`}
                style={{ paddingLeft: 4 + depth * 14 }}
                onDragOver={(e) => {
                  if (!hasFiles(e)) return;
                  e.preventDefault();
                  setDropFolder(f.id);
                }}
                onDragLeave={() => setDropFolder((d) => (d === f.id ? null : d))}
                onDrop={(e) => onDrop(e, f.id)}
              >
                <button
                  aria-label={isOpen ? "Свернуть" : "Развернуть"}
                  className={`p-1 ${hasKids ? "" : "invisible"}`}
                  onClick={() =>
                    setExpanded((s) => {
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
                  onClick={() => openFolder(f.id)}
                  className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left ${
                    dropFolder === f.id ? "text-brand" : ""
                  }`}
                >
                  <FolderIcon className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.6} />
                  <span className="truncate">{f.name}</span>
                </button>
              </div>
              {isOpen && <Tree pid={f.id} depth={depth + 1} />}
            </div>
          );
        })}
      </>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
          LC
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Leadership Council</p>
          <p className="text-xs text-muted">Cloud</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <button
          onClick={() => openFolder(null)}
          className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            view.type === "folder" && !view.id && !searching
              ? "bg-brand-soft font-medium text-brand-dark"
              : "hover:bg-surface"
          }`}
        >
          <LayoutGrid className="h-4 w-4" /> Все папки
        </button>
        <button
          onClick={() => go({ type: "recent" })}
          className={`mb-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            view.type === "recent" && !searching ? "bg-brand-soft font-medium text-brand-dark" : "hover:bg-surface"
          }`}
        >
          <Clock className="h-4 w-4" /> Недавно загруженные
        </button>
        <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted">Папки</p>
        <Tree pid={null} depth={0} />
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>
          <button onClick={signOut} aria-label="Выйти" title="Выйти" className="rounded-md p-2 text-muted hover:bg-surface">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="flex h-screen overflow-hidden bg-white"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDrop={(e) => onDrop(e)}
    >
      <aside className="hidden w-64 shrink-0 border-r border-line bg-white md:block">{sidebar}</aside>

      {drawer && (
        <div className="lc-fade fixed inset-0 z-40 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="lc-pop absolute inset-y-0 left-0 w-72 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="flex items-center gap-2 border-b border-line px-3 py-3 sm:px-6">
          <button onClick={() => setDrawer(true)} aria-label="Меню" className="rounded-md p-2 hover:bg-surface md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Поиск по названию"
              aria-label="Поиск по названию"
              className="w-full rounded-lg bg-surface py-2 pl-9 pr-8 text-sm outline-none ring-brand/0 transition focus:bg-white focus:ring-2 focus:ring-brand/30"
            />
            {queryInput && (
              <button
                aria-label="Очистить поиск"
                onClick={() => setQueryInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setDialog({ t: "newFolder" })}
              disabled={view.type === "recent" || searching}
              className="hidden items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-surface disabled:opacity-40 sm:flex"
            >
              <FolderPlus className="h-4 w-4" /> Папка
            </button>
            <button
              onClick={() => fileInput.current?.click()}
              disabled={!canUploadHere}
              title={canUploadHere ? "Загрузить файлы" : "Откройте папку, чтобы загрузить файлы"}
              className="flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
            >
              <Upload className="h-4 w-4" /> <span className="hidden sm:inline">Загрузить</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void uploadFiles(e.target.files, currentFolderId);
                e.target.value = "";
              }}
            />
          </div>
        </header>

        {/* title / toolbar */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-4 sm:px-6">
          <div className="min-w-0 flex-1">
            {view.type === "folder" && !searching ? (
              <nav aria-label="Путь" className="flex flex-wrap items-center gap-1 text-sm text-muted">
                <button onClick={() => openFolder(null)} className="hover:text-ink">
                  Все папки
                </button>
                {crumbs.map((c, i) => (
                  <span key={c.id} className="flex items-center gap-1">
                    <ChevronRight className="h-3.5 w-3.5" />
                    <button
                      onClick={() => openFolder(c.id)}
                      className={i === crumbs.length - 1 ? "font-medium text-ink" : "hover:text-ink"}
                    >
                      {c.name}
                    </button>
                  </span>
                ))}
              </nav>
            ) : (
              <h1 className="truncate text-lg font-semibold">{title}</h1>
            )}
          </div>

          {!searching && view.type === "folder" && (
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <ArrowDownUp className="h-4 w-4" />
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as Sort);
                  setLoading(true);
                }}
                aria-label="Сортировка"
                className="rounded-md bg-transparent py-1 text-ink outline-none"
              >
                <option value="date">По дате</option>
                <option value="name">По названию</option>
                <option value="type">По типу</option>
              </select>
            </label>
          )}
          <div className="flex rounded-lg border border-line p-0.5">
            {(["grid", "list"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLayout(l)}
                aria-label={l === "grid" ? "Плитка" : "Список"}
                aria-pressed={layout === l}
                className={`rounded-md p-1.5 ${layout === l ? "bg-brand-soft text-brand" : "text-muted hover:text-ink"}`}
              >
                {l === "grid" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="lc-pop mx-4 mt-3 flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-sm text-white sm:mx-6">
            <span className="mr-auto pl-1">Выбрано: {selected.size}</span>
            <button
              onClick={() => setDialog({ t: "move", targets: selectedList })}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-white/10"
            >
              <FolderInput className="h-4 w-4" /> Переместить
            </button>
            <button
              onClick={() => setDialog({ t: "delete", targets: selectedList })}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-white/10"
            >
              <Trash2 className="h-4 w-4" /> Удалить
            </button>
            <button onClick={() => setSelected(new Map())} aria-label="Снять выбор" className="rounded-lg p-1.5 hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* content */}
        <div className="relative flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-6">
          {loadError && (
            <div role="alert" className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-dark">
              Не удалось загрузить данные: {loadError}
              <button onClick={() => refreshRef.current()} className="ml-2 font-semibold underline">
                Повторить
              </button>
            </div>
          )}

          {loading && folders.length === 0 ? (
            <div className="flex justify-center py-20 text-muted">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : empty ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface">
                {searching ? (
                  <Search className="h-6 w-6 text-muted" />
                ) : (
                  <UploadCloud className="h-6 w-6 text-muted" />
                )}
              </div>
              <p className="font-medium">{searching ? "Ничего не найдено" : "Здесь пока пусто"}</p>
              <p className="max-w-xs text-sm text-muted">
                {searching
                  ? "Попробуйте изменить запрос."
                  : canUploadHere
                    ? "Перетащите файлы сюда или нажмите «Загрузить»."
                    : "Создайте папку или откройте существующую."}
              </p>
            </div>
          ) : (
            <>
              {layout === "list" && (
                <div className="hidden grid-cols-[24px_1fr_140px_100px_180px_32px] gap-3 border-b border-line px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted sm:grid">
                  <span />
                  <span>Название</span>
                  <span>Загрузил</span>
                  <span>Размер</span>
                  <span>Дата</span>
                  <span />
                </div>
              )}
              {visibleFolders.length > 0 && (
                <div
                  className={
                    layout === "grid"
                      ? "mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                      : "mb-0"
                  }
                >
                  {visibleFolders.map((f) => (
                    <FolderCard key={f.id} f={f} />
                  ))}
                </div>
              )}
              {visibleFiles.length > 0 && (
                <div
                  className={
                    layout === "grid"
                      ? "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                      : ""
                  }
                >
                  {visibleFiles.map((f) => (
                    <FileCard key={f.id} f={f} />
                  ))}
                </div>
              )}
              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => setLimit((l) => l + PAGE)}
                    className="rounded-lg border border-line px-5 py-2 text-sm font-medium hover:bg-surface"
                  >
                    Показать ещё
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {dragging && (
          <div className="lc-fade pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand/10 p-6">
            <div className="rounded-2xl border-2 border-dashed border-brand bg-white/95 px-10 py-8 text-center shadow-xl">
              <UploadCloud className="mx-auto h-10 w-10 text-brand" />
              <p className="mt-3 font-semibold">Отпустите, чтобы загрузить</p>
              <p className="text-sm text-muted">
                {canUploadHere ? `в «${title}»` : "Сначала откройте папку или перетащите на папку"}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* upload progress */}
      {uploads.length > 0 && (
        <div className="lc-pop fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between bg-ink px-4 py-2.5 text-sm text-white">
            <span>{activeUploads ? `Загрузка: осталось ${activeUploads}` : "Загрузка завершена"}</span>
            {!activeUploads && (
              <button onClick={() => setUploads([])} aria-label="Закрыть" className="rounded p-0.5 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <ul className="max-h-60 divide-y divide-line overflow-y-auto">
            {uploads.map((u) => (
              <li key={u.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  {u.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {u.status === "error" && <XCircle className="h-4 w-4 text-brand" />}
                  {u.status === "run" && <span className="text-xs text-muted">{Math.round(u.progress * 100)}%</span>}
                </div>
                {u.status === "run" && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface">
                    <div className="h-full bg-brand transition-all" style={{ width: `${u.progress * 100}%` }} />
                  </div>
                )}
                {u.status === "error" && <p className="mt-1 text-xs text-brand-dark">{u.error}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* toasts */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`lc-pop rounded-xl px-4 py-2.5 text-sm shadow-lg ${
              t.error ? "bg-brand text-white" : "bg-ink text-white"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* dialogs */}
      {dialog?.t === "newFolder" && (
        <PromptDialog
          title="Новая папка"
          label="Название"
          confirmText="Создать"
          onSubmit={createFolder}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.t === "rename" && (
        <PromptDialog
          title="Переименовать"
          label="Новое название"
          initial={dialog.name}
          confirmText="Сохранить"
          onSubmit={(v) => rename(dialog.target, v)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.t === "move" && (
        <MoveDialog
          folders={folders}
          blocked={descendantsOf(dialog.targets.filter((t) => t.kind === "folder").map((t) => t.id))}
          count={dialog.targets.length}
          onPick={(dest) => move(dialog.targets, dest)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.t === "delete" && (
        <ConfirmDialog
          title="Удалить?"
          message={`Будет удалено элементов: ${dialog.targets.length}. Папки удаляются вместе со всем содержимым. Это действие нельзя отменить.`}
          confirmText="Удалить"
          onConfirm={() => remove(dialog.targets)}
          onClose={() => setDialog(null)}
        />
      )}

      {previewIndex >= 0 && (
        <Preview
          files={previewable}
          index={previewIndex}
          onIndex={(i) => setPreviewId(previewable[i].id)}
          onClose={() => setPreviewId(null)}
          onDownload={download}
        />
      )}
    </div>
  );
}
