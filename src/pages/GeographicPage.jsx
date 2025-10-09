import React, { useState } from 'react';
import { useGeographic } from '../hooks/useAnalytics';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import './GeographicPage.css';

const GeographicPage = ({ artistName, isAdmin }) => {
  const [dateRange, setDateRange] = useState(30);
  const { data: locations, loading } = useGeographic(artistName, isAdmin, dateRange);

  return (
    <div className="geographic-page">
      <div className="page-header">
        <div>
          <h1>Geographic</h1>
          <p className="page-subtitle">Where your fans are located</p>
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

      <div className="locations-card">
        <h2>Top Locations</h2>
        {loading ? (
          <LoadingSpinner message="Loading location data..." />
        ) : locations && locations.length > 0 ? (
          <div className="locations-list">
            {locations.map((location, index) => (
              <div key={index} className="location-item">
                <div className="location-rank">{index + 1}</div>
                <div className="location-info">
                  <div className="location-city">{location.city}</div>
                  <div className="location-province">{location.province}</div>
                </div>
                <div className="location-listeners">
                  <span className="location-value">{location.listeners.toLocaleString()}</span>
                  <span className="location-label">Listeners</span>
                </div>
                <div className="location-streams">
                  <span className="location-value">{location.streams.toLocaleString()}</span>
                  <span className="location-label">Streams</span>
                </div>
                <div className="location-percentage">
                  <span className="percentage-value">{location.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No Location Data"
            message="Geographic data will appear here once you have listeners with location information."
          />
        )}
      </div>
    </div>
  );
};

export default GeographicPage;
