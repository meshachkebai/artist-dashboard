import React, { useState } from 'react';
import { useEarnings } from '../hooks/useAnalytics';
import { useEarningsByRole } from '../hooks/useEarningsByRole';
import StatCard from '../components/shared/StatCard';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import './EarningsPage.css';

const EarningsPage = ({ artistName, artistId, isAdmin }) => {
  const [dateRange, setDateRange] = useState(30);
  const { data: earnings, loading } = useEarnings(artistId, isAdmin, dateRange);
  const { data: earningsByRole, loading: roleLoading } = useEarningsByRole(!isAdmin ? artistId : null, dateRange);

  return (
    <div className="earnings-page">
      <div className="page-header">
        <div>
          <h1>Earnings</h1>
          <p className="page-subtitle">
            {isAdmin ? 'Platform revenue and artist payouts' : 'Track your earnings and payments'}
          </p>
        </div>
        <div className="date-range-selector">
          <button
            className={dateRange === 7 ? 'active' : ''}
            onClick={() => setDateRange(7)}
          >
            7 Days
          </button>
          <button
            className={dateRange === 30 ? 'active' : ''}
            onClick={() => setDateRange(30)}
          >
            30 Days
          </button>
          <button
            className={dateRange === 90 ? 'active' : ''}
            onClick={() => setDateRange(90)}
          >
            90 Days
          </button>
        </div>
      </div>

      <div className="earnings-summary">
        {isAdmin ? (
          <>
            <StatCard
              label="Total Revenue Generated"
              value={`K${earnings?.totalRevenue || '0.00'}`}
              change={`Last ${dateRange} days`}
              loading={loading}
            />
            <StatCard
              label="Artist Payouts (70%)"
              value={`K${earnings?.artistShare || '0.00'}`}
              change={`Last ${dateRange} days`}
              loading={loading}
            />
            <StatCard
              label="Platform Revenue (30%)"
              value={`K${earnings?.platformFee || '0.00'}`}
              change={`Last ${dateRange} days`}
              loading={loading}
            />
          </>
        ) : (
          <>
            <StatCard
              label="Your Earnings"
              value={`K${earnings?.myTotalEarnings || '0.000000'}`}
              change={`Last ${dateRange} days`}
              loading={loading}
            />
            <StatCard
              label="Total Streams"
              value={earnings?.byTrack?.reduce((sum, track) => sum + track.streams, 0).toLocaleString() || '0'}
              change={`Last ${dateRange} days`}
              loading={loading}
            />
          </>
        )}
      </div>

      {!isAdmin && earningsByRole && earningsByRole.byRole && earningsByRole.byRole.length > 0 && (
        <div className="revenue-breakdown">
          <h2>Earnings by Role</h2>
          <div className="revenue-list">
            {earningsByRole.byRole.map((role, index) => (
              <div key={index} className="revenue-item">
                <div className="revenue-rank">{index + 1}</div>
                <div className="revenue-track">
                  <div className="track-title" style={{ textTransform: 'capitalize' }}>{role.role}</div>
                  <div className="track-streams">{role.streams.toLocaleString()} streams • {role.trackCount} track{role.trackCount !== 1 ? 's' : ''}</div>
                </div>
                <div className="revenue-amounts">
                  <div className="revenue-total">
                    <span className="amount-label">Track Total</span>
                    <span className="amount-value">K{role.trackTotal}</span>
                  </div>
                  <div className="revenue-artist">
                    <span className="amount-label">Your Earnings</span>
                    <span className="amount-value">K{role.earnings}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="revenue-breakdown">
        <h2>Revenue by Track</h2>
        {loading ? (
          <LoadingSpinner message="Loading earnings data..." />
        ) : earnings && earnings.byTrack && earnings.byTrack.length > 0 ? (
          <div className="revenue-list">
            {earnings.byTrack.map((track, index) => (
              <div key={index}>
                <div className="revenue-item">
                  <div className="revenue-rank">{index + 1}</div>
                  <div className="revenue-track">
                    <div className="track-title">{track.trackTitle}</div>
                    <div className="track-streams">
                      {track.streams.toLocaleString()} streams
                      {!isAdmin && track.mySplit && (
                        <span style={{ 
                          marginLeft: '0.5rem',
                          color: 'var(--success, #28a745)',
                          fontWeight: '600',
                          fontSize: '0.875rem'
                        }}>
                          • Your Split: {track.mySplit}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="revenue-amounts">
                    {isAdmin ? (
                      <>
                        <div className="revenue-total">
                          <span className="amount-label">Total</span>
                          <span className="amount-value">K{track.revenue}</span>
                        </div>
                        <div className="revenue-artist">
                          <span className="amount-label">Artist</span>
                          <span className="amount-value">K{track.artistShare}</span>
                        </div>
                        <div className="revenue-platform">
                          <span className="amount-label">Platform</span>
                          <span className="amount-value">K{(track.revenue * 0.30).toFixed(6)}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="revenue-total">
                          <span className="amount-label">Track Total</span>
                          <span className="amount-value">K{track.artistShare}</span>
                        </div>
                        <div className="revenue-artist">
                          <span className="amount-label">Your Earnings</span>
                          <span className="amount-value">K{track.myEarnings}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Admin: Show contributor splits breakdown */}
                {isAdmin && track.contributors && track.contributors.length > 0 && (
                  <div style={{
                    marginLeft: '3rem',
                    marginTop: '0.5rem',
                    marginBottom: '1rem',
                    padding: '1rem',
                    background: 'var(--bg-secondary, #f9f9f9)',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}>
                    <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Split Breakdown:</strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {track.contributors.map((contrib, idx) => (
                        <div key={idx} style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          padding: '0.5rem',
                          background: 'var(--bg-primary, #fff)',
                          borderRadius: '4px'
                        }}>
                          <span style={{ textTransform: 'capitalize' }}>
                            {contrib.name} ({contrib.role})
                          </span>
                          <span style={{ 
                            fontWeight: '600',
                            color: contrib.split ? 'var(--success, #28a745)' : 'var(--danger, #dc3545)'
                          }}>
                            {contrib.split ? `${contrib.split}% = K${contrib.earnings}` : 'No split set'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No Earnings Data"
            message="Revenue data will appear here once you have streams."
          />
        )}
      </div>

      <div className="earnings-info">
        <h3>How Earnings Work</h3>
        <p>
          {isAdmin 
            ? 'Revenue is generated at K0.001 per qualified stream (30+ seconds). Artists receive 70% of revenue, while 30% is retained as platform fees.'
            : 'You earn based on qualified streams (30+ seconds). Earnings are calculated per stream and accumulated over time.'
          }
        </p>
        <p>
          {isAdmin
            ? 'Artist payments are processed monthly once they reach the minimum payout threshold of TBC.'
            : 'Payments are processed monthly once you reach the minimum payout threshold of TBC.'
          }
        </p>
        <p className="earnings-disclaimer">
          <strong>Note:</strong> {isAdmin 
            ? 'Revenue rates, payout thresholds, and fee structures are subject to change without prior notice.'
            : 'Earnings rates and payout thresholds are subject to change without prior notice.'
          } Current rates are effective as of the date displayed and may be adjusted based on platform operational requirements.
        </p>
      </div>
    </div>
  );
};

export default EarningsPage;
