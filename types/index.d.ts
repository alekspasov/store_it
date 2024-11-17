export interface UploadFileProps {
  file: File;
  ownerId: string;
  accountId: string;
  path: string;
}

export type FileType = "document" | "image" | "video" | "audio" | "other";
