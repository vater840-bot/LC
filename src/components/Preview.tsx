"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { FileRow } from "@/lib/types";
import { fileKind, formatBytes } from "@/lib/utils";
import { KindIcon } from "./FileIcon";

export function Preview({
  files,
  index,
  onIndex,
  onClose,
  onDownload,
}: {
  files: FileRow[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDownload: (f: FileRow) => void;
}) {
  const file = files[index];
  const kind = fileKind(file.mime_type, file.name);
  const [loaded, setLoaded] = useState<{ id: string; url: string | null; text?: string; failed?: boolean } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.storage.from("lc-files").createSignedUrl(file.storage_path, 3600);
      if (cancelled) return;
      if (error || !data) {
        setLoaded({ id: file.id, url: null, failed: true });
        return;
      }
      if (kind === "text" && file.size < 1_000_000) {
        try {
          const res = await fetch(data.signedUrl);
          const text = await res.text();
          if (!cancelled) setLoaded({ id: file.id, url: data.signedUrl, text });
          return;
        } catch {
          /* fall through to plain url */
        }
      }
      setLoaded({ id: file.id, url: data.signedUrl });
    })();
    return () => {
      cancelled = true;
    };
  }, [file.id, file.storage_path, file.size, kind]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < files.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [index, files.length, onClose, onIndex]);

  const ready = loaded?.id === file.id ? loaded : null;
  const url = ready?.url ?? null;

  let body: React.ReactNode;
  if (!ready) {
    body = <Loader2 className="h-6 w-6 animate-spin text-white/70" />;
  } else if (ready.failed || !url) {
    body = <p className="text-sm text-white/80">Не удалось загрузить файл.</p>;
  } else if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    body = <img src={url} alt={file.name} className="max-h-full max-w-full rounded-lg object-contain" />;
  } else if (kind === "video") {
    body = <video src={url} controls autoPlay className="max-h-full max-w-full rounded-lg bg-black" />;
  } else if (kind === "audio") {
    body = <audio src={url} controls autoPlay className="w-full max-w-md" />;
  } else if (kind === "pdf") {
    body = <iframe src={url} title={file.name} className="h-full w-full rounded-lg bg-white" />;
  } else if (kind === "text" && ready.text !== undefined) {
    body = (
      <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-4 text-sm text-ink">
        {ready.text}
      </pre>
    );
  } else if (["word", "sheet", "slides"].includes(kind) && !/\.(odt|rtf|ods|odp)$/i.test(file.name)) {
    body = (
      <iframe
        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
        title={file.name}
        className="h-full w-full rounded-lg bg-white"
      />
    );
  } else {
    body = (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center">
        <KindIcon kind={kind} className="h-12 w-12 text-brand" />
        <p className="text-sm text-muted">Предпросмотр для этого типа файла недоступен.</p>
        <button
          onClick={() => onDownload(file)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Скачать
        </button>
      </div>
    );
  }

  return (
    <div className="lc-fade fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-white/60">
            {formatBytes(file.size)} · {index + 1} из {files.length}
          </p>
        </div>
        <button
          onClick={() => onDownload(file)}
          aria-label="Скачать"
          className="rounded-lg p-2 hover:bg-white/10"
        >
          <Download className="h-5 w-5" />
        </button>
        <button onClick={onClose} aria-label="Закрыть" className="rounded-lg p-2 hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-16">
        {index > 0 && (
          <button
            onClick={() => onIndex(index - 1)}
            aria-label="Предыдущий"
            className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {body}
        {index < files.length - 1 && (
          <button
            onClick={() => onIndex(index + 1)}
            aria-label="Следующий"
            className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
