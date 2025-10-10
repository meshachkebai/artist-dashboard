import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const AUTH_STORAGE_KEY = 'artist_auth';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [artistName, setArtistName] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const validateSession = async () => {
      const storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
      
      if (!storedAuth) {
        setLoading(false);
        return;
      }

      try {
        const { artist_name, is_admin } = JSON.parse(storedAuth);

        // Validate against database
        const { data, error } = await supabase
          .from('artist_access_codes')
          .select('artist_name, is_admin, is_revoked')
          .eq('artist_name', artist_name)
          .eq('is_revoked', false)
          .single();

        if (error || !data) {
          // Invalid session - clear and logout
          console.warn('Session validation failed:', error?.message || 'Artist not found');
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setIsAuthenticated(false);
          setArtistName(null);
          setIsAdmin(false);
        } else {
          // Valid session - verify admin status matches
          if (data.is_admin !== is_admin) {
            // Admin status changed, update localStorage
            const updatedAuth = { artist_name: data.artist_name, is_admin: data.is_admin };
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedAuth));
          }
          
          setArtistName(data.artist_name);
          setIsAdmin(data.is_admin || false);
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Failed to validate session:', error);
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    validateSession();
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
