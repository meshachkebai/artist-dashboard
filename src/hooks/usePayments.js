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
 * Hook to get payment summary for an artist
 * Returns: totalEarned, totalPaid, pendingPayout, paymentHistory
 */
export const usePaymentSummary = (artistId, dateRange = null) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPaymentSummary = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!artistId) {
          setData({
            totalEarned: '0.000000',
            totalPaid: '0.000000',
            pendingPayout: '0.000000',
            paymentHistory: []
          });
          return;
        }

        // Get artist's split percentages per track (exclude ads)
        const { data: allContributions } = await supabase
          .from('track_contributors')
          .select(`
            track_id, 
            split_percentage,
            mvp_content!inner(is_ad)
          `)
          .eq('artist_id', artistId);

        // Filter out ad tracks
        const contributions = (allContributions || []).filter(c => !c.mvp_content?.is_ad);

        const trackIds = contributions?.map(c => c.track_id) || [];
        const splitsByTrack = contributions?.reduce((acc, c) => {
          acc[c.track_id] = c.split_percentage || 0;
          return acc;
        }, {}) || {};

        if (trackIds.length === 0) {
          setData({
            totalEarned: '0.000000',
            totalPaid: '0.000000',
            pendingPayout: '0.000000',
            paymentHistory: []
          });
          return;
        }

        // Build analytics query
        let eventsQuery = supabase
          .from('analytics_events')
          .select('track_id')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .in('track_id', trackIds);

        // Apply date range if specified
        if (dateRange) {
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - dateRange);
          eventsQuery = eventsQuery.gte('timestamp', startDate.toISOString());
        }

        const { data: events } = await eventsQuery;

        // Calculate total earned based on artist's splits
        let totalEarned = 0;
        (events || []).forEach(event => {
          const artistSplit = splitsByTrack[event.track_id] || 0;
          const streamRevenue = 0.001 * 0.70; // K0.001 per stream, 70% to artists
          const artistShare = (streamRevenue * artistSplit) / 100;
          totalEarned += artistShare;
        });

        // Get payment history
        const { data: payments } = await supabase
          .from('artist_payments')
          .select('*')
          .eq('artist_id', artistId)
          .order('payment_date', { ascending: false });

        // Calculate total paid (only completed payments)
        const totalPaid = (payments || [])
          .filter(p => p.status === 'completed')
          .reduce((sum, p) => sum + parseFloat(p.amount_kwacha), 0);

        const pendingPayout = totalEarned - totalPaid;

        setData({
          totalEarned: totalEarned.toFixed(6),
          totalPaid: totalPaid.toFixed(6),
          pendingPayout: pendingPayout.toFixed(6),
          paymentHistory: payments || []
        });
      } catch (err) {
        console.error('Error fetching payment summary:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentSummary();
  }, [artistId, dateRange]);

  return { data, loading, error };
};

/**
 * Hook to get platform-wide payment summary (admin only)
 * Returns: totalEarned, totalPaid, pendingPayout across all artists
 */
