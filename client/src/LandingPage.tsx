import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { StartupAnimation } from "./components/StartupAnimation";
import { ThemeToggle } from "./components/ThemeToggle";
import "./LandingPage.css";

export const LandingPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [showAnimation, setShowAnimation] = useState(true);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [username, setUsername] = useState(
    localStorage.getItem("notex_username") || ""
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

  // Ensure unique User ID exists
  const getUserId = () => {
    let id = localStorage.getItem("notex_user_id");
    if (!id) {
      id =
        "user_" +
        Math.random().toString(36).substr(2, 9) +
        Date.now().toString(36);
      localStorage.setItem("notex_user_id", id);
    }
    return id;
  };

  const saveUsername = () => {
    if (username.trim()) {
      localStorage.setItem("notex_username", username.trim());
    }
    getUserId(); // Ensure ID exists when interacting
  };

  const handleJoinRoom = () => {
    if (joinRoomCode.trim() && username.trim()) {
      saveUsername();
      navigate(`/${joinRoomCode.trim()}`);
    } else if (!username.trim()) {
      alert("Please enter your name");
    }
  };

  const handleCreateRoom = async () => {
    if (!username.trim()) {
      alert("Please enter your name");
      return;
    }
    saveUsername();

    setLoading(true);
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL || "http://localhost:8080"}/api/rooms`,
        {
          slugPrefix: "room",
          owner: getUserId(), // Send unique ID as owner
        }
      );
      const room = res.data;
      navigate(`/${room.slug}`);
    } catch (err) {
      console.error(err);
      alert("Failed to create room");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showAnimation && <StartupAnimation onComplete={handleAnimationComplete} />}
      
      <div className="landing-page">
        {/* Background Ambient Orbs */}
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
        
        <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 50 }}>
          <ThemeToggle />
        </div>

        <div className="glass-card">
          <div className="card-header">
            <h1 className="logo-text">Note<span>X</span></h1>
            <p className="tagline">Where ideas converge instantly.</p>
          </div>

          <div className="input-group">
            <label>Who are you?</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="glass-input"
            />
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
