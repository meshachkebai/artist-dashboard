import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { createClient } from '@supabase/supabase-js';
import './ArtistProfilePage.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const R2_WORKER_URL = import.meta.env.VITE_R2_WORKER_URL;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const ArtistProfilePage = () => {
  const { artistId, artistName } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  
  const [profile, setProfile] = useState({
    profile_photo_url: '',
    hometown: '',
    social_instagram: '',
    social_twitter: '',
    social_facebook: '',
    social_youtube: '',
    social_tiktok: '',
  });

  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);

  // Fetch artist profile
  useEffect(() => {
    if (!artistId) {
      console.log('No artistId, skipping fetch');
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        console.log('Fetching profile for artistId:', artistId);
        setLoading(true);
        const { data, error } = await supabase
          .from('artists')
          .select('profile_photo_url, hometown, social_instagram, social_twitter, social_facebook, social_youtube, social_tiktok')
          .eq('id', artistId)
          .single();

        console.log('Profile fetch result:', { data, error });
        if (error) throw error;

        if (data) {
          setProfile({
            profile_photo_url: data.profile_photo_url || '',
            hometown: data.hometown || '',
            social_instagram: data.social_instagram || '',
            social_twitter: data.social_twitter || '',
            social_facebook: data.social_facebook || '',
            social_youtube: data.social_youtube || '',
            social_tiktok: data.social_tiktok || '',
          });
          setPhotoPreview(data.profile_photo_url);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        showMessage('Failed to load profile', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [artistId]);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showMessage('Please select an image file', 'error');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showMessage('Image must be less than 5MB', 'error');
      return;
    }

    setPhotoFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = async () => {
    if (!photoFile) {
      showMessage('Please select a photo first', 'error');
      return;
    }

    try {
      setUploading(true);

      // Create form data for R2 worker
      const formData = new FormData();
      formData.append('profilePhoto', photoFile);
      formData.append('artistId', artistId);
      formData.append('artistName', artistName);

      // Upload to R2 via worker
      const response = await fetch(R2_WORKER_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();

      // Update profile with new photo URL
      const { error: updateError } = await supabase
        .from('artists')
        .update({
          profile_photo_url: result.photoUrl,
          profile_photo_path: result.photoPath,
        })
        .eq('id', artistId);

      if (updateError) throw updateError;

      setProfile(prev => ({
        ...prev,
        profile_photo_url: result.photoUrl,
      }));

      setPhotoFile(null);
      showMessage('Profile photo updated successfully!', 'success');
    } catch (error) {
      console.error('Upload error:', error);
      showMessage(error.message || 'Failed to upload photo', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setProfile(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validate social media handles (remove @ if present)
      const cleanProfile = {
        hometown: profile.hometown.trim(),
        social_instagram: profile.social_instagram.replace('@', '').trim(),
        social_twitter: profile.social_twitter.replace('@', '').trim(),
        social_facebook: profile.social_facebook.trim(),
        social_youtube: profile.social_youtube.trim(),
        social_tiktok: profile.social_tiktok.replace('@', '').trim(),
      };

      const { error } = await supabase
        .from('artists')
        .update(cleanProfile)
        .eq('id', artistId);

      if (error) throw error;

      showMessage('Profile updated successfully!', 'success');
    } catch (error) {
      console.error('Save error:', error);
      showMessage('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="page-header">
        <div>
          <h1>Artist Profile</h1>
          <p className="page-subtitle">Manage your public profile information</p>
        </div>
      </div>

      {message && (
        <div className={`message-banner ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="profile-content">
        {/* Profile Photo Section */}
        <div className="profile-section card">
          <h2 className="section-title">Profile Photo</h2>
          <p className="section-description">
            Upload a profile photo that will be displayed in the mobile app
          </p>

          <div className="photo-upload-container">
            <div className="photo-preview">
              {photoPreview ? (
                <img src={photoPreview} alt="Profile" />
              ) : (
                <div className="photo-placeholder">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <span>No photo</span>
                </div>
              )}
            </div>

            <div className="photo-upload-actions">
              <input
                type="file"
                id="photo-input"
                accept="image/*"
                onChange={handlePhotoChange}
                style={{ display: 'none' }}
              />
              <label htmlFor="photo-input" className="btn btn-secondary">
                Choose Photo
              </label>
              
              {photoFile && (
                <button
                  onClick={handlePhotoUpload}
                  disabled={uploading}
                  className="btn btn-primary"
                >
                  {uploading ? 'Uploading...' : 'Upload Photo'}
                </button>
              )}
            </div>

            <p className="photo-requirements">
              Recommended: Square image, at least 400x400px, max 5MB
            </p>
          </div>
        </div>

        {/* Social Media Section */}
        <div className="profile-section card">
          <h2 className="section-title">Social Media Links</h2>
          <p className="section-description">
            Connect your official social media accounts
          </p>

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="instagram">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                Instagram
              </label>
              <input
                type="text"
                id="instagram"
                value={profile.social_instagram}
                onChange={(e) => handleInputChange('social_instagram', e.target.value)}
                placeholder="username"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="twitter">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Twitter / X
              </label>
              <input
                type="text"
                id="twitter"
                value={profile.social_twitter}
                onChange={(e) => handleInputChange('social_twitter', e.target.value)}
                placeholder="username"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="facebook">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Facebook
              </label>
              <input
                type="text"
                id="facebook"
                value={profile.social_facebook}
                onChange={(e) => handleInputChange('social_facebook', e.target.value)}
                placeholder="username or page URL"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="youtube">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                YouTube
              </label>
              <input
                type="text"
                id="youtube"
                value={profile.social_youtube}
                onChange={(e) => handleInputChange('social_youtube', e.target.value)}
                placeholder="channel handle or URL"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="tiktok">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                </svg>
                TikTok
              </label>
              <input
                type="text"
                id="tiktok"
                value={profile.social_tiktok}
                onChange={(e) => handleInputChange('social_tiktok', e.target.value)}
                placeholder="username"
                className="form-input"
              />
            </div>
          </div>
        </div>

        {/* Location Section */}
        <div className="profile-section card">
          <h2 className="section-title">Location</h2>
          <p className="section-description">
            Your hometown or current location
          </p>

          <div className="form-group">
            <label htmlFor="hometown">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              Hometown
            </label>
            <input
              type="text"
              id="hometown"
              value={profile.hometown}
              onChange={(e) => handleInputChange('hometown', e.target.value)}
              placeholder="e.g., Lusaka, Zambia"
              className="form-input"
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="profile-actions">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary btn-large"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArtistProfilePage;
