import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./LandingPage.css";

export const LandingPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [username, setUsername] = useState(
    localStorage.getItem("notex_username") || ""
  );
  const navigate = useNavigate();

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
    <div className="landing-page">
      <h1>Notex</h1>
      <p>Real-time collaborative notes.</p>

      <div style={{ marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="Your Name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{
            padding: "10px",
            fontSize: "1.1rem",
            borderRadius: "6px",
            border: "1px solid #ddd",
            width: "250px",
            textAlign: "center",
          }}
        />
      </div>

      <button
        onClick={handleCreateRoom}
        disabled={loading}
        className="btn-create"
      >
        {loading ? "Creating..." : "Create New Room"}
      </button>
      <div className="join-room-section">
        <div className="divider">OR</div>
        <div className="join-input-group">
          <input
            type="text"
            placeholder="Enter Room Code"
            value={joinRoomCode}
            onChange={(e) => setJoinRoomCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
          />
          <button onClick={handleJoinRoom} disabled={!joinRoomCode.trim()}>
            Join
          </button>
        </div>
      </div>
    </div>
  );
};
