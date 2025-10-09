import React from 'react';
import './PlaceholderPage.css';

const PlaceholderPage = ({ title, description }) => {
  return (
    <div className="placeholder-page">
      <div className="placeholder-content">
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="coming-soon-badge">Coming Soon</div>
      </div>
    </div>
  );
};

export default PlaceholderPage;
