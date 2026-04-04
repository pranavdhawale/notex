import React, { useState } from "react";
import api from "../utils/api";
import { useNavigate } from "react-router-dom";
import "./PasswordPrompt.css";

interface PasswordPromptProps {
  roomSlug: string;
  onAuthenticated: (token: string) => void;
}

export const PasswordPrompt: React.FC<PasswordPromptProps> = ({
  roomSlug,
  onAuthenticated,
}) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Password is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await api.post(`/api/rooms/${roomSlug}/verify-password`, {
        password: password,
      });

      const { token } = res.data;
      onAuthenticated(token);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || "Failed to verify password";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate("/");
  };

  return (
    <div className="password-prompt-overlay">
      <div className="password-prompt-card glass-card">
        <div className="lock-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>

        <h2>This room is locked</h2>
        <p className="room-name">Room: {roomSlug}</p>
        <p className="hint">Enter the password to join</p>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              className="glass-input"
              autoFocus
              disabled={loading}
            />
          </div>

          {error && <p className="error-message">{error}</p>}

          <div className="actions">
            <button
              type="button"
              onClick={handleBack}
              className="btn-secondary"
              disabled={loading}
            >
              Back
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !password.trim()}
            >
              {loading ? "Verifying..." : "Join Room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};