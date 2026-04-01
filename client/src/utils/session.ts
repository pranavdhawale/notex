const SESSION_KEY = 'notex_session';
const USER_ID_KEY = 'notex_user_id';

export interface SessionResponse {
  token: string;
  userID: string;
  isNew: boolean;
}

export interface SessionData {
  token: string;
  userID: string;
  createdAt: number;
}

/**
 * Get the current session from localStorage
 */
export function getSession(): SessionData | null {
  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return null;

  try {
    const session: SessionData = JSON.parse(stored);
    // Check if session is expired (30 days)
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
    if (Date.now() - session.createdAt > maxAge) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

/**
 * Store session in localStorage
 */
export function setSession(token: string, userID: string): SessionData {
  const session: SessionData = {
    token,
    userID,
    createdAt: Date.now(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  // Also store user ID separately for backward compatibility
  localStorage.setItem(USER_ID_KEY, userID);
  return session;
}

/**
 * Clear the current session
 */
export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

/**
 * Get or create a session by calling the server
 */
export async function getOrCreateSession(): Promise<SessionData> {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  // Check existing session
  const existingSession = getSession();
  if (existingSession) {
    // Verify with server
    try {
      const response = await fetch(`${apiUrl}/api/session`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${existingSession.token}`,
        },
      });

      if (response.ok) {
        const data: SessionResponse = await response.json();
        // Always use server response - server knows best
        return setSession(data.token, data.userID);
      }
    } catch (error) {
      console.error('Failed to verify session:', error);
    }
  }

  // Request new session
  try {
    const response = await fetch(`${apiUrl}/api/session`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to create session');
    }

    const data: SessionResponse = await response.json();
    return setSession(data.token, data.userID);
  } catch (error) {
    console.error('Failed to create session:', error);
    // Fallback: generate local-only session (won't be authenticated)
    const fallbackUserID = 'user_' + crypto.randomUUID().split('-')[0];
    localStorage.setItem(USER_ID_KEY, fallbackUserID);
    throw new Error('Unable to establish session. Please check your connection.');
  }
}

/**
 * Get the authorization header value
 */
export function getAuthHeader(): string | null {
  const session = getSession();
  return session ? `Bearer ${session.token}` : null;
}

/**
 * Get user ID from session
 */
export function getUserID(): string | null {
  const session = getSession();
  if (session) return session.userID;
  // Fallback to legacy storage
  return localStorage.getItem(USER_ID_KEY);
}