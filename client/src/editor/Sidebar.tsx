import React, { useEffect, useState } from "react";
import axios from "axios";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import "./Sidebar.css";

interface SidebarProps {
  roomSlug: string;
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  userId: string;
  isRoomOwner: boolean;
}

interface FileData {
  id: string;
  name: string;
  url: string;
  size: number;
  uploaderId?: string;
}

interface UserData {
  name: string;
  color: string;
  userId?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  roomSlug,
  ydoc,
  provider,
  userId,
  isRoomOwner,
}) => {
  // --- User State ---
  const [users, setUsers] = useState<UserData[]>([]);

  useEffect(() => {
    const updateUsers = () => {
      const states = provider.awareness.getStates();
      const uniqueUsers = new Map<string, UserData>();

      states.forEach((state: any) => {
        if (state.user && state.user.userId) {
          uniqueUsers.set(state.user.userId, state.user);
        } else if (state.user) {
          // Fallback for legacy clients without userId?
          // Or just use name/color as key? Let's use name for fallback.
          uniqueUsers.set(state.user.name, state.user);
        }
      });

      setUsers(Array.from(uniqueUsers.values()));
    };

    provider.awareness.on("change", updateUsers);
    updateUsers(); // Initial fetch

    return () => {
      provider.awareness.off("change", updateUsers);
    };
  }, [provider]);

  // --- File State ---
  const [files, setFiles] = useState<FileData[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Sync Logic (Same as FileSidebar)
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
        }/api/rooms/${roomSlug}/files`
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
        }
      );

      // Notify
      const yMeta = ydoc.getMap("meta");
      yMeta.set("lastUpload", Date.now()); // Reuse update signal

      // Optimistic update
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

      // Notify others
      const yMeta = ydoc.getMap("meta");
      yMeta.set("lastUpload", Date.now());

      // Update local safely
      setFiles((prev) => [...(Array.isArray(prev) ? prev : []), newFile]);
    } catch (err) {
      alert("Upload failed. Max 100MB.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`sidebar ${isDragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Active Users Section */}
      <div className="sidebar-section users-section">
        <h3>Active Users ({users.length})</h3>
        <div className="user-list">
          {users.length === 0 && (
            <div style={{ color: "#999", fontSize: "0.8rem" }}>Syncing...</div>
          )}
          {users.map((u, i) => (
            <div key={i} className="user-item">
              <div className="user-dot" style={{ backgroundColor: u.color }} />
              <span>
                {u.name}{" "}
                {u.name === provider.awareness.getLocalState()?.user?.name
                  ? "(You)"
                  : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Files Section */}
      <div className="sidebar-section files-section">
        <div style={{ padding: "16px", paddingBottom: "0" }}>
          <h3>Files</h3>
        </div>

        {uploading && <div className="uploading">Uploading...</div>}

        <div className="files-container">
          {Array.isArray(files) && files.length > 0 ? (
            files.map((f) => {
              const canDelete =
                isRoomOwner || (f.uploaderId && f.uploaderId === userId);
              return (
                <div key={f.id} className="file-item">
                  <div
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
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
                  </div>
                  <span className="file-size">
                    {(f.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  {canDelete && (
                    <button
                      onClick={() => handleDeleteFile(f.id)}
                      style={{
                        marginLeft: "8px",
                        background: "transparent",
                        border: "none",
                        color: "#d73a49",
                        cursor: "pointer",
                        fontWeight: "bold",
                      }}
                      title="Delete File"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div style={{ color: "#888", fontSize: "0.9rem" }}>
              No files uploaded
            </div>
          )}
        </div>

        <div className="drop-area">
          <div className="drop-hint">Drop files here</div>
        </div>
      </div>
    </div>
  );
};
