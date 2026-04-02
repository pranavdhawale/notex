import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { Editor } from "./editor/Editor";
import { LandingPage } from "./LandingPage";
import { getOrCreateSession, getSession } from "./utils/session";
import "./App.css";

const EditorRoute = () => {
  const { roomSlug } = useParams<{ roomSlug: string }>();
  const [username, setUsername] = useState(
    localStorage.getItem("notex_username") || "",
  );
  const [tempName, setTempName] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  // Verify ownership by fetching room details
  useEffect(() => {
    if (roomSlug) {
      // Use fetch since we need to check room details without auth
      fetch(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:8080"
        }/api/rooms/${roomSlug}`,
      )
        .then((res) => res.json())
        .then((data) => {
          const session = getSession();
          if (data.owner && session && data.owner === session.userID) {
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

  // Get user ID from session
  const userId = getUserID() || "";

  // Render Editor directly without app-header wrapper
  return (
    <div className="App">
      <Editor
        roomSlug={roomSlug}
        username={username}
        userId={userId}
        isOwner={isOwner}
      />
    </div>
  );
};

import { ThemeProvider } from "./components/ThemeContext";
import Particles from "./components/Particles";
import { Toaster } from "./components/Toaster";
import { getUserID } from "./utils/session";

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
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize session on app load
    getOrCreateSession()
      .then(() => setSessionReady(true))
      .catch((err) => {
        console.error('Session initialization failed:', err);
        setSessionError(err.message);
        setSessionReady(true); // Continue anyway for graceful degradation
      });
  }, []);

  if (sessionError && !sessionReady) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--text-main)',
        textAlign: 'center',
        padding: '20px'
      }}>
        <div>
          <h2>Connection Error</h2>
          <p>{sessionError}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--text-main)'
      }}>
        <p>Initializing...</p>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <GlobalParticles />
      <Toaster />
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
