export type Folder = {
  id: string;
  parent_id: string | null;
  name: string;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
};

export type FileRow = {
  id: string;
  folder_id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size: number;
  created_by: string | null;
  created_at: string;
};

export type Item =
  | { kind: "folder"; folder: Folder }
  | { kind: "file"; file: FileRow };
