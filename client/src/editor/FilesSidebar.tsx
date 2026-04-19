import React, { useState } from "react";
import { createPortal } from "react-dom";
import api from "../utils/api";
import {
  Trash2,
  Upload,
  X,
  Download,
  FolderX,
  FileMinus,
  Loader2,
  FileImage,
} from "lucide-react";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { toast } from "../components/Toaster";
import { getFileIcon } from "../utils/fileIcons";
import { useRoomFiles, type FileData } from "../utils/useRoomFiles";
import * as Y from "yjs";
import type { Editor } from "@tiptap/react";

interface FilesSidebarProps {
  roomSlug: string;
  ydoc: Y.Doc;
  userId: string;
  isRoomOwner: boolean;
  editor: Editor | null;
  onFocusRestore?: () => void;
}

export const FilesSidebar: React.FC<FilesSidebarProps> = ({
  roomSlug,
  ydoc,
  userId,
  isRoomOwner,
  editor,
  onFocusRestore,
}) => {
  const {
    files,
    activeUploads,
    isDragging,
    setIsDragging,
    uploadFiles,
    uploadFile,
    deleteFile,
    deleteAllFiles,
    insertAsImage,
    cancelUpload,
    isImageFile,
  } = useRoomFiles(roomSlug, ydoc, userId, isRoomOwner);

  const [showDeleteSelection, setShowDeleteSelection] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"me" | "all">("me");
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  // Download file with authentication
  const handleDownload = async (file: FileData) => {
    setDownloadingFileId(file.id);
    try {
      const response = await api.get(`/api/rooms/${roomSlug}/files/${file.id}/download`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      toast.error("Failed to download file");
    } finally {
      setDownloadingFileId(null);
      onFocusRestore?.();
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    // Upload all files
    await Promise.all(droppedFiles.map((file) => uploadFile(file)));
    onFocusRestore?.();
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm("Delete this file?")) return;
    try {
      await deleteFile(fileId);
    } catch {
      // Error handled in hook
    }
    onFocusRestore?.();
  };

  const handleInsertAsImage = async (fileId: string) => {
    try {
      await insertAsImage(fileId, editor);
    } catch {
      // Error handled in hook
    }
    onFocusRestore?.();
  };

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
      await deleteAllFiles(deleteScope);
    } catch {
      // Error handled in hook
    }
    setShowDeleteConfirmation(false);
    onFocusRestore?.();
  };

  return (
    <div
      className={`sidebar-panel left-panel ${isDragging ? "dragging" : ""}`}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="panel-header liquid-header">
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
                uploadFiles(Array.from(fileList));
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
            <p style={{ fontSize: "0.75rem", opacity: 0.5, marginTop: "4px" }}>
              Max 10 uploads/min
            </p>
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
                  {isImageFile(f.name) && (
                    <button
                      onClick={() => handleInsertAsImage(f.id)}
                      className="btn-icon"
                      title="Insert in Document"
                    >
                      <FileImage size={14} />
                    </button>
                  )}
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
