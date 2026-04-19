import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Upload,
  Download,
  Loader2,
  FolderX,
  FileMinus,
  Trash2,
  FileImage,
} from "lucide-react";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { toast } from "../components/Toaster";
import api from "../utils/api";
import { getFileIcon } from "../utils/fileIcons";
import { useRoomFiles, type FileData } from "../utils/useRoomFiles";
import * as Y from "yjs";
import type { Editor } from "@tiptap/react";
import "./Editor.css";
import "./FilesModal.css";

interface FilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomSlug: string;
  ydoc: Y.Doc;
  userId: string;
  isRoomOwner: boolean;
  editor: Editor | null;
}

export const FilesModal: React.FC<FilesModalProps> = ({
  isOpen,
  onClose,
  roomSlug,
  ydoc,
  userId,
  isRoomOwner,
  editor,
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

  const fileInputRef = React.useRef<HTMLInputElement>(null);
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
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    await Promise.all(droppedFiles.map((file) => uploadFile(file)));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      await uploadFiles(Array.from(fileList));
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
    try {
      await deleteAllFiles(deleteScope);
    } catch {
      // Error handled in hook
    }
    setShowDeleteConfirmation(false);
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      await deleteFile(fileId);
    } catch {
      // Error handled in hook
    }
  };

  const handleInsertAsImage = async (fileId: string) => {
    try {
      await insertAsImage(fileId, editor);
    } catch {
      // Error handled in hook
    }
  };

  // Close modals on Escape key
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDeleteConfirmation) setShowDeleteConfirmation(false);
        else if (showDeleteSelection) setShowDeleteSelection(false);
        else onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showDeleteSelection, showDeleteConfirmation, isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className={`files-modal-overlay ${isDragging ? 'dragging' : ''}`}
        onClick={onClose}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          className="files-modal-content"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="files-modal-header">
            <h3>Files <span className="badge">{files.length}</span></h3>
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
            {/* Drag overlay */}
            {isDragging && (
              <div className="drag-overlay">
                <Upload size={48} />
                <p>Drop files to upload</p>
              </div>
            )}

            {/* Active uploads */}
            {activeUploads.length > 0 && (
              <div className="active-uploads">
                {activeUploads.map((upload) => (
                  <div key={upload.id} className="upload-item-glass">
                    <div className="upload-header">
                      <div className="upload-info">
                        <span className="upload-name">{upload.name}</span>
                        <span className="upload-meta">
                          {upload.speed} • {upload.progress}%
                        </span>
                      </div>
                      <button
                        onClick={() => cancelUpload(upload.id)}
                        className="btn-icon delete"
                        title="Cancel"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="progress-bar-container">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {files.length === 0 && activeUploads.length === 0 ? (
              <div className="empty-state">
                <Upload size={32} opacity={0.5} />
                <p>Drop files here or click upload</p>
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
                    <div className="file-actions">
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

          <div className="files-modal-footer">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <button
              className="upload-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={activeUploads.length > 0}
            >
              {activeUploads.length > 0 ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Upload size={18} />
              )}
              {activeUploads.length > 0 ? "Uploading..." : "Upload Files"}
            </button>
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
