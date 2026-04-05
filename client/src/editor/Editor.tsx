import React, { useEffect, useState, useRef, forwardRef, useImperativeHandle } from "react";
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
import { FilesModal } from "./FilesModal";
import { ActiveUsersAvatars } from "../components/ActiveUsersAvatars";
import { Toolbar } from "./Toolbar";
import { TableContextMenu } from "./TableContextMenu";
import api, { getWebSocketBaseUrl } from "../utils/api";
import { LogOut, Trash, Save, Loader2, File, ArrowUp, ArrowDown, Key, Menu, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cacheManager } from "../utils/SmartCacheManager";
import { NotFoundView } from "../components/NotFoundView";
import { toast } from "../components/Toaster";
import { KeyboardShortcutsPopup } from "../components/KeyboardShortcutsPopup";
import { LockRoomModal, UnlockRoomModal } from "../components/LockUnlockModal";
import { CURSOR_COLORS } from "../utils/constants";

interface EditorProps {
  roomSlug: string;
  username: string;
  userId: string;
  isOwner: boolean;
  authToken?: string;
  roomLocked: boolean;
  onLockChange: (locked: boolean, token?: string) => void;
}

export type EditorRef = {
  focus: () => void;
};

const TiptapEditor = forwardRef<EditorRef, {
  provider: WebsocketProvider;
  userDetails: { name: string; color: string; userId: string };
  roomSlug: string;
  status: string;
  isOwner: boolean;
  roomLocked: boolean;
  saving: boolean;
  setShowFilesModal: (show: boolean) => void;
  handleLeave: () => void;
  handleDeleteRoom: () => void;
  handleSave: () => void;
  onLockRoom: () => void;
  onUnlockRoom: () => void;
}>(({
  provider,
  userDetails,
  roomSlug,
  status,
  isOwner,
  roomLocked,
  saving,
  setShowFilesModal,
  handleLeave,
  handleDeleteRoom,
  handleSave,
  onLockRoom,
  onUnlockRoom,
}, ref) => {
  const [menuState, setMenuState] = useState({ isOpen: false, x: 0, y: 0 });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    },
    onUpdate: () => {
      // Yjs state is updated automatically via Collaboration extension
      // Caching is handled by the ydoc.on('update') listener in parent component
    },
  });

  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      editor?.commands.focus();
    },
  }), [editor]);

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

  // Close mobile menu on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };

    if (mobileMenuOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [mobileMenuOpen]);

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
      {/* Fixed Header - Outside scroll container */}
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
              className="room-name"
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

          <div className="status-bar-right" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <ActiveUsersAvatars provider={provider} />

            <div
              className="header-separator"
              style={{
                width: 1,
                background: "rgba(255,255,255,0.1)",
                height: "24px",
                margin: "0 5px",
              }}
            ></div>

            {/* Mobile menu button - visible only on mobile */}
            <div className="mobile-menu-container">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="btn-icon mobile-menu-btn"
                title="Menu"
              >
                <Menu size={20} />
              </button>
              {mobileMenuOpen && (
                <>
                  <div className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} />
                  <div className="mobile-menu-dropdown">
                    {/* Room name - clickable to copy link */}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        const el = document.getElementById("copy-feedback-mobile");
                        if (el) {
                          el.style.opacity = "1";
                          setTimeout(() => (el.style.opacity = "0"), 2000);
                        }
                      }}
                      className="mobile-menu-item mobile-menu-room-name"
                    >
                      <MapPin size={18} style={{ color: "var(--color-error, #ff3b30)" }} />
                      <span>{roomSlug}</span>
                      <span
                        id="copy-feedback-mobile"
                        style={{
                          opacity: 0,
                          transition: "opacity 0.3s",
                          color: "#4caf50",
                          fontSize: "0.75rem",
                          marginLeft: "auto",
                        }}
                      >
                        Copied!
                      </span>
                    </button>

                    {isOwner && (
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          roomLocked ? onUnlockRoom() : onLockRoom();
                        }}
                        className="mobile-menu-item"
                      >
                        <Key size={18} style={{ color: roomLocked ? "var(--color-primary)" : "inherit" }} />
                        <span>{roomLocked ? "Unlock Room" : "Lock Room"}</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setShowFilesModal(true);
                      }}
                      className="mobile-menu-item"
                    >
                      <File size={18} />
                      <span>Files</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Desktop buttons - hidden on mobile */}
            {isOwner && (
              <button
                onClick={roomLocked ? onUnlockRoom : onLockRoom}
                className="btn-icon desktop-only-btn"
                style={{ color: roomLocked ? "var(--color-primary)" : "var(--text-secondary)" }}
                title={roomLocked ? "Unlock Room" : "Lock Room"}
              >
                <Key size={18} />
              </button>
            )}
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
          </div>
        </div>

        <Toolbar editor={editor} />
      </div>

      {/* Scrollable Content Area */}
      <div ref={scrollRef} style={{ flex: 1, overflow: "auto", position: "relative" }}>
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
});

