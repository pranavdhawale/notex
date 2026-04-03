import React, { useState, useEffect } from "react";
import api from "./utils/api";
import { getUserID } from "./utils/session";
import { toast } from "./components/Toaster";
import { useNavigate } from "react-router-dom";
import { StartupAnimation } from "./components/StartupAnimation";

import "./LandingPage.css";

export const LandingPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [showAnimation, setShowAnimation] = useState(true);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [usernameError, setUsernameError] = useState(false);
  const [username, setUsername] = useState(
    localStorage.getItem("notex_username") || "",
  );
  const navigate = useNavigate();

  // Check if we've shown the animation this session
  useEffect(() => {
    // const hasSeenIntro = sessionStorage.getItem("notex_intro_seen");
    // if (hasSeenIntro) {
    //   setShowAnimation(false);
    // }
  }, []);

  const handleAnimationComplete = () => {
    setShowAnimation(false);
    // sessionStorage.setItem("notex_intro_seen", "true");
  };

  const saveUsername = () => {
    if (username.trim()) {
      localStorage.setItem("notex_username", username.trim());
    }
    getUserID(); // Ensure ID exists when interacting
  };

  const handleJoinRoom = () => {
    if (joinRoomCode.trim() && username.trim()) {
      saveUsername();
      navigate(`/${joinRoomCode.trim()}`);
    } else if (!username.trim()) {
      setUsernameError(true);
    }
  };

  const handleCreateRoom = async () => {
    if (!username.trim()) {
      setUsernameError(true);
      return;
    }
    saveUsername();

    setLoading(true);
    try {
      const payload: any = {
        owner: getUserID(),
      };

      // Add custom slug if provided
      if (customSlug.trim()) {
        payload.customSlug = customSlug.trim().toLowerCase();
      }

      const res = await api.post("/api/rooms", payload);
      const room = res.data;
      navigate(`/${room.slug}`);
    } catch (err: any) {
      console.error(err);
      const errorMsg = err.response?.data?.error || "Failed to create room";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showAnimation && (
        <StartupAnimation onComplete={handleAnimationComplete} />
      )}

      <div className="landing-page">
        <div className="glass-card">
          <div className="card-header">
            <h1 className="logo-text">
              Note<span>X</span>
            </h1>
            <p className="tagline">Where ideas converge instantly.</p>
          </div>

          <div className="input-group">
            <label>Who are you?</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (e.target.value.trim()) setUsernameError(false);
              }}
              className={`glass-input ${usernameError ? "input-error" : ""}`}
            />
            {usernameError && (
              <small style={{ color: "#ff6b6b", fontSize: "0.75em", marginTop: "4px", display: "block" }}>
                Please enter your name
              </small>
            )}
          </div>

          <div
            className="input-group"
            style={{ marginTop: "8px", marginBottom: "8px" }}
          >
            <label
              style={{ fontSize: "0.85em", marginBottom: "4px", opacity: 0.8 }}
            >
              Room Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g., my-project"
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              className="glass-input"
              style={{
                fontSize: "0.85em",
                padding: "8px 12px",
                height: "38px",
              }}
            />
            <small
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.7em",
                marginTop: "2px",
                display: "block",
                opacity: 0.7,
              }}
            >
              Max 2 words • Leave empty for auto-generated
            </small>
          </div>

          <div className="actions">
            <button
              onClick={handleCreateRoom}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? "Creating..." : "Start New Room"}
            </button>

            <div className="divider">
              <span>or</span>
            </div>

            <div className="join-row">
              <input
                type="text"
                placeholder="Room Code"
                value={joinRoomCode}
                onChange={(e) => setJoinRoomCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                className="glass-input small"
              />
              <button
                onClick={handleJoinRoom}
                disabled={!joinRoomCode.trim()}
                className="btn-secondary"
              >
                Join
              </button>
            </div>
          </div>
        </div>

        <footer className="glass-footer">
          <p>Made with ❤️</p>
        </footer>
      </div>
    </>
  );
};
