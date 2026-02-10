import React, { useEffect, useState } from "react";
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
} from "lucide-react";

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

export const FilesSidebar: React.FC<FilesSidebarProps> = ({
  roomSlug,
  ydoc,
  userId,
  isRoomOwner,
}) => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      const res = await axios.get(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:8080"
        }/api/rooms/${roomSlug}/files`,
      );
      setFiles(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error(e);
      setFiles([]);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm("Delete this file?")) return;
    try {
      await axios.delete(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:8080"
        }/api/rooms/${roomSlug}/files/${fileId}`,
        {
          headers: { "X-User-ID": userId },
        },
      );

      const yMeta = ydoc.getMap("meta");
      yMeta.set("lastUpload", Date.now());

      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) {
      alert("Failed to delete file");
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", droppedFiles[0]);

    try {
      const apiUrl = `${
        import.meta.env.VITE_API_URL || "http://localhost:8080"
      }/api/upload/${roomSlug}`;
      const res = await axios.post(apiUrl, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          "X-User-ID": userId,
        },
      });

      const newFile = res.data;
      const yMeta = ydoc.getMap("meta");
      yMeta.set("lastUpload", Date.now());

      setFiles((prev) => [...(Array.isArray(prev) ? prev : []), newFile]);
    } catch (err) {
      alert("Upload failed. Max 100MB.");
    } finally {
      setUploading(false);
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

        <div className="header-content">
          <h3>Files</h3>
          <span className="badge">{files.length}</span>
        </div>
      </div>

      <div className="files-list custom-scrollbar">
        {files.length === 0 ? (
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
                  <a
                    href={`${
                      import.meta.env.VITE_API_URL || "http://localhost:8080"
                    }${f.url}`}
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
                {canDelete && (
                  <button
                    onClick={() => handleDeleteFile(f.id)}
                    className="btn-icon delete"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {uploading && (
        <div className="upload-indicator">
          <span>Uploading...</span>
        </div>
      )}
    </div>
  );
};
