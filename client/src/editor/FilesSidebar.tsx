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
  X,
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
      const apiUrl = `${
        import.meta.env.VITE_API_URL || "http://localhost:8080"
      }/api/upload/${roomSlug}`;

      const res = await axios.post(apiUrl, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          "X-User-ID": userId,
        },
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

        <div className="header-content">
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
          <button
            className="btn-icon"
            onClick={() =>
              document.getElementById("file-upload-input")?.click()
            }
            title="Upload File"
          >
            <Upload size={18} />
          </button>
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
    </div>
  );
};
