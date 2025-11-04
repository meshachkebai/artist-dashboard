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

const getAdTrackIdentifiers = async () => {
  const { data: adTracks } = await supabase
    .from('mvp_content')
    .select('id, title')
    .eq('is_ad', true);

  return {
    adTrackIds: new Set(adTracks?.map(t => t.id) || []),
    adTrackTitles: new Set(adTracks?.map(t => t.title) || [])
  };
};

const isAdEvent = (event, adTrackIds, adTrackTitles) => {
  return adTrackIds.has(event.track_id) || adTrackTitles.has(event.track_title);
};

export const useEarningsByRole = (artistName, dateRange = 30) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEarningsByRole = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!artistName) {
          setData(null);
          return;
        }

        // Get artist_id
        const { data: artistData, error: artistError } = await supabase
          .from('artists')
          .select('id')
          .eq('name', artistName)
          .single();

        if (artistError || !artistData) {
          throw new Error('Artist not found');
        }

        // Get all contributions with splits
        const { data: contributions, error: contribError } = await supabase
          .from('track_contributors')
          .select('track_id, role, split_percentage')
          .eq('artist_id', artistData.id);

        if (contribError) throw contribError;

        const trackIds = contributions?.map(c => c.track_id) || [];

        if (trackIds.length === 0) {
          setData({ byRole: [], total: 0 });
          return;
        }

        // First get existing track IDs from mvp_content
        const { data: existingTracks, error: tracksError } = await supabase
          .from('mvp_content')
          .select('id');

        if (tracksError) throw tracksError;

        const existingTrackIds = new Set(existingTracks?.map(t => t.id) || []);

        // Filter to only include tracks that still exist
        const validTrackIds = trackIds.filter(id => existingTrackIds.has(id));

        if (validTrackIds.length === 0) {
          setData({ byRole: [], total: 0 });
          return;
        }

        // Get analytics events for these tracks
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);

        const { data: events, error: eventsError } = await supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString())
          .in('track_id', validTrackIds);

        if (eventsError) throw eventsError;

        // Filter out ad events
        const { adTrackIds, adTrackTitles } = await getAdTrackIdentifiers();
        const nonAdEvents = (events || []).filter(e => !isAdEvent(e, adTrackIds, adTrackTitles));

        // Calculate earnings per track
        const earningsByTrack = {};
        nonAdEvents.forEach(event => {
          if (!earningsByTrack[event.track_id]) {
            earningsByTrack[event.track_id] = 0;
          }
          earningsByTrack[event.track_id] += 0.001; // K0.001 per stream
        });

        // Calculate earnings by role
        const roleEarnings = {};
        contributions.forEach(contrib => {
          const trackEarnings = earningsByTrack[contrib.track_id] || 0;
          const artistShare = trackEarnings * 0.70; // 70% to artists
          
          let myShare;
          if (contrib.split_percentage) {
            // Use explicit split percentage
            myShare = artistShare * (contrib.split_percentage / 100);
          } else {
            // Default: equal split among all contributors
            // This is a simplified calculation - in production you'd want to query all contributors per track
            myShare = artistShare; // For now, assume full share if no split specified
          }

          if (!roleEarnings[contrib.role]) {
            roleEarnings[contrib.role] = {
              role: contrib.role,
              earnings: 0,
              trackTotal: 0,
              streams: 0,
              tracks: new Set()
            };
          }

          roleEarnings[contrib.role].earnings += myShare;
          roleEarnings[contrib.role].trackTotal += artistShare;
          roleEarnings[contrib.role].streams += (earningsByTrack[contrib.track_id] || 0) / 0.001;
          roleEarnings[contrib.role].tracks.add(contrib.track_id);
        });

        // Convert to array and format
        const byRole = Object.values(roleEarnings)
          .map(role => ({
            role: role.role,
            earnings: role.earnings.toFixed(6),
            trackTotal: role.trackTotal.toFixed(6),
            streams: Math.round(role.streams),
            trackCount: role.tracks.size
          }))
          .sort((a, b) => parseFloat(b.earnings) - parseFloat(a.earnings));

        const total = byRole.reduce((sum, role) => sum + parseFloat(role.earnings), 0).toFixed(2);

        setData({ byRole, total });
      } catch (err) {
        console.error('Error fetching earnings by role:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchEarningsByRole();
  }, [artistName, dateRange]);

  return { data, loading, error };
};
