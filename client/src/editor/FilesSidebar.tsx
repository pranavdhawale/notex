import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import api from "../utils/api";
import axios from "axios";
import * as Y from "yjs";
import {
  File,
  Trash2,
  Upload,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Code,
  X,
  Download,
  FolderX,
  FileMinus,
  Loader2,
} from "lucide-react";
import { ConfirmationModal } from "../components/ConfirmationModal";

interface FilesSidebarProps {
  roomSlug: string;
  ydoc: Y.Doc;
  userId: string;
  isRoomOwner: boolean;
}

interface FileData {
  id: string;
  name: string;
  url: string;
  size: number;
  type?: string;
  uploaderId?: string;
}

interface ActiveUpload {
  id: string;
  name: string;
  progress: number;
  speed: string;
  controller: AbortController;
}

export const FilesSidebar: React.FC<FilesSidebarProps> = ({
  roomSlug,
  ydoc,
  userId,
  isRoomOwner,
}) => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  // Download file with authentication
  const handleDownload = async (file: FileData) => {
    setDownloadingFileId(file.id);
    try {
      const response = await api.get(`/api/rooms/${roomSlug}/files/${file.id}/download`, {
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed:', e);
      alert('Failed to download file');
    } finally {
      setDownloadingFileId(null);
    }
  };

  useEffect(() => {
    fetchFiles();

    // Trigger refetch when metadata changes (signal from other clients)
    const yMeta = ydoc.getMap("meta");
    const observer = () => {
      fetchFiles();
    };
    yMeta.observe(observer);
    return () => yMeta.unobserve(observer);
  }, [roomSlug, ydoc]);

  const fetchFiles = async () => {
    try {
      const res = await api.get(`/api/rooms/${roomSlug}/files`);
      setFiles(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error(e);
      setFiles([]);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm("Delete this file?")) return;
    try {
      await api.delete(`/api/rooms/${roomSlug}/files/${fileId}`);

      const yMeta = ydoc.getMap("meta");
      yMeta.set("lastUpload", Date.now());

      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) {
      alert("Failed to delete file");
    }
  };

  const [showDeleteSelection, setShowDeleteSelection] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"me" | "all">("me");

  const handleDeleteAllClick = () => {
    if (files.length === 0) return;
    if (isRoomOwner) {
      setShowDeleteSelection(true);
    } else {
      setDeleteScope("me");
      setShowDeleteConfirmation(true);
    }
  };

  const confirmDeleteAll = async () => {
    try {
      const url = `/api/rooms/${roomSlug}/files${deleteScope === "me" ? "?user=me" : ""}`;

      await api.delete(url);

      const yMeta = ydoc.getMap("meta");
      yMeta.set("lastUpload", Date.now());

      // Optimistic update
      if (deleteScope === "me") {
        setFiles((prev) => prev.filter((f) => f.uploaderId !== userId));
      } else {
        setFiles([]);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to delete files");
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    droppedFiles.forEach((file) => {
      uploadFile(file);
    });
  };

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

    try {
      const res = await api.post(`/api/upload/${roomSlug}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 10 * 60 * 1000, // 10 minutes timeout for large files
        signal: controller.signal,
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || file.size;
          const current = progressEvent.loaded;
          const percentCompleted = Math.round((current * 100) / total);

          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000; // seconds

          let speedStr = "Calculating...";
          if (timeDiff >= 0.5) {
            // Update speed every 500ms
            const loadedDiff = current - lastLoaded;
            const speed = loadedDiff / timeDiff; // bytes per second

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
                ? {
                    ...u,
                    progress: percentCompleted,
                    ...(timeDiff >= 0.5 ? { speed: speedStr } : {}),
                  }
                : u,
            ),
          );
        },
      });

      const newFile = res.data;
      const yMeta = ydoc.getMap("meta");
      yMeta.set("lastUpload", Date.now());

      setFiles((prev) => [...(Array.isArray(prev) ? prev : []), newFile]);
    } catch (err: any) {
      if (axios.isCancel(err)) {
        console.log("Upload cancelled");
      } else {
        alert(`Upload failed for ${file.name}. Max 200MB.`);
      }
    } finally {
      setActiveUploads((prev) => prev.filter((u) => u.id !== uploadId));
    }
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "svg":
        return <ImageIcon size={18} />;
      case "mp4":
      case "mov":
      case "avi":
        return <Film size={18} />;
      case "mp3":
      case "wav":
        return <Music size={18} />;
      case "js":
      case "ts":
      case "tsx":
      case "py":
      case "json":
        return <Code size={18} />;
      case "txt":
      case "md":
        return <FileText size={18} />;
      default:
        return <File size={18} />;
    }
  };

  return (
    <div
      className={`sidebar-panel left-panel ${isDragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="panel-header liquid-header">
        {/* Liquid Glass Background */}
        <div className="liquid-glass-container">
          <div className="liquid-glass-backdrop"></div>
          <div className="liquid-glass-distortion top"></div>
          <div className="liquid-glass-distortion bottom"></div>
          <div className="liquid-glass-distortion left"></div>
          <div className="liquid-glass-distortion right"></div>
        </div>

        <div
          className="header-content"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h3>Files</h3>
            <span className="badge">{files.length}</span>
          </div>
          <input
            type="file"
            id="file-upload-input"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const fileList = e.target.files;
              if (fileList && fileList.length > 0) {
                Array.from(fileList).forEach((file) => uploadFile(file));
                e.target.value = "";
              }
            }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            {files.length > 0 && (
              <button
                onClick={handleDeleteAllClick}
                className="btn-icon"
                title="Delete All Files"
                style={{ color: "#ff4d4f" }}
              >
                <FolderX size={18} />
              </button>
            )}
            <button
              onClick={() =>
                document.getElementById("file-upload-input")?.click()
              }
              className="btn-icon"
              title="Upload File"
              disabled={activeUploads.length > 0}
            >
              <Upload size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="files-list custom-scrollbar">
        {activeUploads.length > 0 && (
          <div className="active-uploads" style={{ marginBottom: "10px" }}>
            {activeUploads.map((upload) => (
              <div
                key={upload.id}
                className="upload-item-glass"
                style={{
                  padding: "8px",
                  background: "rgba(255, 255, 255, 0.05)",
                  borderRadius: "8px",
                  marginBottom: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "4px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      maxWidth: "80%",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {upload.name}
                    </span>
                    <span style={{ fontSize: "10px", opacity: 0.7 }}>
                      {upload.speed} • {upload.progress}%
                    </span>
                  </div>
                  <button
                    onClick={() => cancelUpload(upload.id)}
                    className="btn-icon delete"
                    title="Cancel"
                    style={{ padding: "2px", width: "20px", height: "20px" }}
                  >
                    <X size={12} />
                  </button>
                </div>
                <div
                  className="progress-bar-container"
                  style={{
                    width: "100%",
                    height: "4px",
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: "2px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${upload.progress}%`,
                      height: "100%",
                      background: "var(--accent-color, #3b82f6)",
                      transition: "width 0.2s ease-out",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {files.length === 0 && activeUploads.length === 0 ? (
          <div className="empty-state">
            <Upload size={32} opacity={0.5} />
            <p>Drop files here</p>
          </div>
        ) : (
          files.map((f) => {
            const canDelete =
              isRoomOwner || (f.uploaderId && f.uploaderId === userId);
            return (
              <div key={f.id} className="file-item-glass">
                <div className="file-icon">{getFileIcon(f.name)}</div>
                <div className="file-info">
                  <button
                    onClick={() => handleDownload(f)}
                    className="file-name-link"
                    title={f.name}
                    disabled={downloadingFileId === f.id}
                  >
                    {f.name}
                  </button>
                  <span className="file-meta">
                    {(f.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
                <div
                  className="file-actions"
                  style={{ display: "flex", gap: "4px" }}
                >
                  <button
                    onClick={() => handleDownload(f)}
                    className="btn-icon"
                    title="Download"
                    disabled={downloadingFileId === f.id}
                  >
                    {downloadingFileId === f.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => handleDeleteFile(f.id)}
                      className="btn-icon delete"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete Selection Modal (Custom for Owner) */}
      {showDeleteSelection &&
        createPortal(
          <div
            className="confirmation-modal-overlay"
            onClick={() => setShowDeleteSelection(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowDeleteSelection(false);
              }
            }}
            tabIndex={0}
            style={{ zIndex: 10001 }}
          >
            <div
              className="confirmation-modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="confirmation-modal-header">
                <h3>Delete Options</h3>
                <button
                  className="btn-icon"
                  onClick={() => setShowDeleteSelection(false)}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="confirmation-modal-body">
                <p style={{ marginBottom: "16px", marginTop: 0 }}>
                  Choose which files you want to delete data for.
                </p>
                <div className="selection-grid">
                  <button
                    className="selection-card"
                    onClick={() => {
                      setDeleteScope("me");
                      setShowDeleteSelection(false);
                      setShowDeleteConfirmation(true);
                    }}
                    disabled={
                      files.filter((f) => f.uploaderId === userId).length === 0
                    }
                  >
                    <div className="card-icon">
                      <FileMinus size={20} />
                    </div>
                    <div className="card-content">
                      <span className="card-title">Delete My Files</span>
                      <span className="card-desc">
                        Remove{" "}
                        {files.filter((f) => f.uploaderId === userId).length}{" "}
                        files uploaded by you
                      </span>
                    </div>
                  </button>

                  <button
                    className="selection-card danger"
                    onClick={() => {
                      setDeleteScope("all");
                      setShowDeleteSelection(false);
                      setShowDeleteConfirmation(true);
                    }}
                  >
                    <div className="card-icon">
                      <FolderX size={20} />
                    </div>
                    <div className="card-content">
                      <span className="card-title">Delete All Files</span>
                      <span className="card-desc">
                        Clear the entire room ({files.length} files)
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Final Confirmation Modal */}
      {showDeleteConfirmation && (
        <ConfirmationModal
          isOpen={showDeleteConfirmation}
          onClose={() => setShowDeleteConfirmation(false)}
          onConfirm={confirmDeleteAll}
          title={
            deleteScope === "all" ? "Delete All Files?" : "Delete My Files?"
          }
          message={
            deleteScope === "all"
              ? "Are you sure you want to delete ALL files in this room? This action cannot be undone."
              : "Are you sure you want to delete all your files? This action cannot be undone."
          }
          confirmText="Delete"
          isDangerous={true}
        />
      )}
    </div>
  );
};
