/**
 * RequireAuth.jsx
 * Simple guard: if no user in session → redirect to login (handled by App.jsx).
 * Since App.jsx now shows LoginPage when user=null, this component is a
 * safety net used inside passenger routes to double-check session.
 *
 * Also exported: useCurrentUser() — reads user from sessionStorage anywhere.
 */

export function useCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem('rail_user')); }
  catch { return null; }
}

export default function RequireAuth({ children }) {
  const user = useCurrentUser();
  // App.jsx already guards — if somehow we land here without a user, render nothing
  if (!user) return null;
  return children;
}
