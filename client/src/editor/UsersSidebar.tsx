import React, { useEffect, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import { X } from "lucide-react";

interface UsersSidebarProps {
  provider: WebsocketProvider;
  isOpen: boolean;
  onClose: () => void;
}

interface UserData {
  name: string;
  color: string;
  userId?: string;
}

export const UsersSidebar: React.FC<UsersSidebarProps> = ({
  provider,
  isOpen,
  onClose,
}) => {
  const [users, setUsers] = useState<UserData[]>([]);

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

  return (
    <div className={`sidebar-panel right-panel ${isOpen ? "open" : "closed"}`}>
      <div className="panel-header liquid-header">
        {/* Liquid Glass Background */}
        <div className="liquid-glass-container">
          <div className="liquid-glass-backdrop"></div>
          <div className="liquid-glass-distortion top"></div>
          <div className="liquid-glass-distortion bottom"></div>
          <div className="liquid-glass-distortion left"></div>
          <div className="liquid-glass-distortion right"></div>
        </div>

        <div className="header-content">
          <h3>Active Users</h3>
          <button onClick={onClose} className="btn-icon">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="user-list custom-scrollbar">
        {users.map((u, i) => (
          <div key={i} className="user-card">
            <div
              className="user-avatar"
              style={{
                backgroundColor: u.color,
                boxShadow: `0 0 10px ${u.color}80`,
              }}
            >
              {u.name.charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <span className="user-name">
                {u.name}
                {u.name === provider.awareness.getLocalState()?.user?.name &&
                  " (You)"}
              </span>
              <span className="user-status">Online</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
