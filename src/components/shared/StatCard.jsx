import React from 'react';
import './StatCard.css';

const StatCard = ({ label, value, change, loading }) => {
  if (loading) {
    return (
      <div className="stat-card loading">
        <div className="skeleton skeleton-text"></div>
        <div className="skeleton skeleton-value"></div>
        <div className="skeleton skeleton-text"></div>
      </div>
    );
  }

  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {change && <div className="stat-change">{change}</div>}
    </div>
  );
};

export default StatCard;
