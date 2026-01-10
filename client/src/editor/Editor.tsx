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
}> = ({ provider, userDetails }) => {
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
  });

  return (
    <div className="editor-container">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
};

import { FilesSidebar } from "./FilesSidebar";
import { UsersSidebar } from "./UsersSidebar";
import { Toolbar } from "./Toolbar";
import axios from "axios";
import { Users, LogOut, Trash } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  const [showUsers, setShowUsers] = useState(true);
  const navigate = useNavigate();

  const handleLeave = () => {
    navigate("/");
  };

  const handleDeleteRoom = async () => {
    if (confirm("Are you sure you want to delete this room? ALL DATA WILL BE LOST.")) {
      try {
        await axios.delete(
          `${
            import.meta.env.VITE_API_URL || "http://localhost:8080"
          }/api/rooms/${roomSlug}`
        );
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

  // Load Snapshot and Check Room
  useEffect(() => {
    const fetchRoomData = async () => {
      try {
        const res = await axios.get(
          `${
            import.meta.env.VITE_API_URL || "http://localhost:8080"
          }/api/rooms/${roomSlug}`
        );

        // Restore Snapshot if exists
        if (res.data.content && ydoc) {
          try {
            // Decode base64 to Uint8Array through binary string
            const binaryString = window.atob(res.data.content);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            Y.applyUpdate(ydoc, bytes);
            console.log("Snapshot loaded");
          } catch (err) {
            console.error("Failed to load snapshot", err);
          }
        }
      } catch (e: any) {
        // Room check moved here for efficiency? No, separate effect handles disconnect.
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
            }/api/rooms/${roomSlug}`
          );
        } catch (e: any) {
          if (e.response && e.response.status === 404) {
            alert("Room deleted by owner.");
            window.location.href = "/";
          }
        }
      };
      checkRoom();
    }
  }, [status, roomSlug]);

  useEffect(() => {
    const doc = new Y.Doc();
    setYdoc(doc);

    const wsUrl =
      (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(
        "http",
        "ws"
      ) + "/ws";

    const prov = new WebsocketProvider(wsUrl, roomSlug, doc, {
      params: { room: roomSlug },
    });

    prov.on("status", (event: any) => {
      setStatus(event.status);
      if (event.status === "connected") {
        prov.awareness.setLocalStateField("user", userDetails);
      }
    });

    // Initial awareness set
    prov.awareness.setLocalStateField("user", userDetails);

    setProvider(prov);

    return () => {
      prov.destroy();
      doc.destroy();
      setProvider(null);
      setYdoc(null);
    };
  }, [roomSlug, userDetails]); // depend on stable userDetails

  const handleSave = async () => {
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
          }
        );
        alert("Saved!");
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error(e);
      alert("Failed to save");
    } finally {
      setSaving(false);
    }
  };

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
        <div
          className="status-bar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.1)"
          }}
        >
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
             <span className={`status-dot ${status === 'connected' ? 'online' : 'offline'}`}></span>
             <span
              onClick={() => {
                navigator.clipboard.writeText(roomSlug);
                const el = document.getElementById("copy-feedback");
                if (el) {
                  el.style.opacity = "1";
                  setTimeout(() => (el.style.opacity = "0"), 2000);
                }
              }}
              style={{
                cursor: "pointer",
                fontWeight: 600,
                color: "rgba(255,255,255,0.9)"
              }}
              title="Click to copy room code"
            >
              Room: {roomSlug}
            </span>
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
          
          <div style={{ display: 'flex', gap: '10px' }}>
            {isOwner && (
              <button
                onClick={handleDeleteRoom}
                className="btn-icon delete"
                title="Delete Room"
                style={{ color: '#ff4d4f' }}
              >
                <Trash size={20} />
              </button>
            )}
            <button
              onClick={handleLeave}
              className="btn-icon"
              title="Leave Room"
            >
              <LogOut size={20} />
            </button>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 5px' }}></div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
              style={{ padding: "6px 12px", fontSize: "0.9rem" }}
            >
              {saving ? "Saving..." : "Save Snapshot"}
            </button>
            <button 
              onClick={() => setShowUsers(!showUsers)}
              className="btn-icon"
              title="Toggle Users"
            >
              <Users size={20} />
            </button>
          </div>
        </div>
        <TiptapEditor provider={provider} userDetails={userDetails} />
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
