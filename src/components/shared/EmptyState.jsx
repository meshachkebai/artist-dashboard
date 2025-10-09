import React from 'react';
import './EmptyState.css';

const EmptyState = ({ title, message }) => {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
};

export default EmptyState;
