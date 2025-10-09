import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from '../ThemeToggle.jsx';
import './DashboardLayout.css';

const DashboardLayout = ({ artistName, isAdmin, logout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="dashboard-layout">
      <header className="dashboard-header">
        <div className="header-left">
          <button className="hamburger-menu" onClick={toggleSidebar} aria-label="Toggle menu">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div className="header-branding">
            <h1 className="brand-name">pairap</h1>
            <span className="brand-subtitle">Artists Dashboard</span>
          </div>
        </div>
        
        <div className="header-right">
          <ThemeToggle />
          <div className="user-info">
            <div className="user-role">{isAdmin ? 'Admin' : 'Artist'}</div>
            <div className="user-name">{artistName}</div>
          </div>
          <button onClick={logout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      <Sidebar isAdmin={isAdmin} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="dashboard-main">
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