export const Editor: React.FC<EditorProps> = ({
  roomSlug,
  username,
  userId,
  isOwner,
  authToken,
  roomLocked,
  onLockChange,
}) => {
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [status, setStatus] = useState("connecting");
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [saving, setSaving] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  // Editor ref for focus management
  const editorRef = useRef<EditorRef>(null);

  // Track if we're intentionally leaving (deleting room) to prevent false 404 errors
  const isLeavingRef = useRef(false);
  // Track if we should skip saving cache on cleanup (intentional leave/delete)
  const skipCacheSaveRef = useRef(false);

  const handleLeave = () => {
    isLeavingRef.current = true;
    skipCacheSaveRef.current = true;
    // Clear cache when intentionally leaving
    cacheManager.remove(roomSlug);
    navigate("/");
  };

  const handleDeleteRoom = async () => {
    if (
      confirm(
        "Are you sure you want to delete this room? ALL DATA WILL BE LOST.",
      )
    ) {
      isLeavingRef.current = true; // Prevent false 404 error on disconnect
      skipCacheSaveRef.current = true; // Skip cache save on cleanup
      try {
        await api.delete(`/api/rooms/${roomSlug}`);

        // Clear cache for this room
        cacheManager.remove(roomSlug);

        navigate("/");
      } catch (e) {
        isLeavingRef.current = false; // Reset on error
      toast.error("Failed to delete room");
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
    } catch (err: any) {
      if (err.response?.data?.error) {
        // Server returned an error message - show it
        toast.error(err.response.data.error);
      } else {
        toast.error("Upload failed. Max 200MB.");
      }
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
      toast.error("Failed to delete file");
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
      toast.error("Failed to delete all files");
    }
  };

  // Stable user details with persisted color
  const [userDetails] = useState(() => {
    let color = localStorage.getItem("notex_user_color");
    if (!color) {
      color = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
      localStorage.setItem("notex_user_color", color);
    }
    return {
      name: username,
      userId: userId,
      color: color,
    };
  });

  // Save Yjs state to cache on updates (debounced)
  useEffect(() => {
    if (!ydoc) return;

    let saveTimeout: ReturnType<typeof setTimeout>;

    const saveHandler = () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        cacheManager.saveYjs(roomSlug, ydoc);
      }, 500); // 500ms debounce
    };

    ydoc.on('update', saveHandler);

    return () => {
      clearTimeout(saveTimeout);
      ydoc.off('update', saveHandler);
    };
  }, [ydoc, roomSlug]);

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

  // Fetch room snapshot from server (for 404 check and server merge)
  useEffect(() => {
    const controller = new AbortController();

    const fetchRoomSnapshot = async () => {
      if (!ydoc) return;

      // Check if room exists
      try {
        const res = await api.get(`/api/rooms/${roomSlug}`, {
          signal: controller.signal,
        });

        // Apply server snapshot if it exists (Yjs will merge with local cache)
        if (res.data.content) {
          try {
            const binaryString = window.atob(res.data.content);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            Y.applyUpdate(ydoc, bytes);
            console.log("📥 Server snapshot merged");
          } catch (err) {
            console.error("Failed to merge server snapshot", err);
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
        // Other errors (e.g. network) just fail silently
      }
    };

    fetchRoomSnapshot();

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

      // Load Yjs cache BEFORE connecting to WebSocket
      const cachedUpdate = cacheManager.loadYjs(roomSlug);
      if (cachedUpdate) {
        try {
          Y.applyUpdate(doc, cachedUpdate);
          console.log("✅ Restored Yjs state from SessionStorage");
        } catch (e) {
          console.error("Failed to apply cached Yjs state:", e);
        }
      }

      // Create provider with connect: false to prevent early sync
      const wsUrl = getWebSocketBaseUrl();
      const params: Record<string, string> = { userID: userDetails.userId };
      if (authToken) {
        params.authToken = authToken;
      }

      provider = new WebsocketProvider(wsUrl, roomSlug, doc, {
        connect: false,
        params
      });

      provider.on("status", (event: any) => {
        setStatus(event.status);
        if (event.status === "connected" && provider) {
          // Ensure we only set awareness when fully connected
          provider.awareness.setLocalStateField("user", userDetails);
        }
      });

      setProvider(provider);

      // Now connect (after cache is applied)
      provider.connect();
    };

    // Small delay to ensure previous cleanup is complete (fixes ghost cursors on strict mode/hot reload)
    const timeoutId = setTimeout(setup, 100);

    return () => {
      clearTimeout(timeoutId);
      if (provider) {
        // Save Yjs state before disconnecting (skip if intentionally leaving/deleting)
        if (doc && !skipCacheSaveRef.current) {
          try {
            cacheManager.saveYjs(roomSlug, doc);
          } catch (e) {
            console.error("Failed to save Yjs cache on cleanup:", e);
          }
        }
        provider.awareness.setLocalStateField("user", null); // Explicitly clear user
        provider.destroy();
      }
      if (doc) {
        doc.destroy();
      }
      setProvider(null);
      setYdoc(null);
    };
  }, [roomSlug, userDetails, authToken]);

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
        if (!silent) toast.success("Saved!");
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error(e);
      if (!silent) toast.error("Failed to save");
    } finally {
      // Keep "Saving..." indicator for a moment so user sees it
      setTimeout(() => setSaving(false), 500);
    }
  };

  // Keep a ref to handleSave to avoid stale closure in keyboard handler
  const handleSaveRef = useRef(handleSave);

  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  // Keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl/Cmd + S - Save
      if (modKey && e.key === "s") {
        e.preventDefault();
        handleSaveRef.current(false);
        return;
      }

      // Ctrl/Cmd + L - Lock/Unlock room (owner only)
      if (modKey && e.key === "l") {
        e.preventDefault();
        if (isOwner) {
          if (roomLocked) {
            setShowUnlockModal(true);
          } else {
            setShowLockModal(true);
          }
        }
        return;
      }

      // Ctrl/Cmd + / - Toggle shortcuts popup
      if (modKey && e.key === "/") {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOwner, roomLocked]);

  if (notFound) {
    return <NotFoundView />;
  }

  if (!provider || !ydoc) {
    return <div className="editor-container">Initializing connection...</div>;
  }

  return (
    <div className="editor-layout">
      {/* LEFT: FILES */}
      <FilesSidebar
        roomSlug={roomSlug}
        ydoc={ydoc}
        userId={userId}
        isRoomOwner={isOwner}
      />

      {/* CENTER: EDITOR */}
      <div className="editor-main">
        <TiptapEditor
          ref={editorRef}
          provider={provider}
          userDetails={userDetails}
          roomSlug={roomSlug}
          status={status}
          isOwner={isOwner}
          roomLocked={roomLocked}
          saving={saving}
          setShowFilesModal={setShowFilesModal}
          handleLeave={handleLeave}
          handleDeleteRoom={handleDeleteRoom}
          handleSave={() => handleSave(false)}
          onLockRoom={() => setShowLockModal(true)}
          onUnlockRoom={() => setShowUnlockModal(true)}
        />
      </div>

      {/* Mobile Files Modal */}
      <FilesModal
        isOpen={showFilesModal}
        onClose={() => {
          setShowFilesModal(false);
          editorRef.current?.focus();
        }}
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

      {/* Keyboard Shortcuts Popup */}
      <KeyboardShortcutsPopup
        isOpen={showShortcuts}
        onClose={() => {
          setShowShortcuts(false);
          editorRef.current?.focus();
        }}
      />

      {/* Lock/Unlock Modals */}
      <LockRoomModal
        roomSlug={roomSlug}
        isOpen={showLockModal}
        onClose={() => {
          setShowLockModal(false);
          editorRef.current?.focus();
        }}
        onSuccess={(token) => {
          onLockChange(true, token);
          setShowLockModal(false);
        }}
      />
      <UnlockRoomModal
        roomSlug={roomSlug}
        isOpen={showUnlockModal}
        onClose={() => {
          setShowUnlockModal(false);
          editorRef.current?.focus();
        }}
        onSuccess={() => {
          onLockChange(false);
          setShowUnlockModal(false);
        }}
      />
    </div>
  );
};
