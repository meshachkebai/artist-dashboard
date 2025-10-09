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

export const useOverviewStats = (artistName, isAdmin, dateRange = 30, refreshKey = 0) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);

        let query = supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString());

        if (!isAdmin && artistName) {
          query = query.eq('artist_name', artistName);
        }

        const { data: events, error: queryError } = await query;

        if (queryError) throw queryError;

        if (!events || events.length === 0) {
          setData({
            totalStreams: 0,
            uniqueListeners: 0,
            totalTracks: 0,
            estimatedRevenue: 0
          });
          return;
        }

        const uniqueListeners = new Set(events.map(e => e.access_code_id).filter(Boolean)).size;
        const uniqueTracks = new Set(events.map(e => e.track_id).filter(Boolean)).size;
        const totalStreams = events.length;
        const estimatedRevenue = totalStreams * 0.01;

        setData({
          totalStreams,
          uniqueListeners,
          totalTracks: uniqueTracks,
          estimatedRevenue: estimatedRevenue.toFixed(2)
        });
      } catch (err) {
        console.error('Error fetching overview stats:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [artistName, isAdmin, dateRange, refreshKey]);

  return { data, loading, error };
};

export const useTopTracks = (artistName, isAdmin, dateRange = 30, limit = 10, refreshKey = 0) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTopTracks = async () => {
      try {
        setLoading(true);
        setError(null);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);

        let query = supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString())
          .not('track_title', 'is', null)
          .not('artist_name', 'is', null);

        if (!isAdmin && artistName) {
          query = query.eq('artist_name', artistName);
        }

        const { data: events, error: queryError } = await query;

        if (queryError) throw queryError;

        if (!events || events.length === 0) {
          setData([]);
          return;
        }

        const trackStats = {};
        events.forEach(event => {
          const key = event.track_id || event.track_title;
          if (!trackStats[key]) {
            trackStats[key] = {
              trackTitle: event.track_title,
              artistName: event.artist_name,
              streams: 0,
              uniqueListeners: new Set(),
              totalDuration: 0
            };
          }
          trackStats[key].streams++;
          if (event.access_code_id) {
            trackStats[key].uniqueListeners.add(event.access_code_id);
          }
          trackStats[key].totalDuration += event.duration_seconds || 0;
        });

        const topTracks = Object.values(trackStats)
          .map(track => ({
            trackTitle: track.trackTitle,
            artistName: track.artistName,
            streams: track.streams,
            uniqueListeners: track.uniqueListeners.size,
            avgDuration: track.streams > 0 ? Math.round(track.totalDuration / track.streams) : 0
          }))
          .sort((a, b) => b.streams - a.streams)
          .slice(0, limit);

        setData(topTracks);
      } catch (err) {
        console.error('Error fetching top tracks:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTopTracks();
  }, [artistName, isAdmin, dateRange, limit, refreshKey]);

  return { data, loading, error };
};

export const useStreamTimeline = (artistName, isAdmin, dateRange = 30) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        setLoading(true);
        setError(null);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);

        let query = supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString());

        if (!isAdmin && artistName) {
          query = query.eq('artist_name', artistName);
        }

        const { data: events, error: queryError } = await query;

        if (queryError) throw queryError;

        if (!events || events.length === 0) {
          setData([]);
          return;
        }

        const dailyStats = {};
        events.forEach(event => {
          const date = new Date(event.timestamp).toISOString().split('T')[0];
          if (!dailyStats[date]) {
            dailyStats[date] = {
              date,
              streams: 0,
              uniqueListeners: new Set()
            };
          }
          dailyStats[date].streams++;
          dailyStats[date].uniqueListeners.add(event.access_code_id);
        });

        const timeline = Object.values(dailyStats)
          .map(day => ({
            date: day.date,
            streams: day.streams,
            uniqueListeners: day.uniqueListeners.size
          }))
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        setData(timeline);
      } catch (err) {
        console.error('Error fetching timeline:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTimeline();
  }, [artistName, isAdmin, dateRange]);

  return { data, loading, error };
};

export const useDemographics = (artistName, isAdmin, dateRange = 30) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDemographics = async () => {
      try {
        setLoading(true);
        setError(null);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);

        let eventsQuery = supabase
          .from('analytics_events')
          .select('access_code_id, artist_name')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString());

        if (!isAdmin && artistName) {
          eventsQuery = eventsQuery.eq('artist_name', artistName);
        }

        const { data: events, error: eventsError } = await eventsQuery;

        if (eventsError) throw eventsError;

        if (!events || events.length === 0) {
          setData({ gender: [], ageRange: [] });
          return;
        }

        const uniqueAccessCodes = [...new Set(events.map(e => e.access_code_id))];

        const { data: profiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('access_code_id, gender, dob')
          .in('access_code_id', uniqueAccessCodes);

        if (profilesError) throw profilesError;

        if (!profiles || profiles.length === 0) {
          setData({ gender: [], ageRange: [] });
          return;
        }

        const genderStats = {};
        const ageStats = {};

        profiles.forEach(profile => {
          if (profile.gender) {
            genderStats[profile.gender] = (genderStats[profile.gender] || 0) + 1;
          }

          if (profile.dob) {
            const age = new Date().getFullYear() - new Date(profile.dob).getFullYear();
            let ageRange;
            if (age >= 18 && age <= 24) ageRange = '18-24';
            else if (age >= 25 && age <= 34) ageRange = '25-34';
            else if (age >= 35 && age <= 44) ageRange = '35-44';
            else ageRange = '45+';

            ageStats[ageRange] = (ageStats[ageRange] || 0) + 1;
          }
        });

        const genderData = Object.entries(genderStats).map(([gender, count]) => ({
          gender,
          count,
          percentage: ((count / profiles.length) * 100).toFixed(1)
        }));

        const ageData = Object.entries(ageStats).map(([range, count]) => ({
          range,
          count,
          percentage: ((count / profiles.length) * 100).toFixed(1)
        }));

        setData({ gender: genderData, ageRange: ageData });
      } catch (err) {
        console.error('Error fetching demographics:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDemographics();
  }, [artistName, isAdmin, dateRange]);

  return { data, loading, error };
};

