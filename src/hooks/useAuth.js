import { useState, useEffect } from 'react';

const AUTH_STORAGE_KEY = 'artist_auth';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [artistName, setArtistName] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage on mount
    const storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (storedAuth) {
      try {
        const { artist_name, is_admin } = JSON.parse(storedAuth);
        setArtistName(artist_name);
        setIsAdmin(is_admin || false);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Failed to parse auth data:', error);
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = (artist_name, is_admin = false) => {
    const authData = { artist_name, is_admin };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
    setArtistName(artist_name);
    setIsAdmin(is_admin);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setArtistName(null);
    setIsAdmin(false);
    setIsAuthenticated(false);
    // Force page reload to show login screen
    window.location.reload();
  };

  return {
    isAuthenticated,
    artistName,
    isAdmin,
    loading,
    login,
    logout
  };
};
