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

// Helper function to get ad track IDs and titles for filtering
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

// Helper function to check if an event is for an ad
const isAdEvent = (event, adTrackIds, adTrackTitles) => {
  return adTrackIds.has(event.track_id) || adTrackTitles.has(event.track_title);
};

export const useOverviewStats = (artistId, isAdmin, dateRange = 30, refreshKey = 0) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('🔍 useOverviewStats called with:', { artistId, isAdmin, dateRange });

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);

        // Get track IDs for this artist
        let trackIds = null;
        if (!isAdmin && artistId) {
          console.log('📊 Fetching contributions for artist ID:', artistId);
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
          console.log('📊 Found track IDs for artist:', trackIds);
        } else if (!isAdmin && !artistId) {
          console.error('❌ Artist mode but artistId is null - artist not in database. Returning empty data.');
          setData({
            totalStreams: 0,
            uniqueListeners: 0,
            totalTracks: 0,
            estimatedRevenue: '0.000000'
          });
          return;
        }

        // If artist has no tracks, return empty
        if (!isAdmin && trackIds && trackIds.length === 0) {
          console.warn('⚠️ Artist has no tracks in track_contributors');
          setData({
            totalStreams: 0,
            uniqueListeners: 0,
            totalTracks: 0,
            estimatedRevenue: '0.000000'
          });
          return;
        }

        let query = supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString());

        if (trackIds && trackIds.length > 0) {
          query = query.in('track_id', trackIds);
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

        // Filter out ad events
        const { adTrackIds, adTrackTitles } = await getAdTrackIdentifiers();
        const nonAdEvents = events.filter(e => !isAdEvent(e, adTrackIds, adTrackTitles));

        const uniqueListeners = new Set(nonAdEvents.map(e => e.access_code_id).filter(Boolean)).size;
        const eventTrackIds = nonAdEvents.map(e => e.track_id).filter(Boolean);
        const uniqueTracks = new Set(eventTrackIds).size;
        const totalStreams = nonAdEvents.length;
        
        let estimatedRevenue;
        
        if (isAdmin) {
          // Admin sees total platform revenue (gross)
          estimatedRevenue = totalStreams * 0.001;
        } else {
          // Artist sees their actual earnings after platform split and contributor splits
          // Get contributor splits for this artist
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id, split_percentage')
            .eq('artist_id', artistId);
          
          const splitsByTrack = (contributions || []).reduce((acc, c) => {
            acc[c.track_id] = c.split_percentage || 0;
            return acc;
          }, {});
          
          // Calculate earnings per stream based on artist's split
          let totalArtistEarnings = 0;
          nonAdEvents.forEach(event => {
            const artistSplit = splitsByTrack[event.track_id] || 0;
            const streamRevenue = 0.001 * 0.70; // Platform gives 70% to artists
            const artistShare = (streamRevenue * artistSplit) / 100;
            totalArtistEarnings += artistShare;
          });
          
          estimatedRevenue = totalArtistEarnings;
        }

        console.log('📊 OVERVIEW STATS - Active Tracks (from analytics events):');
        console.log('  Total events (non-ad):', nonAdEvents.length);
        console.log('  Unique track IDs:', uniqueTracks);
        console.log('  Track IDs:', Array.from(new Set(eventTrackIds)));
        console.log('  Estimated Revenue:', estimatedRevenue);

        setData({
          totalStreams,
          uniqueListeners,
          totalTracks: uniqueTracks,
          estimatedRevenue: estimatedRevenue.toFixed(6)
        });
      } catch (err) {
        console.error('Error fetching overview stats:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [artistId, isAdmin, dateRange, refreshKey]);

  return { data, loading, error };
};

export const useTopTracks = (artistId, isAdmin, dateRange = 30, limit = 10, refreshKey = 0) => {
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

        // Get track IDs for this artist
        let trackIds = null;
        if (!isAdmin && !artistId) {
          // Artist not in database - return empty data
          console.error('❌ Artist not in database - returning empty data');
          setData([]);
          return;
        }
        
        if (!isAdmin && artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
          
          // Artist has no tracks - return empty
          if (trackIds.length === 0) {
            console.warn('⚠️ Artist has no tracks');
            setData([]);
            return;
          }
        }

        // First get existing track IDs from mvp_content
        const { data: existingTracks, error: tracksError } = await supabase
          .from('mvp_content')
          .select('id');

        if (tracksError) throw tracksError;

        const existingTrackIds = new Set(existingTracks?.map(t => t.id) || []);

        let query = supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString())
          .not('track_title', 'is', null)
          .not('artist_name', 'is', null);

        if (trackIds && trackIds.length > 0) {
          // Filter by both artist's tracks AND existing tracks
          const validTrackIds = trackIds.filter(id => existingTrackIds.has(id));
          if (validTrackIds.length === 0) {
            setData([]);
            return;
          }
          query = query.in('track_id', validTrackIds);
        } else if (isAdmin) {
          // Admin view: filter by all existing tracks
          query = query.in('track_id', Array.from(existingTrackIds));
        }

        const { data: events, error: queryError } = await query;

        if (queryError) throw queryError;

        if (!events || events.length === 0) {
          setData([]);
          return;
        }

        // Get list of ad track IDs to exclude
        const { data: adTracks } = await supabase
          .from('mvp_content')
          .select('id, title')
          .eq('is_ad', true);

        const adTrackIds = new Set(adTracks?.map(t => t.id) || []);
        const adTrackTitles = new Set(adTracks?.map(t => t.title) || []);

        const trackStats = {};
        events.forEach(event => {
          // Skip if this is an ad
          if (adTrackIds.has(event.track_id) || adTrackTitles.has(event.track_title)) {
            return;
          }

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
  }, [artistId, isAdmin, dateRange, limit, refreshKey]);

  return { data, loading, error };
};

