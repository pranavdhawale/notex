import React, { useEffect, useState } from "react";
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

export const ActiveUsersAvatars: React.FC<ActiveUsersAvatarsProps> = ({
  provider,
}) => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const updateUsers = () => {
      const states = provider.awareness.getStates();
      const uniqueUsers = new Map<string, UserData>();

      states.forEach((state: any) => {
        if (state.user && state.user.userId) {
          uniqueUsers.set(state.user.userId, state.user);
        } else if (state.user) {
          uniqueUsers.set(state.user.name, state.user);
        }
      });

      setUsers(Array.from(uniqueUsers.values()));
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
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // Show max 2 avatars, then +count for remaining
  const displayUsers = users.slice(0, 2);
  const remainingCount = users.length - 2;
  const currentUserName = provider.awareness.getLocalState()?.user?.name;

  return (
    <>
      <div
        className={`active-users-avatars${isOpen ? ' modal-open' : ''}`}
        onClick={() => setIsOpen(true)}
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