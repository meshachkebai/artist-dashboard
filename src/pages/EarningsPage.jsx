import React, { useState } from 'react';
import { useEarnings } from '../hooks/useAnalytics';
import StatCard from '../components/shared/StatCard';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import './EarningsPage.css';

const EarningsPage = ({ artistName, isAdmin }) => {
  const [dateRange, setDateRange] = useState(30);
  const { data: earnings, loading } = useEarnings(artistName, isAdmin, dateRange);

  return (
    <div className="earnings-page">
      <div className="page-header">
        <div>
          <h1>Earnings</h1>
          <p className="page-subtitle">Track your revenue and payments</p>
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
        <StatCard
          label="Total Revenue"
          value={`K${earnings?.totalRevenue || '0.00'}`}
          change={`Last ${dateRange} days`}
          loading={loading}
        />
        <StatCard
          label="Your Share (70%)"
          value={`K${earnings?.artistShare || '0.00'}`}
          change={`Last ${dateRange} days`}
          loading={loading}
        />
        <StatCard
          label="Platform Fee (30%)"
          value={`K${earnings?.platformFee || '0.00'}`}
          change={`Last ${dateRange} days`}
          loading={loading}
        />
      </div>

      <div className="revenue-breakdown">
        <h2>Revenue by Track</h2>
        {loading ? (
          <LoadingSpinner message="Loading earnings data..." />
        ) : earnings && earnings.byTrack && earnings.byTrack.length > 0 ? (
          <div className="revenue-list">
            {earnings.byTrack.map((track, index) => (
              <div key={index} className="revenue-item">
                <div className="revenue-rank">{index + 1}</div>
                <div className="revenue-track">
                  <div className="track-title">{track.trackTitle}</div>
                  <div className="track-streams">{track.streams.toLocaleString()} streams</div>
                </div>
                <div className="revenue-amounts">
                  <div className="revenue-total">
                    <span className="amount-label">Total</span>
                    <span className="amount-value">K{track.revenue}</span>
                  </div>
                  <div className="revenue-artist">
                    <span className="amount-label">Your Share</span>
                    <span className="amount-value">K{track.artistShare}</span>
                  </div>
                </div>
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
          You earn K0.01 per stream (for streams longer than 60 seconds). 
          Artists receive 70% of the revenue, while 30% goes to platform fees.
        </p>
        <p>
          Payments are processed monthly once you reach the minimum payout threshold of K50.
        </p>
      </div>
    </div>
  );
};

export default EarningsPage;