export const usePlatformPaymentSummary = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPlatformSummary = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get all artists
        const { data: artists } = await supabase
          .from('artists')
          .select('id')
          .eq('category', 'music');

        if (!artists || artists.length === 0) {
          setData({
            totalEarned: '0.000000',
            totalPaid: '0.000000',
            pendingPayout: '0.000000'
          });
          return;
        }

        const artistIds = artists.map(a => a.id);

        // Get all contributions (exclude ads)
        const { data: allContributions } = await supabase
          .from('track_contributors')
          .select(`
            track_id, 
            artist_id, 
            split_percentage,
            mvp_content!inner(is_ad)
          `)
          .in('artist_id', artistIds);

        // Filter out ad tracks
        const contributions = (allContributions || []).filter(c => !c.mvp_content?.is_ad);

        if (!contributions || contributions.length === 0) {
          setData({
            totalEarned: '0.000000',
            totalPaid: '0.000000',
            pendingPayout: '0.000000'
          });
          return;
        }

        // Get all streams (exclude ads)
        const trackIds = [...new Set(contributions.map(c => c.track_id))];
        const { data: events } = await supabase
          .from('analytics_events')
          .select('track_id')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .in('track_id', trackIds);

        // Calculate total platform revenue (100%) and artist earnings (70%)
        const totalStreams = (events || []).length;
        const totalPlatformRevenue = totalStreams * 0.001; // K0.001 per stream
        
        let totalArtistEarnings = 0;
        (events || []).forEach(event => {
          // Get all contributors for this track
          const trackContributors = contributions.filter(c => c.track_id === event.track_id);
          trackContributors.forEach(contributor => {
            const artistSplit = contributor.split_percentage || 0;
            const streamRevenue = 0.001 * 0.70; // Artist share is 70%
            const artistShare = (streamRevenue * artistSplit) / 100;
            totalArtistEarnings += artistShare;
          });
        });

        // Get all payments
        const { data: payments } = await supabase
          .from('artist_payments')
          .select('amount_kwacha, status')
          .in('artist_id', artistIds);

        const totalPaid = (payments || [])
          .filter(p => p.status === 'completed')
          .reduce((sum, p) => sum + parseFloat(p.amount_kwacha), 0);

        setData({
          totalRevenue: totalPlatformRevenue.toFixed(6), // Total platform revenue (100%)
          totalArtistEarnings: totalArtistEarnings.toFixed(6), // What artists earned (70% × splits)
          totalPaid: totalPaid.toFixed(6), // What's been paid to artists
          pendingPayout: (totalArtistEarnings - totalPaid).toFixed(6) // What's owed to artists
        });
      } catch (err) {
        console.error('Error fetching platform payment summary:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPlatformSummary();
  }, []);

  return { data, loading, error };
};

/**
 * Hook to get all pending payouts (admin only)
 * Returns list of artists with pending payments
 */
export const usePendingPayouts = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPendingPayouts = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get all artists
        const { data: artists } = await supabase
          .from('artists')
          .select('id, name')
          .eq('category', 'music')
          .order('name');

        if (!artists || artists.length === 0) {
          setData([]);
          return;
        }

        // Calculate earnings and payments for each artist
        const artistPayouts = await Promise.all(
          artists.map(async (artist) => {
            // Get contributions (exclude ads)
            const { data: allContributions } = await supabase
              .from('track_contributors')
              .select(`
                track_id, 
                split_percentage,
                mvp_content!inner(is_ad)
              `)
              .eq('artist_id', artist.id);

            // Filter out ad tracks
            const contributions = (allContributions || []).filter(c => !c.mvp_content?.is_ad);

            const trackIds = contributions?.map(c => c.track_id) || [];
            const splitsByTrack = contributions?.reduce((acc, c) => {
              acc[c.track_id] = c.split_percentage || 0;
              return acc;
            }, {}) || {};

            if (trackIds.length === 0) {
              return {
                artistId: artist.id,
                artistName: artist.name,
                totalEarned: 0,
                totalPaid: 0,
                pendingPayout: 0,
                streamsCount: 0
              };
            }

            // Get streams
            const { data: events } = await supabase
              .from('analytics_events')
              .select('track_id')
              .eq('event_type', 'play_end')
              .gte('duration_seconds', 30)
              .in('track_id', trackIds);

            // Calculate earnings
            let totalEarned = 0;
            (events || []).forEach(event => {
              const artistSplit = splitsByTrack[event.track_id] || 0;
              const streamRevenue = 0.001 * 0.70;
              const artistShare = (streamRevenue * artistSplit) / 100;
              totalEarned += artistShare;
            });

            // Get payments
            const { data: payments } = await supabase
              .from('artist_payments')
              .select('amount_kwacha, status')
              .eq('artist_id', artist.id);

            const totalPaid = (payments || [])
              .filter(p => p.status === 'completed')
              .reduce((sum, p) => sum + parseFloat(p.amount_kwacha), 0);

            return {
              artistId: artist.id,
              artistName: artist.name,
              totalEarned: parseFloat(totalEarned.toFixed(6)),
              totalPaid: parseFloat(totalPaid.toFixed(6)),
              pendingPayout: parseFloat((totalEarned - totalPaid).toFixed(6)),
              streamsCount: events?.length || 0
            };
          })
        );

        // Filter to only show artists with pending payouts > 0
        const withPending = artistPayouts
          .filter(a => a.pendingPayout > 0)
          .sort((a, b) => b.pendingPayout - a.pendingPayout);

        setData(withPending);
      } catch (err) {
        console.error('Error fetching pending payouts:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPendingPayouts();
  }, []);

  return { data, loading, error };
};

