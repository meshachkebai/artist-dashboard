import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * SINGLE SOURCE OF TRUTH for all analytics data
 * Returns consistent data for ALL pages
 */
export const useUnifiedAnalytics = (artistId, isAdmin, dateRange = 30) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);

        // CRITICAL: If artist mode but no artistId, return empty data
        if (!isAdmin && !artistId) {
          console.warn('⚠️ useUnifiedAnalytics: Artist not in database - returning empty data');
          setData({
            totalStreams: 0,
            totalRevenue: 0,
            artistShare: null,
            platformFee: null,
            uniqueListeners: 0,
            uniqueTracks: 0
          });
          setLoading(false);
          return;
        }

        // Get track IDs for artist (if not admin)
        let trackIds = null;
        if (!isAdmin && artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
          
          if (trackIds.length === 0) {
            console.warn('⚠️ useUnifiedAnalytics: Artist has no tracks');
            setData({
              totalStreams: 0,
              totalRevenue: 0,
              artistShare: null,
              platformFee: null,
              uniqueListeners: 0,
              uniqueTracks: 0
            });
            setLoading(false);
            return;
          }
        }

        // Get all existing tracks
        let tracksQuery = supabase
          .from('mvp_content')
          .select('id');

        if (trackIds && trackIds.length > 0) {
          tracksQuery = tracksQuery.in('id', trackIds);
        }

        const { data: existingTracks } = await tracksQuery;
        const existingTrackIds = new Set(existingTracks?.map(t => t.id) || []);

        if (existingTrackIds.size === 0) {
          setData({
            totalStreams: 0,
            totalRevenue: 0,
            artistShare: 0,
            platformFee: 0,
            uniqueListeners: 0,
            uniqueTracks: 0
          });
          return;
        }

        // Get analytics events
        let eventsQuery = supabase
          .from('analytics_events')
          .select('track_id, access_code_id')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString());

        if (trackIds && trackIds.length > 0) {
          const validTrackIds = trackIds.filter(id => existingTrackIds.has(id));
          if (validTrackIds.length === 0) {
            setData({
              totalStreams: 0,
              totalRevenue: 0,
              artistShare: 0,
              platformFee: 0,
              uniqueListeners: 0,
              uniqueTracks: 0
            });
            return;
          }
          eventsQuery = eventsQuery.in('track_id', validTrackIds);
        } else {
          eventsQuery = eventsQuery.in('track_id', Array.from(existingTrackIds));
        }

        const { data: allEvents } = await eventsQuery;

        // Filter out ad tracks (same logic as useTopTracks)
        const { data: adTracks } = await supabase
          .from('mvp_content')
          .select('id')
          .eq('is_ad', true);

        const adTrackIds = new Set(adTracks?.map(t => t.id) || []);
        const events = (allEvents || []).filter(e => !adTrackIds.has(e.track_id));

        const totalStreams = events?.length || 0;
        
        let totalRevenue;
        
        if (isAdmin) {
          // Admin sees total platform revenue (100%)
          totalRevenue = totalStreams * 0.001;
        } else {
          // Artist sees their actual earnings based on split percentages
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id, split_percentage')
            .eq('artist_id', artistId);
          
          const splitsByTrack = (contributions || []).reduce((acc, c) => {
            acc[c.track_id] = c.split_percentage || 0;
            return acc;
          }, {});
          
          // Calculate artist's actual earnings per stream
          let artistEarnings = 0;
          events.forEach(event => {
            const artistSplit = splitsByTrack[event.track_id] || 0;
            const streamRevenue = 0.001 * 0.70; // Platform gives 70% to artists
            const artistShare = (streamRevenue * artistSplit) / 100;
            artistEarnings += artistShare;
          });
          
          totalRevenue = artistEarnings;
        }

        const uniqueListeners = new Set(
          (events || []).map(e => e.access_code_id).filter(Boolean)
        ).size;

        const uniqueTracks = new Set(
          (events || []).map(e => e.track_id).filter(Boolean)
        ).size;

        setData({
          totalStreams,
          totalRevenue: parseFloat(totalRevenue.toFixed(6)),
          artistShare: isAdmin ? parseFloat((totalRevenue * 0.70).toFixed(6)) : null,
          platformFee: isAdmin ? parseFloat((totalRevenue * 0.30).toFixed(6)) : null,
          uniqueListeners,
          uniqueTracks
        });
      } catch (err) {
        console.error('Error fetching unified analytics:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [artistId, isAdmin, dateRange]);

  return { data, loading, error };
};
