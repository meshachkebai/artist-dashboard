import React from 'react';
import { useTopTracks, useArtistUploadStats } from '../hooks/useAnalytics';
import { useUnifiedAnalytics } from '../hooks/useUnifiedAnalytics';
import StatCard from '../components/shared/StatCard';
import EmptyState from '../components/shared/EmptyState';
import { createClient } from '@supabase/supabase-js';
import './OverviewPage.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const OverviewPage = ({ artistName, artistId, isAdmin }) => {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [trackLimit, setTrackLimit] = React.useState(10);
  const [exporting, setExporting] = React.useState(false);
  const { data: stats, loading: statsLoading } = useUnifiedAnalytics(artistId, isAdmin, 30);
  const { data: topTracks, loading: tracksLoading } = useTopTracks(artistId, isAdmin, 30, trackLimit, refreshKey);
  const { data: uploadStats, loading: uploadStatsLoading } = useArtistUploadStats(!isAdmin ? artistId : null);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleExport = async () => {
    try {
      setExporting(true);

      // Use artistId directly (already available from props)

      // Get all tracks (filtered by artist if not admin)
      let tracksQuery = supabase
        .from('mvp_content')
        .select('*')
        .neq('is_ad', true)
        .order('created_at', { ascending: false });

      if (!isAdmin && artistId) {
        const { data: contributions } = await supabase
          .from('track_contributors')
          .select('track_id')
          .eq('artist_id', artistId);
        
        const trackIds = contributions?.map(c => c.track_id) || [];
        if (trackIds.length === 0) {
          alert('No tracks found to export');
          return;
        }
        tracksQuery = tracksQuery.in('id', trackIds);
      }

      const { data: tracks } = await tracksQuery;

      if (!tracks || tracks.length === 0) {
        alert('No tracks found to export');
        return;
      }

      const trackIds = tracks.map(t => t.id);

      // Get contributors
      const { data: contributors } = await supabase
        .from('track_contributors')
        .select(`
          track_id,
          role,
          split_percentage,
          artists (name)
        `)
        .in('track_id', trackIds);

      // Get analytics events
      const { data: events } = await supabase
        .from('analytics_events')
        .select('track_id, event_type, duration_seconds, access_code_id')
        .in('track_id', trackIds);

      // Get user profiles for unique listeners
      const accessCodeIds = [...new Set(events?.map(e => e.access_code_id).filter(Boolean) || [])];
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('access_code_id, city')
        .in('access_code_id', accessCodeIds);

      const cityByAccessCode = (profiles || []).reduce((acc, p) => {
        acc[p.access_code_id] = p.city;
        return acc;
      }, {});

      // Calculate stats per track
      const statsByTrack = {};
      (events || []).forEach(event => {
        if (!statsByTrack[event.track_id]) {
          statsByTrack[event.track_id] = {
            plays: 0,
            streams: 0,
            uniqueListeners: new Set(),
            cities: {}
          };
        }

        if (event.event_type === 'play_start') {
          statsByTrack[event.track_id].plays++;
        }

        if (event.event_type === 'play_end' && event.duration_seconds >= 30) {
          statsByTrack[event.track_id].streams++;
          if (event.access_code_id) {
            statsByTrack[event.track_id].uniqueListeners.add(event.access_code_id);
            const city = cityByAccessCode[event.access_code_id];
            if (city) {
              statsByTrack[event.track_id].cities[city] = (statsByTrack[event.track_id].cities[city] || 0) + 1;
            }
          }
        }
      });

      // Group contributors by track
      const contributorsByTrack = (contributors || []).reduce((acc, c) => {
        if (!acc[c.track_id]) acc[c.track_id] = [];
        acc[c.track_id].push(c);
        return acc;
      }, {});

      // Build CSV
      const csvRows = [];
      
      if (isAdmin) {
        // Admin view: One row per track with separate columns for each contributor
        csvRows.push([
          'Track Title',
          'Artist',
          'Album',
          'Genre',
          'Duration (seconds)',
          'Upload Date',
          'Qualified Streams',
          'Unique Listeners',
          'Top City',
          'Top City Streams',
          'Total Track Earnings (K)',
          'Contributor 1 Name',
          'Contributor 1 Role',
          'Contributor 1 Split %',
          'Contributor 1 Earnings (K)',
          'Contributor 2 Name',
          'Contributor 2 Role',
          'Contributor 2 Split %',
          'Contributor 2 Earnings (K)',
          'Contributor 3 Name',
          'Contributor 3 Role',
          'Contributor 3 Split %',
          'Contributor 3 Earnings (K)',
          'Contributor 4 Name',
          'Contributor 4 Role',
          'Contributor 4 Split %',
          'Contributor 4 Earnings (K)',
          'Contributor 5 Name',
          'Contributor 5 Role',
          'Contributor 5 Split %',
          'Contributor 5 Earnings (K)'
        ].join(','));

        tracks.forEach(track => {
          const stats = statsByTrack[track.id] || { plays: 0, streams: 0, uniqueListeners: new Set(), cities: {} };
          const topCity = Object.entries(stats.cities).sort((a, b) => b[1] - a[1])[0];
          
          // Full precision earnings - no rounding
          const totalEarnings = (stats.streams * 0.001 * 0.70).toFixed(6);
          
          const trackContributors = contributorsByTrack[track.id] || [];
          
          // Build row with track data
          const row = [
            `"${track.title}"`,
            `"${track.artist}"`,
            `"${track.album || ''}"`,
            `"${track.genre || ''}"`,
            track.duration_seconds,
            new Date(track.created_at).toLocaleDateString(),
            stats.streams,
            stats.uniqueListeners.size,
            topCity ? `"${topCity[0]}"` : '',
            topCity ? topCity[1] : 0,
            totalEarnings
          ];

          // Add up to 5 contributors (expand columns as needed)
          for (let i = 0; i < 5; i++) {
            if (trackContributors[i]) {
              const contributor = trackContributors[i];
              const split = contributor.split_percentage || 0;
              
              // Full precision earnings - no rounding
              const earnings = split > 0 
                ? ((stats.streams * 0.001 * 0.70 * split) / 100).toFixed(6)
                : '0.000000';
              
              row.push(
                `"${contributor.artists.name}"`,
                contributor.role,
                split,
                earnings
              );
            } else {
              // Empty contributor slot
              row.push('', '', '', '');
            }
          }

          csvRows.push(row.join(','));
        });
      } else {
        // Artist view: Show personal data
        csvRows.push([
          'Track Title',
          'Artist',
          'Album',
          'Genre',
          'Duration (seconds)',
          'Upload Date',
          'Qualified Streams',
          'Unique Listeners',
          'Top City',
          'Top City Streams',
          'Total Earnings (K)',
          'Your Role',
          'Your Split (%)',
          'Your Earnings (K)',
          'All Contributors'
        ].join(','));

        tracks.forEach(track => {
          const stats = statsByTrack[track.id] || { plays: 0, streams: 0, uniqueListeners: new Set(), cities: {} };
          const topCity = Object.entries(stats.cities).sort((a, b) => b[1] - a[1])[0];
          
          // Full precision earnings - no rounding
          const totalEarnings = (stats.streams * 0.001 * 0.70).toFixed(6);
          
          const trackContributors = contributorsByTrack[track.id] || [];
          const myContribution = trackContributors.find(c => c.artists.name === artistName);
          const myRole = myContribution?.role || 'N/A';
          const mySplit = myContribution?.split_percentage || 0;
          
          // Full precision earnings - no rounding
          const myEarnings = mySplit > 0 
            ? ((stats.streams * 0.001 * 0.70 * mySplit) / 100).toFixed(6)
            : '0.000000';
          
          const allContributors = trackContributors
            .map(c => `${c.artists.name} (${c.role}${c.split_percentage ? ` ${c.split_percentage}%` : ''})`)
            .join('; ');

          csvRows.push([
            `"${track.title}"`,
            `"${track.artist}"`,
            `"${track.album || ''}"`,
            `"${track.genre || ''}"`,
            track.duration_seconds,
            new Date(track.created_at).toLocaleDateString(),
            stats.streams,
            stats.uniqueListeners.size,
            topCity ? `"${topCity[0]}"` : '',
            topCity ? topCity[1] : 0,
            totalEarnings,
            myRole,
            mySplit,
            myEarnings,
            `"${allContributors}"`
          ].join(','));
        });
      }

      // Download CSV
      const csv = csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pairap-export-${artistName || 'all'}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="overview-page">
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <p className="page-subtitle">
            {isAdmin ? 'Platform-wide statistics (Last 30 days)' : `Welcome back, ${artistName}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={handleExport} className="refresh-btn" disabled={exporting}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            {exporting ? 'Exporting...' : 'Export Data'}
          </button>
          <button onClick={handleRefresh} className="refresh-btn" disabled={statsLoading || tracksLoading}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          label="Total Streams"
          value={stats?.totalStreams || 0}
          change="Last 30 days"
          loading={statsLoading}
        />
        <StatCard
          label="Unique Listeners"
          value={stats?.uniqueListeners || 0}
          change="Last 30 days"
          loading={statsLoading}
        />
        <StatCard
          label={isAdmin ? 'Active Tracks' : 'Total Tracks'}
          value={stats?.uniqueTracks || 0}
          change="Last 30 days"
          loading={statsLoading}
        />
        <StatCard
          label={isAdmin ? 'Total Platform Revenue' : 'Your Earnings'}
          value={`K${stats?.totalRevenue?.toFixed(6) || '0.000000'}`}
          change="Last 30 days"
          loading={statsLoading}
        />
      </div>

      {!isAdmin && uploadStats && (
        <div className="artist-info-card">
          <div className="artist-info-item">
            <span className="info-label">Total Uploads</span>
            <span className="info-value">{uploadStats.totalUploads} tracks</span>
          </div>
          <div className="artist-info-item">
            <span className="info-label">Last Upload</span>
            <span className="info-value">{uploadStats.lastUpload}</span>
          </div>
          <div className="artist-info-item">
            <span className="info-label">Account Status</span>
            <span className="info-value status-active">Active</span>
          </div>
        </div>
      )}

      <div className="top-tracks-section">
        <div className="section-header">
          <h2>Top Tracks</h2>
          <select 
            value={trackLimit} 
            onChange={(e) => setTrackLimit(Number(e.target.value))}
            className="track-limit-select"
          >
            <option value={10}>Top 10</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
            <option value={9999}>All Tracks</option>
          </select>
        </div>
        {tracksLoading ? (
          <div className="tracks-loading">
            <div className="skeleton skeleton-track"></div>
            <div className="skeleton skeleton-track"></div>
            <div className="skeleton skeleton-track"></div>
          </div>
        ) : topTracks && topTracks.length > 0 ? (
          <div className="tracks-list">
            {topTracks.map((track, index) => (
              <div key={index} className="track-item">
                <div className="track-rank">{index + 1}</div>
                <div className="track-info">
                  <div className="track-title">{track.trackTitle}</div>
                  <div className="track-artist">{track.artistName}</div>
                </div>
                <div className="track-stats">
                  <div className="track-stat">
                    <span className="stat-value">{track.streams}</span>
                    <span className="stat-label">streams</span>
                  </div>
                  <div className="track-stat">
                    <span className="stat-value">{track.uniqueListeners}</span>
                    <span className="stat-label">listeners</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No Stream Data Yet"
            message="Start tracking streams to see your top performing tracks here."
          />
        )}
      </div>
    </div>
  );
};

export default OverviewPage;
