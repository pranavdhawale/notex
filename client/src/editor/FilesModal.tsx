import React from "react";
import {
  X,
  Upload,
  Trash2,
  File,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Code,
  Download,
  Loader2,
} from "lucide-react";
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
  uploading,
  uploadProgress = 0,
  uploadSpeed = "",
  userId,
  roomSlug,
  isRoomOwner,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onUpload(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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

  if (!isOpen) return null;

  return (
    <div className="files-modal-overlay" onClick={onClose}>
      <div className="files-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="files-modal-header">
          <h3>Files</h3>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
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
                    <a
                      href={`${
                        import.meta.env.VITE_API_URL || "http://localhost:8080"
                      }/api/rooms/${roomSlug}/files/${f.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={f.name}
                    >
                      {f.name}
                    </a>
                    <span className="file-meta">
                      {(f.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  <div
                    className="file-actions"
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <a
                      href={`${
                        import.meta.env.VITE_API_URL || "http://localhost:8080"
                      }/api/rooms/${roomSlug}/files/${f.id}/download`}
                      className="btn-icon"
                      title="Download"
                      download
                    >
                      <Download size={16} />
                    </a>
                    {canDelete && (
                      <button
                        onClick={() => onDelete(f.id)}
                        className="btn-icon delete"
                      >
                        <Trash2 size={16} />
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
  );
};
