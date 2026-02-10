import React, { useEffect, useState } from "react";
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
import Particles from "../components/Particles";
import { FilesSidebar } from "./FilesSidebar";
import { UsersSidebar } from "./UsersSidebar";
import { Toolbar } from "./Toolbar";
import { ThemeToggle } from "../components/ThemeToggle";
import { useTheme } from "../components/ThemeContext";
import axios from "axios";
import { Users, LogOut, Trash, Save, Loader2 } from "lucide-react";
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
  handleLeave,
  handleDeleteRoom,
  handleSave,
  initialContent,
}) => {
  const [debouncer, setDebouncer] = useState<ReturnType<typeof setTimeout>>();

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
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
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
              <ThemeToggle className="btn-icon" />
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
                onClick={() => setShowUsers(!showUsers)}
                className="btn-icon"
                title="Toggle Users"
              >
                <Users size={20} />
              </button>
            </div>
          </div>

          <Toolbar editor={editor} />
        </div>

        <EditorContent editor={editor} />
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
  const { theme } = useTheme();
  const navigate = useNavigate();

  const particleColor = theme === "light" ? "#000000" : "#ffffff";

  const handleLeave = () => {
    navigate("/");
  };

  const handleDeleteRoom = async () => {
    if (
      confirm(
        "Are you sure you want to delete this room? ALL DATA WILL BE LOST.",
      )
    ) {
      try {
        await axios.delete(
          `${
            import.meta.env.VITE_API_URL || "http://localhost:8080"
          }/api/rooms/${roomSlug}`,
        );

        // Clear cache for this room
        cacheManager.remove(roomSlug);
        console.log("🗑️ Cleared cache for deleted room");

        navigate("/");
      } catch (e) {
        alert("Failed to delete room");
      }
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

  // Initial Load from SmartCache OR Server
  useEffect(() => {
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
        const res = await axios.get(
          `${
            import.meta.env.VITE_API_URL || "http://localhost:8080"
          }/api/rooms/${roomSlug}`,
        );

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
  }, [roomSlug, ydoc]);

  useEffect(() => {
    if (status === "disconnected") {
      // Verify if room still exists
      const checkRoom = async () => {
        try {
          await axios.get(
            `${
              import.meta.env.VITE_API_URL || "http://localhost:8080"
            }/api/rooms/${roomSlug}`,
          );
        } catch (e: any) {
          if (e.response && e.response.status === 404) {
            setNotFound(true);
          }
        }
      };
      checkRoom();
    }
  }, [status, roomSlug]);

  useEffect(() => {
    let provider: WebsocketProvider | null = null;
    let doc: Y.Doc | null = null;

    const setup = () => {
      doc = new Y.Doc();
      setYdoc(doc);

      const wsUrl =
        (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(
          "http",
          "ws",
        ) + "/ws";

      provider = new WebsocketProvider(wsUrl, roomSlug, doc, {
        params: { room: roomSlug },
      });

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
        await axios.post(
          `${
            import.meta.env.VITE_API_URL || "http://localhost:8080"
          }/api/rooms/${roomSlug}/save`,
          {
            content: base64,
          },
        );
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
      <Particles
        key={theme}
        particleColors={[particleColor, particleColor]}
        particleCount={900}
        particleSpread={10}
        speed={0.1}
        particleBaseSize={100}
        moveParticlesOnHover={false}
        alphaParticles={false}
        disableRotation={false}
        pixelRatio={1}
      />

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
          handleLeave={handleLeave}
          handleDeleteRoom={handleDeleteRoom}
          handleSave={() => handleSave(false)}
          initialContent={initialContent}
        />
      </div>

      {/* RIGHT SIDEBAR: USERS */}
      <UsersSidebar
        provider={provider}
        isOpen={showUsers}
        onClose={() => setShowUsers(false)}
      />
    </div>
  );
};
