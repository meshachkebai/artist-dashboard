import React from 'react';
import { useOverviewStats, useTopTracks, useArtistUploadStats } from '../hooks/useAnalytics';
import StatCard from '../components/shared/StatCard';
import EmptyState from '../components/shared/EmptyState';
import './OverviewPage.css';

const OverviewPage = ({ artistName, isAdmin }) => {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [trackLimit, setTrackLimit] = React.useState(10);
  const { data: stats, loading: statsLoading } = useOverviewStats(artistName, isAdmin, 30, refreshKey);
  const { data: topTracks, loading: tracksLoading } = useTopTracks(artistName, isAdmin, 30, trackLimit, refreshKey);
  const { data: uploadStats, loading: uploadStatsLoading } = useArtistUploadStats(!isAdmin ? artistName : null);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
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
        <button onClick={handleRefresh} className="refresh-btn" disabled={statsLoading || tracksLoading}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          Refresh
        </button>
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
          value={stats?.totalTracks || 0}
          change="Last 30 days"
          loading={statsLoading}
        />
        <StatCard
          label={isAdmin ? 'Estimated Earnings' : 'Your Earnings'}
          value={`K${stats?.estimatedRevenue || '0.00'}`}
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
