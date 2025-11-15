import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ContributorList } from '../components/shared/ContributorList';
import '../components/shared/ContributorBadge.css';
import './MyCreditsPage.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const MyCreditsPage = ({ artistName }) => {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState({});

  useEffect(() => {
    loadMyCredits();
  }, [artistName]);

  const loadMyCredits = async () => {
    try {
      setLoading(true);

      // Get artist_id
      const { data: artistData, error: artistError } = await supabase
        .from('artists')
        .select('id')
        .eq('name', artistName)
        .single();

      if (artistError || !artistData) {
        console.error('Artist not found:', artistError);
        setTracks([]);
        return;
      }

      // Get all tracks where this artist is credited
      const { data: contributions, error: contribError } = await supabase
        .from('track_contributors')
        .select('track_id, role, split_percentage')
        .eq('artist_id', artistData.id);

      if (contribError) {
        console.error('Failed to load contributions:', contribError);
        return;
      }

      const trackIds = contributions.map(c => c.track_id);
      
      // Store my roles and splits per track
      const roleMap = {};
      contributions.forEach(c => {
        roleMap[c.track_id] = {
          role: c.role,
          split: c.split_percentage
        };
      });
      setMyRole(roleMap);

      if (trackIds.length === 0) {
        setTracks([]);
        return;
      }

      // Get full track details
      const { data: tracksData, error: tracksError } = await supabase
        .from('mvp_content')
        .select('*')
        .in('id', trackIds)
        .neq('is_ad', true)
        .order('created_at', { ascending: false });

      if (tracksError) {
        console.error('Failed to load tracks:', tracksError);
        return;
      }

      // Get all contributors for these tracks
      const { data: allContributors } = await supabase
        .from('track_contributors')
        .select(`
          track_id,
          role,
          split_percentage,
          artists (
            id,
            name,
            has_account
          )
        `)
        .in('track_id', trackIds);

      // Group contributors by track
      const contributorsByTrack = (allContributors || []).reduce((acc, c) => {
        if (!acc[c.track_id]) acc[c.track_id] = [];
        acc[c.track_id].push(c);
        return acc;
      }, {});

      // Get analytics for tracks (last 30 days to match Overview page)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: allEvents, error: eventsError } = await supabase
        .from('analytics_events')
        .select('track_id, event_type, duration_seconds')
        .in('track_id', trackIds)
        .gte('timestamp', thirtyDaysAgo.toISOString());

      console.log('Track IDs:', trackIds);
      console.log('Analytics Events:', allEvents);
      console.log('Events Error:', eventsError);

      // Calculate stats per track
      const statsByTrack = (allEvents || []).reduce((acc, event) => {
        if (!acc[event.track_id]) {
          acc[event.track_id] = { qualifiedStreams: 0 };
        }
        
        if (event.event_type === 'play_end' && event.duration_seconds >= 30) {
          acc[event.track_id].qualifiedStreams++;
        }
        
        return acc;
      }, {});

      // Combine all data
      const enrichedTracks = tracksData.map(track => {
        const stats = statsByTrack[track.id] || { qualifiedStreams: 0 };

        return {
          ...track,
          duration: track.duration_seconds * 1000,
          contributors: contributorsByTrack[track.id] || [],
          analytics: {
            qualifiedStreams: stats.qualifiedStreams
          }
        };
      });

      setTracks(enrichedTracks);
    } catch (error) {
      console.error('Failed to load credits:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-credits-page">
      <div className="page-header">
        <h1>My Credits</h1>
        <p className="page-subtitle">Tracks you've contributed to</p>
      </div>

      <div className="container">
        {loading && <p className="text-muted">Loading your credits...</p>}

        {!loading && tracks.length === 0 && (
          <div className="empty-state card">
            <p>No credits found. You haven't been credited on any tracks yet.</p>
          </div>
        )}

        <div className="credits-list">
          {tracks.map((track) => (
            <div key={track.id} className="credit-item card">
              <div className="credit-info">
                <div className="credit-header">
                  <h3 style={{ color: 'var(--brand-accent)', margin: '0 0 0.5rem 0' }}>
                    {track.title}
                  </h3>
                  <div className="my-role-info">
                    <span className="my-role-badge">
                      Your role: {myRole[track.id]?.role}
                    </span>
                    {myRole[track.id]?.split && (
                      <span className="my-split-badge">
                        Split: {myRole[track.id].split}%
                      </span>
                    )}
                  </div>
                </div>
                
                <ContributorList contributors={track.contributors} />
                
                <p className="text-secondary">
                  <strong>Genre:</strong> {track.genre || 'Unknown'} | <strong>Duration:</strong> {Math.floor(track.duration / 1000)}s | <strong>Uploaded:</strong> {new Date(track.created_at).toLocaleDateString()}
                </p>

                {track.analytics && (
                  <p className="track-analytics" style={{ 
                    color: 'var(--text-secondary, #666)', 
                    fontSize: '0.875rem',
                    marginTop: '0.5rem'
                  }}>
                    {track.analytics.qualifiedStreams.toLocaleString()} streams
                    {myRole[track.id]?.split && (
                      <span style={{ 
                        marginLeft: '0.5rem',
                        color: 'var(--success, #28a745)',
                        fontWeight: '600'
                      }}>
                        • Your Split: {myRole[track.id].split}% • Earnings: K{((track.analytics.qualifiedStreams * 0.001 * 0.70 * myRole[track.id].split) / 100).toFixed(2)}
                      </span>
                    )}
                  </p>
                )}
              </div>

              {track.artwork_path && (
                <div>
                  <img
                    src={track.artwork_path}
                    alt={track.title}
                    className="track-artwork"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MyCreditsPage;
