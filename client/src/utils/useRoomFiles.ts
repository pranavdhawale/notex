import { useState, useEffect, useCallback } from "react";
import * as Y from "yjs";
import api from "./api";
import axios from "axios";
import { toast } from "../components/Toaster";

export interface FileData {
  id: string;
  name: string;
  url: string;
  size: number;
  type?: string;
  uploaderId?: string;
}

export interface ActiveUpload {
  id: string;
  name: string;
  progress: number;
  speed: string;
  controller: AbortController;
}

export interface UseRoomFilesReturn {
  files: FileData[];
  activeUploads: ActiveUpload[];
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  fetchFiles: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
  deleteAllFiles: (scope: "me" | "all") => Promise<void>;
  insertAsImage: (fileId: string, editor: any) => Promise<void>;
  cancelUpload: (uploadId: string) => void;
  isImageFile: (filename: string) => boolean;
}

export function useRoomFiles(
  roomSlug: string,
  ydoc: Y.Doc | null,
  userId: string,
  _isRoomOwner: boolean
): UseRoomFilesReturn {
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const fetchFiles = useCallback(async () => {
    if (!ydoc) return;
    try {
      const res = await api.get(`/api/rooms/${roomSlug}/files`);
      // Handle both { files: [...] } and direct array responses
      const filesData = res.data.files || res.data;
      setFiles(Array.isArray(filesData) ? filesData : []);
    } catch (e) {
      console.error("Failed to fetch files:", e);
      setFiles([]);
    }
  }, [roomSlug, ydoc]);

  // Fetch on mount and when ydoc changes
  useEffect(() => {
    fetchFiles();
    if (!ydoc) return;

    // Refetch when metadata changes (signal from other clients)
    const yMeta = ydoc.getMap("meta");
    const observer = () => {
      fetchFiles();
    };
    yMeta.observe(observer);
    return () => yMeta.unobserve(observer);
  }, [ydoc, fetchFiles]);

  const uploadFile = async (file: File) => {
    const uploadId = Math.random().toString(36).substring(7);
    const controller = new AbortController();

    const newUpload: ActiveUpload = {
      id: uploadId,
      name: file.name,
      progress: 0,
      speed: "0 KB/s",
      controller,
    };

    setActiveUploads((prev) => [...prev, newUpload]);

    const formData = new FormData();
    formData.append("file", file);

    let lastLoaded = 0;
    let lastTime = Date.now();
    let lastUpdateTime = 0;

    try {
      const res = await api.post(`/api/upload/${roomSlug}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 10 * 60 * 1000, // 10 minutes
        signal: controller.signal,
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || file.size;
          const current = progressEvent.loaded;
          const percentCompleted = Math.round((current * 100) / total);
          const now = Date.now();

          // Throttle state updates to 200ms
          const timeSinceLastUpdate = now - lastUpdateTime;
          if (timeSinceLastUpdate < 200 && percentCompleted < 100) {
            return;
          }
          lastUpdateTime = now;

          const timeDiff = (now - lastTime) / 1000;
          let speedStr = "Calculating...";

          if (timeDiff >= 0.5) {
            const loadedDiff = current - lastLoaded;
            const speed = loadedDiff / timeDiff;

            if (speed > 1024 * 1024) {
              speedStr = `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
            } else {
              speedStr = `${(speed / 1024).toFixed(1)} KB/s`;
            }

            lastLoaded = current;
            lastTime = now;
          }

          setActiveUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? { ...u, progress: percentCompleted, speed: speedStr }
                : u
            )
          );
        },
      });

      const newFile = res.data;

      // Signal other clients via Yjs
      if (ydoc) {
        const yMeta = ydoc.getMap("meta");
        yMeta.set("lastUpload", Date.now());
      }

      setFiles((prev) => [...prev, newFile]);
    } catch (err: any) {
      if (axios.isCancel(err)) {
        // Upload cancelled - silently ignore
      } else if (err.response?.data?.error) {
        toast.error(err.response.data.error);
      } else {
        toast.error(`Upload failed for ${file.name}. Max 200MB.`);
      }
    } finally {
      setActiveUploads((prev) => prev.filter((u) => u.id !== uploadId));
    }
  };

  const uploadFiles = async (files: File[]) => {
    for (const file of files) {
      await uploadFile(file);
    }
  };

  const cancelUpload = (uploadId: string) => {
    setActiveUploads((prev) => {
      const upload = prev.find((u) => u.id === uploadId);
      if (upload) {
        upload.controller.abort();
      }
      return prev.filter((u) => u.id !== uploadId);
    });
  };

  const deleteFile = async (fileId: string) => {
    try {
      await api.delete(`/api/rooms/${roomSlug}/files/${fileId}`);

      if (ydoc) {
        const yMeta = ydoc.getMap("meta");
        yMeta.set("lastUpload", Date.now());
      }

      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) {
      toast.error("Failed to delete file");
      throw e;
    }
  };

  const deleteAllFiles = async (scope: "me" | "all") => {
    try {
      const url = `/api/rooms/${roomSlug}/files${scope === "me" ? "?user=me" : ""}`;
      await api.delete(url);

      if (ydoc) {
        const yMeta = ydoc.getMap("meta");
        yMeta.set("lastUpload", Date.now());
      }

      // Optimistic update
      if (scope === "me") {
        setFiles((prev) => prev.filter((f) => f.uploaderId !== userId));
      } else {
        setFiles([]);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete files");
      throw e;
    }
  };

  const insertAsImage = async (fileId: string, editor: any) => {
    try {
      const res = await api.post(`/api/rooms/${roomSlug}/files/${fileId}/insert-to-images`);
      const newImage = res.data;

      // Insert at cursor
      if (editor) {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "image",
            attrs: {
              src: newImage.url,
              alt: newImage.name,
            },
          })
          .run();
      }

      // Track in Y.Map
      const imageRefs = ydoc?.getMap<number>("imageRefs");
      if (imageRefs) {
        imageRefs.set(newImage.id, (imageRefs.get(newImage.id) || 0) + 1);
      }

      toast.success("Image inserted");
    } catch (e: any) {
      if (e.response?.data?.error) {
        toast.error(e.response.data.error);
      } else {
        toast.error("Failed to insert image");
      }
      throw e;
    }
  };

  const isImageFile = (filename: string): boolean => {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
  };

  return {
    files,
    activeUploads,
    isDragging,
    setIsDragging,
    fetchFiles,
    uploadFiles,
    uploadFile,
    deleteFile,
    deleteAllFiles,
    insertAsImage,
    cancelUpload,
    isImageFile,
  };
}
