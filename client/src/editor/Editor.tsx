import React, { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
// Extensions
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TextAlign from "@tiptap/extension-text-align";

import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import "./Editor.css";
import { FilesSidebar } from "./FilesSidebar";
import { UsersSidebar } from "./UsersSidebar";
import { FilesModal } from "./FilesModal";
import { Toolbar } from "./Toolbar";
import { TableContextMenu } from "./TableContextMenu";
import api, { getWebSocketUrl } from "../utils/api";
import { Users, LogOut, Trash, Save, Loader2, File, ArrowUp, ArrowDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cacheManager } from "../utils/SmartCacheManager";
import { NotFoundView } from "../components/NotFoundView";

interface EditorProps {
  roomSlug: string;
  username: string;
  userId: string;
  isOwner: boolean;
}

// Custom colors for cursors
const cursorColors = [
  "#958DF1",
  "#F98181",
  "#FBBC88",
  "#FAF594",
  "#70CFF8",
  "#94FADB",
  "#B9F18D",
];

const TiptapEditor: React.FC<{
  provider: WebsocketProvider;
  userDetails: { name: string; color: string; userId: string };
  roomSlug: string;
  status: string;
  isOwner: boolean;
  saving: boolean;
  showUsers: boolean;
  setShowUsers: (show: boolean) => void;
  setShowFilesModal: (show: boolean) => void;
  handleLeave: () => void;
  handleDeleteRoom: () => void;
  handleSave: () => void;
  initialContent: any; // Add initial content prop
}> = ({
  provider,
  userDetails,
  roomSlug,
  status,
  isOwner,
  saving,
  showUsers,
  setShowUsers,
  setShowFilesModal,
  handleLeave,
  handleDeleteRoom,
  handleSave,
  initialContent,
}) => {
  const [debouncer, setDebouncer] = useState<ReturnType<typeof setTimeout>>();
  const [menuState, setMenuState] = useState({ isOpen: false, x: 0, y: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Collaboration.configure({
        document: provider.doc,
      }),
      CollaborationCursor.configure({
        provider: provider,
        user: userDetails,
      }),
      Underline,
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    editorProps: {
      attributes: {
        class: "ProseMirror",
      },
      scrollThreshold: { top: 80, bottom: 40, left: 0, right: 0 },
      scrollMargin: { top: 80, bottom: 40, left: 0, right: 0 },
    },
    content: initialContent,
    onUpdate: ({ editor }) => {
      // Debounced save to SessionStorage (JSON content)
      if (debouncer) clearTimeout(debouncer);
      const timer = setTimeout(() => {
        const json = JSON.stringify(editor.getJSON());
        cacheManager.save(roomSlug, json);
      }, 2000);
      setDebouncer(timer);
    },
  });

  // Cleanup debouncer
  useEffect(() => {
    return () => {
      if (debouncer) clearTimeout(debouncer);
    };
  }, [debouncer]);

  // Auto-hide scrollbar + track scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      setScrollTop(el.scrollTop);

      // Show scrollbar
      el.classList.add("is-scrolling");

      // Hide again after 1500ms of inactivity
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
      scrollHideTimer.current = setTimeout(() => {
        el.classList.remove("is-scrolling");
      }, 1500);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    };
  }, []);

  const scrollToTop = () =>
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  const scrollToEnd = () =>
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });

  // Handle right-click context menu for tables
  const handleContextMenu = (e: React.MouseEvent) => {
    if (!editor) return;

    const target = e.target as HTMLElement;
    // Check if the right-click occurred inside a table
    const isInsideTable = target.closest('table') !== null || target.closest('td') !== null || target.closest('th') !== null || editor.isActive('table');

    if (isInsideTable) {
      e.preventDefault();
      // Set the cursor position to the clicked element if possible, 
      // though Tiptap usually handles this automatically on mousedown.
      
      setMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
      });
    } else {
      // If clicking outside a table, just let native menu show or close our menu
      if (menuState.isOpen) {
        setMenuState(prev => ({ ...prev, isOpen: false }));
      }
    }
  };

  return (
    <div
      className="editor-container"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <div ref={scrollRef} style={{ flex: 1, overflow: "auto", position: "relative", scrollPaddingTop: "80px" }}>
        {/* Unified Sticky Header */}
        <div className="sticky-header-glass">
          {/* Single Liquid Glass Background */}
          <div className="liquid-glass-container">
            <div className="liquid-glass-backdrop"></div>
            <div className="liquid-glass-distortion top"></div>
            <div className="liquid-glass-distortion bottom"></div>
            <div className="liquid-glass-distortion left"></div>
            <div className="liquid-glass-distortion right"></div>
          </div>

          <div className="status-bar-row">
            <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
              <span
                className={`status-dot ${status === "connected" ? "online" : "offline"}`}
              ></span>
              <span
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  const el = document.getElementById("copy-feedback");
                  if (el) {
                    el.style.opacity = "1";
                    setTimeout(() => (el.style.opacity = "0"), 2000);
                  }
                }}
                style={{
                  cursor: "pointer",
                  fontWeight: 600,
                  color: "var(--text-main)",
                }}
                title="Click to copy room link"
              >
                Room: {roomSlug}
              </span>
              <button
                onClick={handleLeave}
                className="btn-icon"
                title="Leave Room"
              >
                <LogOut size={20} />
              </button>
              {isOwner && (
                <button
                  onClick={handleDeleteRoom}
                  className="btn-icon delete"
                  title="Delete Room"
                  style={{ color: "#ff4d4f" }}
                >
                  <Trash size={20} />
                </button>
              )}
              <span
                id="copy-feedback"
                style={{
                  opacity: 0,
                  transition: "opacity 0.3s",
                  color: "#4caf50",
                  fontSize: "0.8em",
                }}
              >
                Copied!
              </span>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-icon"
                style={{ color: "var(--color-primary)" }}
                title={saving ? "Saving..." : "Save Snapshot"}
              >
                {saving ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Save size={20} />
                )}
              </button>
              <div
                style={{
                  width: 1,
                  background: "rgba(255,255,255,0.1)",
                  height: "24px",
                  margin: "0 5px",
                }}
              ></div>
              <button
                onClick={() => setShowFilesModal(true)}
                className="btn-icon btn-files-mobile"
                title="Files"
              >
                <File size={20} />
              </button>
              <button
                onClick={() => setShowUsers(!showUsers)}
                className="btn-icon btn-users"
                title="Toggle Users"
              >
                <Users size={20} />
              </button>
            </div>
          </div>

          <Toolbar editor={editor} />
        </div>

        <TableContextMenu 
          editor={editor} 
          isOpen={menuState.isOpen}
          x={menuState.x}
          y={menuState.y}
          onClose={() => setMenuState(prev => ({ ...prev, isOpen: false }))}
        />
        <div onContextMenu={handleContextMenu} style={{ minHeight: '100%' }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Scroll Navigation FABs */}
      <div className="scroll-nav-group">
        <button
          className={`scroll-nav-btn ${scrollTop > 200 ? "visible" : "hidden"}`}
          onClick={scrollToTop}
          title="Go to Top"
        >
          <ArrowUp size={16} />
        </button>
        <button
          className="scroll-nav-btn visible"
          onClick={scrollToEnd}
          title="Go to End"
        >
          <ArrowDown size={16} />
        </button>
      </div>
    </div>
  );
};

