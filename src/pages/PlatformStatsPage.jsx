import React from 'react';
import { usePlatformStats } from '../hooks/useAnalytics';
import StatCard from '../components/shared/StatCard';
import './PlatformStatsPage.css';

const PlatformStatsPage = () => {
  const { data: stats, loading } = usePlatformStats();

  return (
    <div className="platform-stats-page">
      <div className="page-header">
        <h1>Platform Statistics</h1>
        <p className="page-subtitle">Admin-only platform insights</p>
      </div>

      <div className="stats-grid">
        <StatCard
          label="Total Artists"
          value={stats?.totalArtists || 0}
          change="All time"
          loading={loading}
        />
        <StatCard
          label="Total Tracks"
          value={stats?.totalTracks || 0}
          change="All time"
          loading={loading}
        />
        <StatCard
          label="Platform Streams"
          value={stats?.totalStreams || 0}
          change="All time"
          loading={loading}
        />
        <StatCard
          label="Total Revenue"
          value={`K${stats?.totalRevenue || '0.00'}`}
          change="All time"
          loading={loading}
        />
      </div>

      <div className="info-message">
        <h3>Platform Insights</h3>
        <p>
          These statistics represent the overall health and activity of your platform. 
          Monitor artist engagement, content growth, and revenue trends to make informed decisions.
        </p>
      </div>
    </div>
  );
};

export default PlatformStatsPage;
