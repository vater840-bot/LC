export type Kind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "word"
  | "sheet"
  | "slides"
  | "text"
  | "archive"
  | "other";

const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function fileKind(mime: string | null, name: string): Kind {
  const e = ext(name);
  const m = mime ?? "";
  // HEIC/HEIF cannot be rendered by most browsers, so they are treated as plain files.
  if (["heic", "heif"].includes(e)) return "other";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "bmp"].includes(e))
    return "image";
  if (m.startsWith("video/") || ["mp4", "mov", "webm", "m4v", "mkv", "avi"].includes(e)) return "video";
  if (m.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg", "aac", "flac"].includes(e)) return "audio";
  if (m === "application/pdf" || e === "pdf") return "pdf";
  if (["doc", "docx", "odt", "rtf"].includes(e)) return "word";
  if (["xls", "xlsx", "ods"].includes(e)) return "sheet";
  if (["ppt", "pptx", "odp"].includes(e)) return "slides";
  if (["txt", "md", "csv", "json", "log"].includes(e) || m.startsWith("text/")) return "text";
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return "archive";
  return "other";
}

export const kindLabel: Record<Kind, string> = {
  image: "Фото",
  video: "Видео",
  audio: "Аудио",
  pdf: "PDF",
  word: "Документ",
  sheet: "Таблица",
  slides: "Презентация",
  text: "Текст",
  archive: "Архив",
  other: "Файл",
};

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