export const useStreamTimeline = (artistId, isAdmin, dateRange = 30) => {
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

        // CRITICAL: If artist mode but no artistId, return EMPTY data
        if (!isAdmin && !artistId) {
          console.error('❌ useStreamTimeline: Artist not in database - returning empty data');
          setData([]);
          return;
        }

        // Get track IDs for this artist
        let trackIds = null;
        if (!isAdmin && artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
          
          if (trackIds.length === 0) {
            console.warn('⚠️ useStreamTimeline: Artist has no tracks');
            setData([]);
            return;
          }
        }

        // First get existing track IDs from mvp_content
        const { data: existingTracks, error: tracksError } = await supabase
          .from('mvp_content')
          .select('id');

        if (tracksError) throw tracksError;

        const existingTrackIds = new Set(existingTracks?.map(t => t.id) || []);

        let query = supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString());

        if (trackIds && trackIds.length > 0) {
          // Filter by both artist's tracks AND existing tracks
          const validTrackIds = trackIds.filter(id => existingTrackIds.has(id));
          if (validTrackIds.length === 0) {
            setData([]);
            return;
          }
          query = query.in('track_id', validTrackIds);
        } else {
          // Admin view: filter by all existing tracks
          query = query.in('track_id', Array.from(existingTrackIds));
        }

        const { data: events, error: queryError } = await query;

        if (queryError) throw queryError;

        if (!events || events.length === 0) {
          setData([]);
          return;
        }

        // Filter out ad events
        const { adTrackIds, adTrackTitles } = await getAdTrackIdentifiers();
        const nonAdEvents = events.filter(e => !isAdEvent(e, adTrackIds, adTrackTitles));

        const dailyStats = {};
        nonAdEvents.forEach(event => {
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
  }, [artistId, isAdmin, dateRange]);

  return { data, loading, error };
};

