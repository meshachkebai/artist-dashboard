import React from 'react';
import { useAuth } from '../hooks/useAuth';
import ArtistLogin from './ArtistLogin';

const ProtectedDashboard = ({ children }) => {
  const { isAuthenticated, loading, login } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <ArtistLogin onLogin={login} />;
  }

  return <>{children}</>;
};

export default ProtectedDashboard;
