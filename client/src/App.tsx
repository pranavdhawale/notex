import { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useParams,
  useNavigate,
} from "react-router-dom";
import { Editor } from "./editor/Editor";
import { LandingPage } from "./LandingPage";
import axios from "axios";
import "./App.css";

const EditorRoute = () => {
  const { roomSlug } = useParams<{ roomSlug: string }>();
  const navigate = useNavigate();
  const [username, setUsername] = useState(
    localStorage.getItem("notex_username") || ""
  );
  const [tempName, setTempName] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  // Ensure user ID exists
  useEffect(() => {
    if (!localStorage.getItem("notex_user_id")) {
      localStorage.setItem(
        "notex_user_id",
        "user_" + Math.random().toString(36).substr(2, 9)
      );
    }
  }, []);

  // Verify ownership by fetching room details
  useEffect(() => {
    if (roomSlug) {
      axios
        .get(
          `${
            import.meta.env.VITE_API_URL || "http://localhost:8080"
          }/api/rooms/${roomSlug}`
        )
        .then((res) => {
          const currentUserId = localStorage.getItem("notex_user_id");
          if (res.data.owner === currentUserId) {
            setIsOwner(true);
          }
        })
        .catch((err) => {
          console.error(
            "Failed to fetch room details for ownership check",
            err
          );
        });
    }
  }, [roomSlug]);

  if (!username) {
    return (
      <div
        className="name-prompt-overlay"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            background: "white",
            padding: "2rem",
            borderRadius: "8px",
            textAlign: "center",
          }}
        >
          <h3>Enter your name to join</h3>
          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tempName.trim()) {
                localStorage.setItem("notex_username", tempName.trim());
                setUsername(tempName.trim());
              }
            }}
            style={{
              padding: "8px",
              fontSize: "1rem",
              marginBottom: "1rem",
              width: "200px",
            }}
            autoFocus
          />
          <br />
          <button
            onClick={() => {
              if (tempName.trim()) {
                localStorage.setItem("notex_username", tempName.trim());
                setUsername(tempName.trim());
              }
            }}
            disabled={!tempName.trim()}
            style={{
              padding: "8px 16px",
              background: "#0366d6",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Join Room
          </button>
        </div>
      </div>
    );
  }

  const handleDeleteRoom = async () => {
    if (
      confirm(
        "Are you sure you want to delete this room? ALL DATA WILL BE LOST."
      )
    ) {
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

  if (!roomSlug) return <div>Invalid Room</div>;

  return (
    <div className="App">
      <header className="app-header">
        <div>
          <h1
            onClick={() => navigate("/")}
            style={{
              cursor: "pointer",
              display: "inline-block",
              marginRight: "10px",
            }}
          >
            Notex
          </h1>
          <span style={{ color: "#666", fontSize: "0.9rem" }}>
            {" "}
            / {roomSlug}
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "#666",
              color: "white",
              border: "none",
              padding: "4px 8px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Leave
          </button>
          {isOwner && (
            <button
              onClick={handleDeleteRoom}
              style={{
                background: "#d73a49",
                color: "white",
                border: "none",
                padding: "4px 8px",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Delete Room
            </button>
          )}
        </div>
      </header>
      <div className="app-content">
        <Editor
          roomSlug={roomSlug}
          username={username}
          userId={localStorage.getItem("notex_user_id") || ""}
          isOwner={isOwner}
        />
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/:roomSlug" element={<EditorRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
