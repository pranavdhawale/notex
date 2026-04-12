import { useParams } from "react-router-dom";
import { Editor } from "./editor/Editor";
import { LandingPage } from "./LandingPage";
import { PasswordPrompt } from "./components/PasswordPrompt";
import { getUserID, getUsername, setUsername } from "./utils/session";
import "./App.css";

const EditorRoute = () => {
  const { roomSlug } = useParams<{ roomSlug: string }>();
  const [username, setLocalUsername] = useState(() => getUsername() || "");
  const [tempName, setTempName] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [roomLocked, setRoomLocked] = useState(false);
  const [roomChecked, setRoomChecked] = useState(false);
  const [roomExists, setRoomExists] = useState(true);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Fetch room details including lock status
  useEffect(() => {
    if (roomSlug) {
      const controller = new AbortController();

      const userID = getUserID();
      fetch(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:8080"
        }/api/rooms/${roomSlug}`,
        { signal: controller.signal }
      )
        .then((res) => {
          if (!res.ok) {
            if (res.status === 404) {
              setRoomExists(false);
            }
            throw new Error("Failed to fetch room");
          }
          return res.json();
        })
        .then((data) => {
          if (data.owner && data.owner === userID) {
            setIsOwner(true);
          }
          setRoomLocked(data.locked || false);
          setRoomExists(true);
          setRoomChecked(true);
        })
        .catch((err) => {
          // Ignore cancellation errors
          if (err.name === 'AbortError') return;
          console.error("Failed to fetch room details", err);
          setRoomChecked(true);
        });

      return () => controller.abort();
    }
  }, [roomSlug]);

  // Handle successful password authentication
  const handleAuthenticated = (token: string) => {
    setAuthToken(token);
  };

  // Handle lock state changes from Editor
  const handleLockChange = (locked: boolean, token?: string) => {
    setRoomLocked(locked);
    if (token) {
      setAuthToken(token);
    }
  };

  // Handle username submission
  const handleSubmitUsername = () => {
    if (tempName.trim()) {
      setUsername(tempName.trim());
      setLocalUsername(tempName.trim());
    }
  };

  // Name prompt
  if (!username) {
    return (
      <div className="name-prompt-overlay">
        <div className="glass-card name-prompt-card">
          <h2 className="name-prompt-title">Enter your name to join</h2>

          <div className="input-group">
            <input
              type="text"
              placeholder="Your Name"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tempName.trim()) {
                  handleSubmitUsername();
                }
              }}
              className="glass-input"
              autoFocus
            />
          </div>

          <div className="actions name-prompt-actions">
            <button
              onClick={handleSubmitUsername}
              disabled={!tempName.trim()}
              className="btn-primary btn-full-width"
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!roomSlug) return <div>Invalid Room</div>;

  // Room not found
  if (roomChecked && !roomExists) {
    return (
      <div className="center-container">
        <div className="center-content">
          <h2>Room Not Found</h2>
          <p>This room may have expired or been deleted.</p>
        </div>
      </div>
    );
  }

  // Still loading room info
  if (!roomChecked) {
    return (
      <div className="center-container">
        <div>Loading...</div>
      </div>
    );
  }

  // Room is locked and user hasn't authenticated
  if (roomLocked && !authToken) {
    return (
      <PasswordPrompt
        roomSlug={roomSlug}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  // Get persistent user ID
  const userId = getUserID();

  // Render Editor directly without app-header wrapper
  return (
    <div className="App">
      <Editor
        roomSlug={roomSlug}
        username={username}
        userId={userId}
        isOwner={isOwner}
        authToken={authToken || undefined}
        roomLocked={roomLocked}
        onLockChange={handleLockChange}
      />
    </div>
  );
};

import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeContext";
import Particles from "./components/Particles";
import { Toaster } from "./components/Toaster";

const GlobalParticles = () => {
  const particleColor = "#ffffff"; // White particles for dark mode

  return (
    <Particles
      particleColors={[particleColor, particleColor]}
      particleCount={500}
      particleSpread={10}
      speed={0.1}
      particleBaseSize={120}
      moveParticlesOnHover={false}
      alphaParticles={false}
      disableRotation={true}
      pixelRatio={1}
      className="global-particles"
    />
  );
};

// Must be inside <BrowserRouter> to use useLocation
const AppContent = () => {
  const location = useLocation();
  const isLanding = location.pathname === "/" || location.pathname === "";

  return (
    <>
      {isLanding && <GlobalParticles />}
      <Toaster />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/:roomSlug" element={<EditorRoute />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;