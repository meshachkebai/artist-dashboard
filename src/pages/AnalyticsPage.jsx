import React, { useState } from 'react';
import { useStreamTimeline, useTopTracks } from '../hooks/useAnalytics';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import './AnalyticsPage.css';

const AnalyticsPage = ({ artistName, artistId, isAdmin }) => {
  const [dateRange, setDateRange] = useState(30);
  const { data: timeline, loading: timelineLoading } = useStreamTimeline(artistId, isAdmin, dateRange);
  const { data: topTracks, loading: tracksLoading } = useTopTracks(artistId, isAdmin, dateRange, 10);

  return (
    <div className="analytics-page">
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <p className="page-subtitle">
            {isAdmin ? 'Platform-wide performance metrics' : 'Your track performance and trends'}
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

      <div className="chart-section">
        <h2>Stream Timeline</h2>
        {timelineLoading ? (
          <LoadingSpinner message="Loading timeline..." />
        ) : timeline && timeline.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis
                dataKey="date"
                tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                stroke="#666"
              />
              <YAxis stroke="#666" />
              <Tooltip
                labelFormatter={(date) => new Date(date).toLocaleDateString()}
                contentStyle={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px'
                }}
              />
              <Line
                type="monotone"
                dataKey="streams"
                stroke="#A14189"
                strokeWidth={2}
                dot={{ fill: '#A14189', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            title="No Stream Data"
            message="Stream data will appear here once you have listener activity."
          />
        )}
      </div>

      <div className="top-tracks-section">
        <h2>Top 10 Tracks</h2>
        {tracksLoading ? (
          <LoadingSpinner message="Loading tracks..." />
        ) : topTracks && topTracks.length > 0 ? (
          <div className="tracks-table">
            <div className="table-header">
              <div className="col-rank">#</div>
              <div className="col-track">Track</div>
              <div className="col-streams">Streams</div>
              <div className="col-listeners">Listeners</div>
              <div className="col-duration">Avg Duration</div>
            </div>
            {topTracks.map((track, index) => (
              <div key={index} className="table-row">
                <div className="col-rank">{index + 1}</div>
                <div className="col-track">
                  <div className="track-title">{track.trackTitle}</div>
                  <div className="track-artist">{track.artistName}</div>
                </div>
                <div className="col-streams">{track.streams.toLocaleString()}</div>
                <div className="col-listeners">{track.uniqueListeners.toLocaleString()}</div>
                <div className="col-duration">{Math.floor(track.avgDuration / 60)}:{(track.avgDuration % 60).toString().padStart(2, '0')}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No Track Data"
            message="Your top tracks will appear here once you have streams."
          />
        )}
      </div>
    </div>
  );
};

export default AnalyticsPage;