/**
 * Function to create a payment record
 */
export const createPayment = async (paymentData) => {
  const { data, error } = await supabase
    .from('artist_payments')
    .insert({
      artist_id: paymentData.artistId,
      payment_date: paymentData.paymentDate,
      period_start: paymentData.periodStart,
      period_end: paymentData.periodEnd,
      amount_kwacha: paymentData.amount,
      streams_count: paymentData.streamsCount,
      payment_method: paymentData.paymentMethod,
      payment_reference: paymentData.paymentReference,
      status: paymentData.status || 'pending',
      notes: paymentData.notes,
      created_by: paymentData.createdBy || 'admin'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Function to update payment status
 */
export const updatePaymentStatus = async (paymentId, status, paymentReference = null, notes = null) => {
  const updateData = { status };
  if (paymentReference) updateData.payment_reference = paymentReference;
  if (notes) updateData.notes = notes;

  const { data, error } = await supabase
    .from('artist_payments')
    .update(updateData)
    .eq('id', paymentId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Hook to get tracks with missing splits
 * Returns list of tracks that have streams but no splits set
 */
export const useTracksWithMissingSplits = (artistId, isAdmin) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMissingSplits = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!isAdmin && !artistId) {
          setData([]);
          return;
        }

        // Get tracks with contributors that have NULL splits (exclude ads)
        let query = supabase
          .from('track_contributors')
          .select(`
            track_id,
            role,
            split_percentage,
            artists (name),
            mvp_content!inner (
              id,
              title,
              is_ad
            )
          `)
          .is('split_percentage', null);

        // Filter by artist if not admin
        if (!isAdmin && artistId) {
          query = query.eq('artist_id', artistId);
        }

        const { data: contributions } = await query;

        // Filter out ads
        const nonAdContributions = (contributions || []).filter(c => !c.mvp_content?.is_ad);

        if (nonAdContributions.length === 0) {
          setData([]);
          return;
        }

        // Get track IDs
        const trackIds = [...new Set(nonAdContributions.map(c => c.track_id))];

        // Check which tracks have streams
        const { data: events } = await supabase
          .from('analytics_events')
          .select('track_id')
          .eq('event_type', 'play_end')
          .gte('duration_seconds', 30)
          .in('track_id', trackIds);

        const tracksWithStreams = new Set((events || []).map(e => e.track_id));

        // Group by track and only include tracks with streams
        const trackMap = {};
        nonAdContributions.forEach(contrib => {
          if (!tracksWithStreams.has(contrib.track_id)) return;

          if (!trackMap[contrib.track_id]) {
            trackMap[contrib.track_id] = {
              trackId: contrib.track_id,
              trackTitle: contrib.mvp_content.title,
              contributors: []
            };
          }
          trackMap[contrib.track_id].contributors.push({
            name: contrib.artists.name,
            role: contrib.role
          });
        });

        setData(Object.values(trackMap));
      } catch (err) {
        console.error('Error fetching tracks with missing splits:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMissingSplits();
  }, [artistId, isAdmin]);

  return { data, loading, error };
};
