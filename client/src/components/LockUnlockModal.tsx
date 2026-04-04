import React, { useState, useRef, useEffect } from "react";
import api from "../utils/api";
import { toast } from "./Toaster";
import { X } from "lucide-react";
import "./LockUnlockModal.css";

interface LockRoomModalProps {
  roomSlug: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

export const LockRoomModal: React.FC<LockRoomModalProps> = ({
  roomSlug,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens or after error
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, error]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, loading, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword.trim()) {
      setError("Password is required");
      return;
    }

    if (newPassword.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await api.put(`/api/rooms/${roomSlug}/lock`, {
        newPassword: newPassword,
      });

      toast.success("Room locked successfully");
      const { token } = res.data;
      onSuccess(token);
      onClose();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || "Failed to lock room";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🔒 Lock Room</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <p className="modal-description">
            Set a password to restrict access to this room. Anyone with the password
            can join.
          </p>

          <div className="input-group">
            <label>New Password</label>
            <input
              ref={inputRef}
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setError("");
              }}
              className="glass-input"
              autoFocus
            />
          </div>

          <div className="input-group">
            <label>Confirm Password</label>
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError("");
              }}
              className="glass-input"
            />
          </div>

          {error && <p className="error-message">{error}</p>}

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !newPassword || !confirmPassword}
            >
              {loading ? "Locking..." : "Lock Room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface UnlockRoomModalProps {
  roomSlug: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const UnlockRoomModal: React.FC<UnlockRoomModalProps> = ({
  roomSlug,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens or after error
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, error]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, loading, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password.trim()) {
      setError("Password is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await api.put(`/api/rooms/${roomSlug}/unlock`, {
        password: password,
      });

      toast.success("Room unlocked successfully");
      onSuccess();
      onClose();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || "Failed to unlock room";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🔓 Unlock Room</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <p className="modal-description">
            Enter the current password to remove the lock. The room will be publicly
            accessible after unlocking.
          </p>

          <div className="input-group">
            <label>Current Password</label>
            <input
              ref={inputRef}
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              className="glass-input"
              autoFocus
            />
          </div>

          {error && <p className="error-message">{error}</p>}

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary btn-danger"
              disabled={loading || !password}
            >
              {loading ? "Unlocking..." : "Unlock Room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};