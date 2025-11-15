import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = ({ isAdmin, isOpen, onClose }) => {
  const navItems = [
    { path: '/dashboard', label: 'Overview', adminOnly: false },
    { path: '/dashboard/tracks', label: isAdmin ? 'All Tracks' : 'My Tracks', adminOnly: false },
    { path: '/dashboard/analytics', label: 'Analytics', adminOnly: false },
    { path: '/dashboard/audience', label: 'Audience', adminOnly: false },
    { path: '/dashboard/geographic', label: 'Geographic', adminOnly: false },
    { path: '/dashboard/earnings', label: 'Earnings', adminOnly: false },
    { path: '/dashboard/payments', label: 'Payments', adminOnly: true },
    { path: '/dashboard/platform', label: 'Platform Stats', adminOnly: true },
  ];

  const filteredItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <nav className="sidebar-nav">
          {filteredItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
              end={item.path === '/dashboard'}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