export const useGeographic = (artistName, isAdmin, dateRange = 30) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchGeographic = async () => {
      try {
        setLoading(true);
        setError(null);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);

        let eventsQuery = supabase
          .from('analytics_events')
          .select('access_code_id, artist_name')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString());

        if (!isAdmin && artistName) {
          eventsQuery = eventsQuery.eq('artist_name', artistName);
        }

        const { data: events, error: eventsError } = await eventsQuery;

        if (eventsError) throw eventsError;

        if (!events || events.length === 0) {
          setData([]);
          return;
        }

        const accessCodeCounts = {};
        events.forEach(event => {
          accessCodeCounts[event.access_code_id] = (accessCodeCounts[event.access_code_id] || 0) + 1;
        });

        const uniqueAccessCodes = Object.keys(accessCodeCounts);

        const { data: profiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('access_code_id, city, admin_name')
          .in('access_code_id', uniqueAccessCodes);

        if (profilesError) throw profilesError;

        if (!profiles || profiles.length === 0) {
          setData([]);
          return;
        }

        const locationStats = {};
        profiles.forEach(profile => {
          const location = `${profile.city || 'Unknown'}, ${profile.admin_name || 'Unknown'}`;
          if (!locationStats[location]) {
            locationStats[location] = {
              city: profile.city || 'Unknown',
              province: profile.admin_name || 'Unknown',
              listeners: 0,
              streams: 0
            };
          }
          locationStats[location].listeners++;
          locationStats[location].streams += accessCodeCounts[profile.access_code_id] || 0;
        });

        const totalStreams = Object.values(locationStats).reduce((sum, loc) => sum + loc.streams, 0);

        const geographic = Object.values(locationStats)
          .map(loc => ({
            ...loc,
            percentage: ((loc.streams / totalStreams) * 100).toFixed(1)
          }))
          .sort((a, b) => b.listeners - a.listeners)
          .slice(0, 10);

        setData(geographic);
      } catch (err) {
        console.error('Error fetching geographic data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchGeographic();
  }, [artistName, isAdmin, dateRange]);

  return { data, loading, error };
};

export const useEarnings = (artistName, isAdmin, dateRange = 30) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEarnings = async () => {
      try {
        setLoading(true);
        setError(null);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);

        let query = supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString())
          .not('track_title', 'is', null);

        if (!isAdmin && artistName) {
          query = query.eq('artist_name', artistName);
        }

        const { data: events, error: queryError } = await query;

        if (queryError) throw queryError;

        if (!events || events.length === 0) {
          setData({
            totalRevenue: 0,
            artistShare: 0,
            platformFee: 0,
            byTrack: []
          });
          return;
        }

        const totalStreams = events.length;
        const totalRevenue = totalStreams * 0.01;
        const artistShare = totalRevenue * 0.70;
        const platformFee = totalRevenue * 0.30;

        const trackRevenue = {};
        events.forEach(event => {
          const key = event.track_id || event.track_title;
          if (!trackRevenue[key]) {
            trackRevenue[key] = {
              trackTitle: event.track_title,
              streams: 0,
              revenue: 0
            };
          }
          trackRevenue[key].streams++;
          trackRevenue[key].revenue += 0.01;
        });

        const byTrack = Object.values(trackRevenue)
          .map(track => ({
            ...track,
            revenue: track.revenue.toFixed(2),
            artistShare: (track.revenue * 0.70).toFixed(2)
          }))
          .sort((a, b) => b.streams - a.streams);

        setData({
          totalRevenue: totalRevenue.toFixed(2),
          artistShare: artistShare.toFixed(2),
          platformFee: platformFee.toFixed(2),
          byTrack
        });
      } catch (err) {
        console.error('Error fetching earnings:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchEarnings();
  }, [artistName, isAdmin, dateRange]);

  return { data, loading, error };
};

export const usePlatformStats = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPlatformStats = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: tracks, error: tracksError } = await supabase
          .from('mvp_content')
          .select('artist');

        if (tracksError) throw tracksError;

        const { data: events, error: eventsError } = await supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30);

        if (eventsError) throw eventsError;

        const uniqueArtists = new Set(tracks?.map(t => t.artist) || []).size;
        const totalTracks = tracks?.length || 0;
        const totalStreams = events?.length || 0;
        const totalRevenue = (totalStreams * 0.01).toFixed(2);

        setData({
          totalArtists: uniqueArtists,
          totalTracks,
          totalStreams,
          totalRevenue
        });
      } catch (err) {
        console.error('Error fetching platform stats:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPlatformStats();
  }, []);

  return { data, loading, error };
};
