import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
} from "lucide-react";
import type { Kind } from "@/lib/utils";

const map = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  word: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  text: FileText,
  archive: FileArchive,
  other: FileIcon,
} as const;

export function KindIcon({ kind, className }: { kind: Kind; className?: string }) {
  const Icon = map[kind];
  return <Icon className={className} strokeWidth={1.6} />;
}
