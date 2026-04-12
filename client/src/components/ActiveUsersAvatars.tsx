import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { WebsocketProvider } from "y-websocket";
import "./ActiveUsersAvatars.css";

interface ActiveUsersAvatarsProps {
  provider: WebsocketProvider;
}

interface UserData {
  name: string;
  color: string;
  userId?: string;
}

interface AwarenessState {
  user?: {
    name: string;
    color: string;
    userId?: string;
  };
}

// Helper to compare user arrays and avoid unnecessary re-renders
function areUsersEqual(a: UserData[], b: UserData[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].userId !== b[i].userId || a[i].name !== b[i].name || a[i].color !== b[i].color) {
      return false;
    }
  }
  return true;
}

export const ActiveUsersAvatars: React.FC<ActiveUsersAvatarsProps> = ({
  provider,
}) => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const updateUsers = () => {
      const states = provider.awareness.getStates();
      const uniqueUsers = new Map<string, UserData>();

      states.forEach((state: AwarenessState) => {
        if (state.user && state.user.userId) {
          uniqueUsers.set(state.user.userId, state.user);
        } else if (state.user) {
          uniqueUsers.set(state.user.name, state.user);
        }
      });

      const newUsers = Array.from(uniqueUsers.values());

      // Only update state if users actually changed
      setUsers((prevUsers) => {
        if (areUsersEqual(prevUsers, newUsers)) {
          return prevUsers; // Return same reference to prevent re-render
        }
        return newUsers;
      });
    };

    provider.awareness.on("change", updateUsers);
    updateUsers();

    return () => {
      provider.awareness.off("change", updateUsers);
    };
  }, [provider]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // Focus the close button when modal opens
      closeButtonRef.current?.focus();
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // Handle keyboard interaction on trigger
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  // Show max 2 avatars, then +count for remaining
  const displayUsers = users.slice(0, 2);
  const remainingCount = users.length - 2;
  const currentUserName = provider.awareness.getLocalState()?.user?.name;

  // Don't render if no users
  if (users.length === 0) {
    return null;
  }

  return (
    <>
      <div
        className="active-users-avatars"
        onClick={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label="View active users"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {displayUsers.map((u, i) => (
          <div
            key={u.userId || u.name}
            className="avatar-circle"
            style={{
              backgroundColor: u.color,
              boxShadow: `0 0 8px ${u.color}60`,
              zIndex: displayUsers.length - i,
              marginLeft: i === 0 ? 0 : -8,
            }}
          >
            {u.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {remainingCount > 0 && (
          <div
            className="avatar-circle avatar-count"
            style={{
              marginLeft: -8,
              zIndex: 0,
            }}
          >
            +{remainingCount}
          </div>
        )}
      </div>

      {isOpen && createPortal(
        <>
          {/* Backdrop */}
          <div className="users-backdrop" onClick={() => setIsOpen(false)} />

          {/* Popup */}
          <div
            className="users-popup"
            role="dialog"
            aria-label="Active users"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="users-header">
              <h3>
                Active Users
                <span className="users-count">{users.length}</span>
              </h3>
              <button
                ref={closeButtonRef}
                type="button"
                className="users-close"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="users-list">
              {users.map((u) => (
                <div key={u.userId || u.name} className="users-item">
                  <div
                    className="users-avatar"
                    style={{
                      backgroundColor: u.color,
                      boxShadow: `0 0 10px ${u.color}60`,
                    }}
                  >
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="users-name">
                    {u.name}
                    {u.name === currentUserName && (
                      <span className="you-badge">You</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
};