import React, { useEffect, useState } from "react";
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

  // Show max 2 avatars, then +count for remaining
  const displayUsers = users.slice(0, 2);
  const remainingCount = users.length - 2;
  const currentUserName = provider.awareness.getLocalState()?.user?.name;

  return (
    <div className="active-users-avatars">
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
          title={u.name === currentUserName ? `${u.name} (You)` : u.name}
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
          title={`${remainingCount} more user${remainingCount > 1 ? 's' : ''}`}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
};