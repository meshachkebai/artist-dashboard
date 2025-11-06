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
  const [artistId, setArtistId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accountType, setAccountType] = useState('artist');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const validateSession = async () => {
      const storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
      
      if (!storedAuth) {
        setLoading(false);
        return;
      }

      try {
        const { artist_name, artist_id, is_admin, account_type } = JSON.parse(storedAuth);

        // Validate against database and get artist_id from artists table
        const { data, error } = await supabase
          .from('artist_access_codes')
          .select('artist_name, is_admin, is_revoked, account_type')
          .eq('artist_name', artist_name)
          .eq('is_revoked', false)
          .single();

        if (error || !data) {
          // Invalid session - clear and logout
          console.warn('Session validation failed:', error?.message || 'Artist not found');
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setIsAuthenticated(false);
          setArtistName(null);
          setArtistId(null);
          setIsAdmin(false);
          setAccountType('artist');
        } else {
          // Get artist ID from artists table
          let resolvedArtistId = artist_id;
          if (!is_admin) {
            const { data: artistData } = await supabase
              .from('artists')
              .select('id')
              .eq('name', data.artist_name)
              .single();
            
            resolvedArtistId = artistData?.id || null;
            
            if (!resolvedArtistId) {
              console.warn(`No artist record found for "${data.artist_name}" in artists table`);
            }
          }
          
          // Valid session - verify admin status and account type match
          if (data.is_admin !== is_admin || data.account_type !== account_type || resolvedArtistId !== artist_id) {
            // Data changed, update localStorage
            const updatedAuth = { 
              artist_name: data.artist_name, 
              artist_id: resolvedArtistId,
              is_admin: data.is_admin,
              account_type: data.account_type || 'artist'
            };
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedAuth));
          }
          
          setArtistName(data.artist_name);
          setArtistId(resolvedArtistId);
          setIsAdmin(data.is_admin || false);
          setAccountType(data.account_type || 'artist');
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

  const login = async (artist_name, is_admin = false, account_type = 'artist') => {
    // Get artist ID from artists table if not admin
    let artist_id = null;
    if (!is_admin) {
      console.log('🔐 Login: Fetching artist ID for:', artist_name);
      const { data: artistData, error: artistError } = await supabase
        .from('artists')
        .select('id')
        .eq('name', artist_name)
        .single();
      
      artist_id = artistData?.id || null;
      
      if (!artist_id) {
        console.error(`❌ No artist record found for "${artist_name}" in artists table`);
        console.error('Artist lookup error:', artistError);
      } else {
        console.log('✅ Found artist ID:', artist_id);
      }
    }
    
    const authData = { artist_name, artist_id, is_admin, account_type };
    console.log('💾 Storing auth data:', authData);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
    setArtistName(artist_name);
    setArtistId(artist_id);
    setIsAdmin(is_admin);
    setAccountType(account_type);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setArtistName(null);
    setArtistId(null);
    setIsAdmin(false);
    setAccountType('artist');
    setIsAuthenticated(false);
    // Force page reload to show login screen
    window.location.reload();
  };

  return {
    isAuthenticated,
    artistName,
    artistId,
    isAdmin,
    accountType,
    loading,
    login,
    logout
  };
};
