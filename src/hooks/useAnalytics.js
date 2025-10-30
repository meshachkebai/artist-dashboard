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

        // Get artist_id if filtering by artist
        let artistId = null;
        if (!isAdmin && artistName) {
          const { data: artistData } = await supabase
            .from('artists')
            .select('id')
            .eq('name', artistName)
            .single();
          artistId = artistData?.id;
        }

        // Get track IDs for this artist
        let trackIds = null;
        if (artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
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
        const estimatedRevenue = totalStreams * 0.001;

        console.log('📊 OVERVIEW STATS - Active Tracks (from analytics events):');
        console.log('  Total events (non-ad):', nonAdEvents.length);
        console.log('  Unique track IDs:', uniqueTracks);
        console.log('  Track IDs:', Array.from(new Set(eventTrackIds)));

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

        // Get artist_id if filtering by artist
        let artistId = null;
        if (!isAdmin && artistName) {
          const { data: artistData } = await supabase
            .from('artists')
            .select('id')
            .eq('name', artistName)
            .single();
          artistId = artistData?.id;
        }

        // Get track IDs for this artist
        let trackIds = null;
        if (artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
        }

        let query = supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString())
          .not('track_title', 'is', null)
          .not('artist_name', 'is', null);

        if (trackIds && trackIds.length > 0) {
          query = query.in('track_id', trackIds);
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

        // Get artist_id if filtering by artist
        let artistId = null;
        if (!isAdmin && artistName) {
          const { data: artistData } = await supabase
            .from('artists')
            .select('id')
            .eq('name', artistName)
            .single();
          artistId = artistData?.id;
        }

        // Get track IDs for this artist
        let trackIds = null;
        if (artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
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

        // Get artist_id if filtering by artist
        let artistId = null;
        if (!isAdmin && artistName) {
          const { data: artistData } = await supabase
            .from('artists')
            .select('id')
            .eq('name', artistName)
            .single();
          artistId = artistData?.id;
        }

        // Get track IDs for this artist
        let trackIds = null;
        if (artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
        }

        let eventsQuery = supabase
          .from('analytics_events')
          .select('access_code_id, track_id')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString());

        if (trackIds && trackIds.length > 0) {
          eventsQuery = eventsQuery.in('track_id', trackIds);
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

        // Get artist_id if filtering by artist
        let artistId = null;
        if (!isAdmin && artistName) {
          const { data: artistData } = await supabase
            .from('artists')
            .select('id')
            .eq('name', artistName)
            .single();
          artistId = artistData?.id;
        }

        // Get track IDs for this artist
        let trackIds = null;
        if (artistId) {
          const { data: contributions } = await supabase
            .from('track_contributors')
            .select('track_id')
            .eq('artist_id', artistId);
          trackIds = contributions?.map(c => c.track_id) || [];
        }

        let eventsQuery = supabase
          .from('analytics_events')
          .select('access_code_id, track_id')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString());

        if (trackIds && trackIds.length > 0) {
          eventsQuery = eventsQuery.in('track_id', trackIds);
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

        // Get artist_id if filtering by artist
        let artistId = null;
        if (!isAdmin && artistName) {
          const { data: artistData } = await supabase
            .from('artists')
            .select('id')
            .eq('name', artistName)
            .single();
          artistId = artistData?.id;
        }

        // Get track IDs and splits for this artist
        let trackIds = null;
        let splitsByTrack = {};
        if (artistId) {
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

        let query = supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .gte('timestamp', startDate.toISOString())
          .not('track_title', 'is', null);

        if (trackIds && trackIds.length > 0) {
          query = query.in('track_id', trackIds);
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
              earnings: c.split_percentage ? ((artistShareTotal * c.split_percentage) / 100).toFixed(2) : null
            }));
            
            return {
              ...track,
              revenue: track.revenue.toFixed(2),
              artistShare: artistShareTotal.toFixed(2),
              mySplit: split || null,
              myEarnings: mySplit.toFixed(2),
              contributors: contributorEarnings
            };
          })
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

        const { data: events, error: eventsError } = await supabase
          .from('analytics_events')
          .select('*')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30);

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


export const useArtistUploadStats = (artistName) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUploadStats = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get artist_id first
        const { data: artistData, error: artistError } = await supabase
          .from('artists')
          .select('id')
          .eq('name', artistName)
          .single();

        if (artistError) throw artistError;

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
          .eq('artist_id', artistData.id);

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

    if (artistName) {
      fetchUploadStats();
    }
  }, [artistName]);

  return { data, loading, error };
};
