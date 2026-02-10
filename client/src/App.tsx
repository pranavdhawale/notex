import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { Editor } from "./editor/Editor";
import { LandingPage } from "./LandingPage";
import axios from "axios";
import "./App.css";

const EditorRoute = () => {
  const { roomSlug } = useParams<{ roomSlug: string }>();
  const [username, setUsername] = useState(
    localStorage.getItem("notex_username") || "",
  );
  const [tempName, setTempName] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  // Ensure user ID exists
  useEffect(() => {
    if (!localStorage.getItem("notex_user_id")) {
      localStorage.setItem(
        "notex_user_id",
        "user_" + Math.random().toString(36).substr(2, 9),
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
          }/api/rooms/${roomSlug}`,
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
            err,
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
          background: "var(--bg-gradient)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000,
        }}
      >
        {/* Reuse glass-card styling from LandingPage */}
        <div className="glass-card" style={{ width: "400px", padding: "40px" }}>
          <h2
            style={{
              color: "var(--text-main)",
              marginBottom: "20px",
              textAlign: "center",
              fontSize: "1.5rem",
            }}
          >
            Enter your name to join
          </h2>

          <div className="input-group">
            <input
              type="text"
              placeholder="Your Name"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tempName.trim()) {
                  localStorage.setItem("notex_username", tempName.trim());
                  setUsername(tempName.trim());
                }
              }}
              className="glass-input"
              autoFocus
            />
          </div>

          <div
            className="actions"
            style={{ justifyContent: "center", marginTop: "20px" }}
          >
            <button
              onClick={() => {
                if (tempName.trim()) {
                  localStorage.setItem("notex_username", tempName.trim());
                  setUsername(tempName.trim());
                }
              }}
              disabled={!tempName.trim()}
              className="btn-primary"
              style={{ width: "100%" }}
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!roomSlug) return <div>Invalid Room</div>;

  if (!roomSlug) return <div>Invalid Room</div>;

  // Render Editor directly without app-header wrapper
  return (
    <div className="App">
      <Editor
        roomSlug={roomSlug}
        username={username}
        userId={localStorage.getItem("notex_user_id") || ""}
        isOwner={isOwner}
      />
    </div>
  );
};

import { ThemeProvider } from "./components/ThemeContext";
import Particles from "./components/Particles";

const GlobalParticles = () => {
  const particleColor = "#ffffff"; // White particles for dark mode

  return (
    <Particles
      particleColors={[particleColor, particleColor]}
      particleCount={300}
      particleSpread={10}
      speed={0.05}
      particleBaseSize={120}
      moveParticlesOnHover={false}
      alphaParticles={false}
      disableRotation={false}
      pixelRatio={1}
      className="global-particles"
    />
  );
};

function App() {
  return (
    <ThemeProvider>
      <GlobalParticles />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/:roomSlug" element={<EditorRoute />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