export const useDemographics = (artistId, isAdmin, dateRange = 30) => {
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

        // CRITICAL: If artist mode but no artistId, return EMPTY data
        if (!isAdmin && !artistId) {
          console.error('❌ useDemographics: Artist not in database - returning empty data');
          setData({ gender: [], ageRange: [] });
          return;
        }

        // Get track IDs for this artist
        let trackIds = null;
        if (!isAdmin && artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
          
          if (trackIds.length === 0) {
            console.warn('⚠️ useDemographics: Artist has no tracks');
            setData({ gender: [], ageRange: [] });
            return;
          }
        }

        // First get existing track IDs from mvp_content
        const { data: existingTracks, error: tracksError } = await supabase
          .from('mvp_content')
          .select('id');

        if (tracksError) throw tracksError;

        const existingTrackIds = new Set(existingTracks?.map(t => t.id) || []);

        let eventsQuery = supabase
          .from('analytics_events')
          .select('access_code_id, track_id')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString());

        if (trackIds && trackIds.length > 0) {
          // Filter by both artist's tracks AND existing tracks
          const validTrackIds = trackIds.filter(id => existingTrackIds.has(id));
          if (validTrackIds.length === 0) {
            setData({ gender: [], ageRange: [] });
            return;
          }
          eventsQuery = eventsQuery.in('track_id', validTrackIds);
        } else {
          // Admin view: filter by all existing tracks
          eventsQuery = eventsQuery.in('track_id', Array.from(existingTrackIds));
        }

        const { data: events, error: eventsError } = await eventsQuery;

        if (eventsError) throw eventsError;

        if (!events || events.length === 0) {
          setData({ gender: [], ageRange: [] });
          return;
        }

        // Filter out ad events
        const { adTrackIds, adTrackTitles } = await getAdTrackIdentifiers();
        const nonAdEvents = events.filter(e => !isAdEvent(e, adTrackIds, adTrackTitles));

        const uniqueAccessCodes = [...new Set(nonAdEvents.map(e => e.access_code_id))];

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
  }, [artistId, isAdmin, dateRange]);

  return { data, loading, error };
};

export const useGeographic = (artistId, isAdmin, dateRange = 30) => {
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

        // CRITICAL: If artist mode but no artistId, return EMPTY data
        if (!isAdmin && !artistId) {
          console.error('❌ useGeographic: Artist not in database - returning empty data');
          setData([]);
          return;
        }

        // Get track IDs for this artist
        let trackIds = null;
        if (!isAdmin && artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
          
          if (trackIds.length === 0) {
            console.warn('⚠️ useGeographic: Artist has no tracks');
            setData([]);
            return;
          }
        }

        // Get track IDs for this artist (continued)
        if (!isAdmin && artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
        }

        // First get existing track IDs from mvp_content
        const { data: existingTracks, error: tracksError } = await supabase
          .from('mvp_content')
          .select('id');

        if (tracksError) throw tracksError;

        const existingTrackIds = new Set(existingTracks?.map(t => t.id) || []);

        let eventsQuery = supabase
          .from('analytics_events')
          .select('access_code_id, track_id')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString());

        if (trackIds && trackIds.length > 0) {
          // Filter by both artist's tracks AND existing tracks
          const validTrackIds = trackIds.filter(id => existingTrackIds.has(id));
          if (validTrackIds.length === 0) {
            setData([]);
            return;
          }
          eventsQuery = eventsQuery.in('track_id', validTrackIds);
        } else {
          // Admin view: filter by all existing tracks
          eventsQuery = eventsQuery.in('track_id', Array.from(existingTrackIds));
        }

        const { data: events, error: eventsError } = await eventsQuery;

        if (eventsError) throw eventsError;

        if (!events || events.length === 0) {
          setData([]);
          return;
        }

        // Filter out ad events
        const { adTrackIds, adTrackTitles } = await getAdTrackIdentifiers();
        const nonAdEvents = events.filter(e => !isAdEvent(e, adTrackIds, adTrackTitles));

        const accessCodeCounts = {};
        nonAdEvents.forEach(event => {
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
  }, [artistId, isAdmin, dateRange]);

  return { data, loading, error };
};

