import React from 'react';
import { usePlatformStats } from '../hooks/useAnalytics';
import { useSplitAnalytics } from '../hooks/useSplitAnalytics';
import StatCard from '../components/shared/StatCard';
import './PlatformStatsPage.css';

const PlatformStatsPage = () => {
  const { data: stats, loading } = usePlatformStats();
  const { data: splitData, loading: splitLoading } = useSplitAnalytics();

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

      {/* Split Analytics Section */}
      {splitData && (
        <div className="split-analytics-section" style={{ marginTop: '2rem' }}>
          <h2>Revenue Split Analytics</h2>
          
          <div className="stats-grid" style={{ marginTop: '1rem' }}>
            <StatCard
              label="Split Coverage"
              value={`${splitData.splitCoverage}%`}
              change={`${splitData.totalWithSplits} of ${splitData.totalWithSplits + splitData.totalWithoutSplits} contributors`}
              loading={splitLoading}
            />
            <StatCard
              label="Contributors with Splits"
              value={splitData.totalWithSplits}
              change="Have defined splits"
              loading={splitLoading}
            />
            <StatCard
              label="Missing Splits"
              value={splitData.totalWithoutSplits}
              change="Need split definition"
              loading={splitLoading}
            />
          </div>

          <div style={{ 
            marginTop: '2rem',
            padding: '1.5rem',
            background: 'var(--bg-secondary, #f9f9f9)',
            borderRadius: '8px'
          }}>
            <h3 style={{ marginTop: 0 }}>Average Split by Role</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              {splitData.averageSplitsByRole.map((role, index) => (
                <div key={index} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  background: 'var(--bg-primary, #fff)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #e0e0e0)'
                }}>
                  <div>
                    <div style={{ 
                      fontWeight: '600',
                      textTransform: 'capitalize',
                      fontSize: '1rem'
                    }}>
                      {role.role}
                    </div>
                    <div style={{ 
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      marginTop: '0.25rem'
                    }}>
                      {role.count} contributor{role.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    color: 'var(--brand-primary, #A14189)'
                  }}>
                    {role.averageSplit}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="info-message">
        <h3>Platform Insights</h3>
        <p>
          These statistics represent the overall health and activity of your platform. 
          Monitor artist engagement, content growth, revenue trends, and split distribution to make informed decisions.
        </p>
      </div>
    </div>
  );
};

export default PlatformStatsPage;
