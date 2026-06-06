import { create } from 'zustand';
import { authApi, setAccessToken, type AuthUser, ApiError } from '../lib/api';

const SESSION_KEY = 'jrc_access_token';

// Restore token from sessionStorage on module load (survives page refresh,
// clears when the browser tab/window is closed).
const storedToken = sessionStorage.getItem(SESSION_KEY);
if (storedToken) setAccessToken(storedToken);

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login:   (email: string, password: string) => Promise<void>;
  logout:  () => Promise<void>;
  restore: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user:    null,
  // Start in loading state if a token exists — RequireAuth must wait for
  // restore() to validate it before deciding to redirect to /login.
  loading: !!storedToken,
  error:   null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { accessToken, user } = await authApi.login(email, password);
      setAccessToken(accessToken);
      sessionStorage.setItem(SESSION_KEY, accessToken);
      set({ user, loading: false });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Login failed. Please try again.';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  logout: async () => {
    try { await authApi.logout(); } catch {}
    setAccessToken(null);
    sessionStorage.removeItem(SESSION_KEY);
    set({ user: null });
  },

  restore: async () => {
    // On page load: if a token is in sessionStorage, validate it with /auth/me.
    // If it's expired or missing, clear everything and redirect to login.
    set({ loading: true });
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) {
      set({ user: null, loading: false });
      return;
    }
    try {
      setAccessToken(token);
      const { user } = await authApi.me();
      set({ user, loading: false });
    } catch {
      // Token is invalid or expired — clear it
      setAccessToken(null);
      sessionStorage.removeItem(SESSION_KEY);
      set({ user: null, loading: false });
    }
  },
}));