export const useEarnings = (artistId, isAdmin, dateRange = 30) => {
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

        // CRITICAL: If artist mode but no artistId, return EMPTY data
        if (!isAdmin && !artistId) {
          console.error('❌ useEarnings: Artist not in database - returning empty data');
          setData({
            totalRevenue: '0.000000',
            artistShare: '0.000000',
            platformFee: '0.000000',
            myTotalEarnings: '0.000000',
            byTrack: []
          });
          return;
        }

        // Get track IDs and splits for this artist
        let trackIds = null;
        let splitsByTrack = {};
        if (!isAdmin && artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id, split_percentage')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
          splitsByTrack = contributions?.reduce((acc, c) => {
            acc[c.track_id] = c.split_percentage;
            return acc;
          }, {}) || {};
          
          if (trackIds.length === 0) {
            console.warn('⚠️ useEarnings: Artist has no tracks');
            setData({
              totalRevenue: '0.000000',
              artistShare: '0.000000',
              platformFee: '0.000000',
              myTotalEarnings: '0.000000',
              byTrack: []
            });
            return;
          }
        }

        // Continue with existing logic
        if (!isAdmin && artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id, split_percentage')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
          splitsByTrack = contributions?.reduce((acc, c) => {
            acc[c.track_id] = c.split_percentage;
            return acc;
          }, {}) || {};
        }

        // First get existing track IDs from mvp_content
        const { data: existingTracks, error: tracksError } = await supabase
          .from('mvp_content')
          .select('id');

        if (tracksError) throw tracksError;

        const existingTrackIds = new Set(existingTracks?.map(t => t.id) || []);

        let query = supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString())
          .not('track_title', 'is', null);

        if (trackIds && trackIds.length > 0) {
          // Filter by both artist's tracks AND existing tracks
          const validTrackIds = trackIds.filter(id => existingTrackIds.has(id));
          if (validTrackIds.length === 0) {
            setData({
              totalRevenue: 0,
              artistShare: 0,
              platformFee: 0,
              byTrack: []
            });
            return;
          }
          query = query.in('track_id', validTrackIds);
        } else {
          // Admin view: filter by all existing tracks
          query = query.in('track_id', Array.from(existingTrackIds));
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

        // Filter out ad events
        const { adTrackIds, adTrackTitles } = await getAdTrackIdentifiers();
        const nonAdEvents = events.filter(e => !isAdEvent(e, adTrackIds, adTrackTitles));

        const totalStreams = nonAdEvents.length;
        const totalRevenue = totalStreams * 0.001;
        const artistShare = totalRevenue * 0.70;
        const platformFee = totalRevenue * 0.30;

        const trackRevenue = {};
        nonAdEvents.forEach(event => {
          const key = event.track_id || event.track_title;
          if (!trackRevenue[key]) {
            trackRevenue[key] = {
              trackId: event.track_id,
              trackTitle: event.track_title,
              streams: 0,
              revenue: 0
            };
          }
          trackRevenue[key].streams++;
          trackRevenue[key].revenue += 0.001;
        });

        // Get all contributors for admin view
        let contributorsByTrack = {};
        if (isAdmin) {
          const allTrackIds = Object.values(trackRevenue).map(t => t.trackId).filter(Boolean);
          if (allTrackIds.length > 0) {
            const { data: allContributors } = await supabase
              .from('track_contributors')
              .select(`
                track_id,
                role,
                split_percentage,
                artists (
                  name
                )
              `)
              .in('track_id', allTrackIds);
            
            contributorsByTrack = (allContributors || []).reduce((acc, c) => {
              if (!acc[c.track_id]) acc[c.track_id] = [];
              acc[c.track_id].push(c);
              return acc;
            }, {});
          }
        }

        const byTrack = Object.values(trackRevenue)
          .map(track => {
            const split = splitsByTrack[track.trackId];
            const artistShareTotal = track.revenue * 0.70;
            const mySplit = split ? (artistShareTotal * split) / 100 : artistShareTotal;
            
            // Calculate individual earnings for each contributor (admin view)
            const contributors = contributorsByTrack[track.trackId] || [];
            const contributorEarnings = contributors.map(c => ({
              name: c.artists.name,
              role: c.role,
              split: c.split_percentage,
              earnings: c.split_percentage ? ((artistShareTotal * c.split_percentage) / 100).toFixed(6) : null
            }));
            
            return {
              ...track,
              revenue: track.revenue.toFixed(6),
              artistShare: artistShareTotal.toFixed(6),
              mySplit: split || null,
              myEarnings: mySplit.toFixed(6),
              contributors: contributorEarnings
            };
          })
          .sort((a, b) => b.streams - a.streams);

        // Calculate total earnings for this specific artist (sum of myEarnings)
        const myTotalEarnings = isAdmin 
          ? artistShare 
          : byTrack.reduce((sum, track) => sum + parseFloat(track.myEarnings), 0);

        setData({
          totalRevenue: totalRevenue.toFixed(6),
          artistShare: artistShare.toFixed(6),
          platformFee: platformFee.toFixed(6),
          myTotalEarnings: myTotalEarnings.toFixed(6),
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
  }, [artistId, isAdmin, dateRange]);

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

        // Count artists from artists table
        const { data: artists, error: artistsError } = await supabase
          .from('artists')
          .select('id')
          .eq('category', 'music');

        if (artistsError) throw artistsError;

        // Count tracks from mvp_content
        const { data: tracks, error: tracksError } = await supabase
          .from('mvp_content')
          .select('id')
          .neq('is_ad', true);

        if (tracksError) throw tracksError;

        // Get existing track IDs to filter analytics
        const existingTrackIds = tracks?.map(t => t.id) || [];

        if (existingTrackIds.length === 0) {
          setData({
            totalArtists: artists?.length || 0,
            totalTracks: 0,
            totalStreams: 0,
            totalRevenue: '0.00'
          });
          return;
        }

        const { data: events, error: eventsError } = await supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .in('track_id', existingTrackIds);

        if (eventsError) throw eventsError;

        // Filter out ad events
        const { adTrackIds, adTrackTitles } = await getAdTrackIdentifiers();
        const nonAdEvents = events?.filter(e => !isAdEvent(e, adTrackIds, adTrackTitles)) || [];

        const totalArtists = artists?.length || 0;
        const totalTracks = tracks?.length || 0;
        const totalStreams = nonAdEvents.length;
        const totalRevenue = (totalStreams * 0.001).toFixed(2);

        console.log('🌐 PLATFORM STATS - Total Artists and Tracks:');
        console.log('  Total artists:', totalArtists);
        console.log('  Total tracks (non-ad):', totalTracks);

        setData({
          totalArtists,
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


export const useArtistUploadStats = (artistId) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUploadStats = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!artistId) {
          setData(null);
          return;
        }

        // Get all contributions
        const { data: contributions, error: contribError } = await supabase
          .from('track_contributors')
          .select(`
            track_id,
            mvp_content (
              created_at,
              is_ad
            )
          `)
          .eq('artist_id', artistId);

        if (contribError) throw contribError;

        // Filter out ads and get track data
        const tracks = (contributions || [])
          .filter(c => !c.mvp_content.is_ad)
          .map(c => c.mvp_content)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const totalUploads = tracks.length;
        const lastUpload = tracks.length > 0 ? tracks[0].created_at : null;

        setData({
          totalUploads,
          lastUpload: lastUpload ? new Date(lastUpload).toLocaleDateString() : 'Never'
        });
      } catch (err) {
        console.error('Error fetching upload stats:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUploadStats();
  }, [artistId]);

  return { data, loading, error };
};
