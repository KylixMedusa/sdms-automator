import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { checkAuth, isAuthenticated } from '../api/client';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      setChecking(false);
      return;
    }
    checkAuth().then((valid) => {
      setAuthed(valid);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--paper)' }}
      >
        <div
          className="w-10 h-10 rounded-full animate-spin"
          style={{ border: '3px solid var(--line)', borderTopColor: 'var(--ink)' }}
        />
      </div>
    );
  }

  if (!authed) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
