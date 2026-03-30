import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Upload,
  File,
  FileText,
  ImageIcon,
  Code,
  Music,
  Film,
  Download,
  Loader2,
  FolderX,
  FileMinus,
  Trash2,
} from "lucide-react";
import { ConfirmationModal } from "../components/ConfirmationModal";
import api from "../utils/api";
import "./Editor.css"; // Import shared styles for file items
import "./FilesModal.css";

interface FileData {
  id: string;
  name: string;
  url: string;
  size: number;
  type?: string;
  uploaderId?: string;
}

interface FilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileData[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (fileId: string) => Promise<void>;
  onDeleteAll: (scope: "me" | "all") => Promise<void>;
  uploading: boolean;
  uploadProgress?: number;
  uploadSpeed?: string;
  userId: string;
  roomSlug: string;
  isRoomOwner: boolean;
}

export const FilesModal: React.FC<FilesModalProps> = ({
  isOpen,
  onClose,
  files,
  onUpload,
  onDelete,
  onDeleteAll,
  uploading,
  uploadProgress = 0,
  uploadSpeed = "",
  userId,
  roomSlug,
  isRoomOwner,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [showDeleteSelection, setShowDeleteSelection] = React.useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] =
    React.useState(false);
  const [deleteScope, setDeleteScope] = React.useState<"me" | "all">("me");
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

  // Close modals on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDeleteConfirmation) setShowDeleteConfirmation(false);
        else if (showDeleteSelection) setShowDeleteSelection(false);
        else onClose(); // Close main modal if no sub-modals open
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showDeleteSelection, showDeleteConfirmation, isOpen, onClose]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onUpload(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
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
    await onDeleteAll(deleteScope);
    setShowDeleteConfirmation(false); // Close after confirming
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

  if (!isOpen) return null;

  return (
    <>
      <div className="files-modal-overlay" onClick={onClose}>
        <div
          className="files-modal-content"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="files-modal-header">
            <h3>Files</h3>
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
              <button className="btn-icon" onClick={onClose}>
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="files-modal-body">
            {files.length === 0 ? (
              <div className="empty-state">
                <Upload size={32} opacity={0.5} />
                <p>No files yet</p>
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
                          onClick={() => onDelete(f.id)}
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

          <div
            className="files-modal-footer"
            style={{ flexDirection: "column", gap: "10px" }}
          >
            {uploading && (
              <div style={{ width: "100%", padding: "0 10px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>Uploading...</span>
                  <span>
                    {uploadSpeed} • {uploadProgress}%
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "4px",
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: "2px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${uploadProgress}%`,
                      height: "100%",
                      background: "var(--accent-color, #3b82f6)",
                      transition: "width 0.2s ease-out",
                    }}
                  />
                </div>
              </div>
            )}
            <div
              style={{
                display: "flex",
                width: "100%",
                justifyContent: "flex-end",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              <button
                className="upload-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ width: "auto" }}
              >
                {uploading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Upload size={18} />
                )}
                {uploading ? "Uploading..." : "Upload File"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Selection Modal */}
      {showDeleteSelection &&
        createPortal(
          <div
            className="confirmation-modal-overlay"
            onClick={() => setShowDeleteSelection(false)}
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
    </>
  );
};