export const Editor: React.FC<EditorProps> = ({
  roomSlug,
  username,
  userId,
  isOwner,
}) => {
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [status, setStatus] = useState("connecting");
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [initialContent, setInitialContent] = useState<any>(null); // State for initial content
  const [showUsers, setShowUsers] = useState(() => {
    const saved = localStorage.getItem("notex_show_users");
    return saved === null ? true : saved === "true";
  });
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  // Track if we're intentionally leaving (deleting room) to prevent false 404 errors
  const isLeavingRef = useRef(false);

  const handleLeave = () => {
    isLeavingRef.current = true;
    navigate("/");
  };

  const handleDeleteRoom = async () => {
    if (
      confirm(
        "Are you sure you want to delete this room? ALL DATA WILL BE LOST.",
      )
    ) {
      isLeavingRef.current = true; // Prevent false 404 error on disconnect
      try {
        await api.delete(`/api/rooms/${roomSlug}`);

        // Clear cache for this room
        cacheManager.remove(roomSlug);
        console.log("🗑️ Cleared cache for deleted room");

        navigate("/");
      } catch (e) {
        isLeavingRef.current = false; // Reset on error
        alert("Failed to delete room");
      }
    }
  };

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState("");

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadSpeed("0 KB/s");
    const formData = new FormData();
    formData.append("file", file);

    let lastLoaded = 0;
    let lastTime = Date.now();

    try {
      const res = await api.post(`/api/upload/${roomSlug}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 10 * 60 * 1000,
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || file.size;
          const current = progressEvent.loaded;
          const percentCompleted = Math.round((current * 100) / total);
          setUploadProgress(percentCompleted);

          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          if (timeDiff >= 0.5) {
            const loadedDiff = current - lastLoaded;
            const speed = loadedDiff / timeDiff;
            if (speed > 1024 * 1024) {
              setUploadSpeed(`${(speed / (1024 * 1024)).toFixed(1)} MB/s`);
            } else {
              setUploadSpeed(`${(speed / 1024).toFixed(1)} KB/s`);
            }
            lastLoaded = current;
            lastTime = now;
          }
        },
      });

      const newFile = res.data;
      if (ydoc) {
        const yMeta = ydoc.getMap("meta");
        yMeta.set("lastUpload", Date.now());
      }

      setFiles((prev) => [...prev, newFile]);
    } catch (err) {
      alert("Upload failed. Max 200MB.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadSpeed("");
    }
  };

  const handleFileDelete = async (fileId: string) => {
    if (!confirm("Delete this file?")) return;
    try {
      await api.delete(`/api/rooms/${roomSlug}/files/${fileId}`);

      if (ydoc) {
        const yMeta = ydoc.getMap("meta");
        yMeta.set("lastUpload", Date.now());
      }

      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) {
      alert("Failed to delete file");
    }
  };

  const handleDeleteAll = async (scope: "me" | "all") => {
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
      alert("Failed to delete all files");
    }
  };

  // Stable user details with persisted color
  const [userDetails] = useState(() => {
    let color = localStorage.getItem("notex_user_color");
    if (!color) {
      color = cursorColors[Math.floor(Math.random() * cursorColors.length)];
      localStorage.setItem("notex_user_color", color);
    }
    return {
      name: username,
      userId: userId,
      color: color,
    };
  });

  useEffect(() => {
    localStorage.setItem("notex_show_users", String(showUsers));
  }, [showUsers]);

  // Fetch files for mobile modal
  useEffect(() => {
    const fetchFiles = async () => {
      if (!ydoc) return;
      try {
        const res = await api.get(`/api/rooms/${roomSlug}/files`);
        setFiles(Array.isArray(res.data) ? res.data : []);
      } catch (e) {
        console.error(e);
        setFiles([]);
      }
    };

    if (ydoc) {
      fetchFiles();

      // Refetch when metadata changes
      const yMeta = ydoc.getMap("meta");
      const observer = () => {
        fetchFiles();
      };
      yMeta.observe(observer);
      return () => yMeta.unobserve(observer);
    }
  }, [roomSlug, ydoc]);

  // Initial Load from SmartCache OR Server
  useEffect(() => {
    const controller = new AbortController();

    const fetchRoomData = async () => {
      if (!ydoc) return;

      // 1. Try SmartCache First (SessionStorage - JSON)
      const cached = cacheManager.load(roomSlug);
      if (cached) {
        try {
          const jsonContent = JSON.parse(cached);
          setInitialContent(jsonContent);
          console.log("✅ Restored from SessionStorage (JSON)");
          // We don't return here because we still might want to fetch server snapshot if needed,
          // OR rely on Yjs sync.
          // For now, if we have local cache, we trust it for the *initial* view.
          return;
        } catch (e) {
          console.error("Failed to parse cached content:", e);
        }
      }

      // 2. Fetch from Server (Snapshot) if no local data
      try {
        const res = await api.get(`/api/rooms/${roomSlug}`, {
          signal: controller.signal,
        });

        if (res.data.content && ydoc) {
          try {
            const binaryString = window.atob(res.data.content);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            Y.applyUpdate(ydoc, bytes);
            console.log("📥 Snapshot loaded from Server");
          } catch (err) {
            console.error("Failed to load snapshot", err);
          }
        }
      } catch (e: any) {
        // Ignore cancellation errors
        if (e.name === 'CanceledError' || e.code === 'ERR_CANCELED') {
          return;
        }
        if (e.response && e.response.status === 404) {
          setNotFound(true);
          return;
        }
        // Other errors (e.g. network) just fail silently for now or retry
      }
    };

    if (ydoc) {
      fetchRoomData();
    }

    return () => controller.abort();
  }, [roomSlug, ydoc]);

  useEffect(() => {
    // Only check room if we're disconnected and not intentionally leaving
    if (status === "disconnected" && !notFound && !isLeavingRef.current) {
      // Verify if room still exists
      const checkRoom = async () => {
        try {
          await api.get(`/api/rooms/${roomSlug}`);
        } catch (e: any) {
          if (isLeavingRef.current) return; // We're leaving, ignore errors
          if (e.response && e.response.status === 404) {
            setNotFound(true);
          }
        }
      };
      checkRoom();
    }
  }, [status, roomSlug, notFound]);

  useEffect(() => {
    let provider: WebsocketProvider | null = null;
    let doc: Y.Doc | null = null;

    const setup = () => {
      doc = new Y.Doc();
      setYdoc(doc);

      const wsUrl = getWebSocketUrl(roomSlug);

      provider = new WebsocketProvider(wsUrl, roomSlug, doc);

      provider.on("status", (event: any) => {
        setStatus(event.status);
        if (event.status === "connected" && provider) {
          // Ensure we only set awareness when fully connected
          provider.awareness.setLocalStateField("user", userDetails);
        }
      });

      setProvider(provider);
    };

    // Small delay to ensure previous cleanup is complete (fixes ghost cursors on strict mode/hot reload)
    const timeoutId = setTimeout(setup, 100);

    return () => {
      clearTimeout(timeoutId);
      if (provider) {
        provider.awareness.setLocalStateField("user", null); // Explicitly clear user
        provider.destroy();
      }
      if (doc) {
        doc.destroy();
      }
      setProvider(null);
      setYdoc(null);
    };
  }, [roomSlug, userDetails]);

  const handleSave = async (silent = false) => {
    if (!ydoc) return;
    setSaving(true);
    try {
      const stateVector = Y.encodeStateAsUpdate(ydoc);
      const blob = new Blob([stateVector as any]);
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        await api.post(`/api/rooms/${roomSlug}/save`, {
          content: base64,
        });
        if (!silent) alert("Saved!");
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error(e);
      if (!silent) alert("Failed to save");
    } finally {
      // Keep "Saving..." indicator for a moment so user sees it
      setTimeout(() => setSaving(false), 500);
    }
  };

  if (notFound) {
    return <NotFoundView />;
  }

  if (!provider || !ydoc) {
    return <div className="editor-container">Initializing connection...</div>;
  }

  return (
    <div className="editor-layout">
      {/* LEFT SIDEBAR: FILES */}
      <FilesSidebar
        roomSlug={roomSlug}
        ydoc={ydoc}
        userId={userId}
        isRoomOwner={isOwner}
      />

      {/* CENTER: EDITOR */}
      <div className="editor-main">
        <TiptapEditor
          provider={provider}
          userDetails={userDetails}
          roomSlug={roomSlug}
          status={status}
          isOwner={isOwner}
          saving={saving}
          showUsers={showUsers}
          setShowUsers={setShowUsers}
          setShowFilesModal={setShowFilesModal}
          handleLeave={handleLeave}
          handleDeleteRoom={handleDeleteRoom}
          handleSave={() => handleSave(false)}
          initialContent={initialContent}
        />
      </div>

      {/* RIGHT: USERS */}
      <UsersSidebar
        provider={provider}
        isOpen={showUsers}
        onClose={() => setShowUsers(false)}
      />

      {/* Mobile Files Modal */}
      <FilesModal
        isOpen={showFilesModal}
        onClose={() => setShowFilesModal(false)}
        files={files}
        onUpload={handleFileUpload}
        onDelete={handleFileDelete}
        onDeleteAll={handleDeleteAll}
        uploading={uploading}
        uploadProgress={uploadProgress}
        uploadSpeed={uploadSpeed}
        userId={userId}
        roomSlug={roomSlug}
        isRoomOwner={isOwner}
      />
    </div>
  );
};
