import React, { useState } from 'react';
import { useDemographics } from '../hooks/useAnalytics';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import './AudiencePage.css';

const COLORS = ['#A14189', '#D4669A', '#E88BAB', '#F5B0BC', '#FFD5CD'];

const AudiencePage = ({ artistName, artistId, isAdmin }) => {
    const [dateRange, setDateRange] = useState(30);
    const { data: demographics, loading } = useDemographics(artistId, isAdmin, dateRange);

    const hasData = demographics && (demographics.gender.length > 0 || demographics.ageRange.length > 0);

    return (
        <div className="audience-page">
            <div className="page-header">
                <div>
                    <h1>Audience</h1>
                    <p className="page-subtitle">
                        {isAdmin ? 'All platform listeners and demographics' : 'Understand your listeners'}
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

            {loading ? (
                <LoadingSpinner message="Loading audience data..." />
            ) : hasData ? (
                <div className="demographics-grid">
                    {demographics.gender.length > 0 && (
                        <div className="chart-card">
                            <h2>Gender Distribution</h2>
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={demographics.gender}
                                        dataKey="count"
                                        nameKey="gender"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={100}
                                        label={({ gender, percentage }) => `${gender}: ${percentage}%`}
                                    >
                                        {demographics.gender.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {demographics.ageRange.length > 0 && (
                        <div className="chart-card">
                            <h2>Age Distribution</h2>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={demographics.ageRange}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                                    <XAxis dataKey="range" stroke="#666" />
                                    <YAxis stroke="#666" />
                                    <Tooltip
                                        contentStyle={{
                                            background: 'var(--card-bg)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px'
                                        }}
                                    />
                                    <Bar dataKey="count" fill="#A14189" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                            <div className="age-stats">
                                {demographics.ageRange.map((age, index) => (
                                    <div key={index} className="age-stat">
                                        <div className="age-range">{age.range}</div>
                                        <div className="age-percentage">{age.percentage}%</div>
                                        <div className="age-count">{age.count} listeners</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <EmptyState
                    title="No Audience Data"
                    message="Audience demographics will appear here once listeners start streaming your music."
                />
            )}
        </div>
    );
};

export default AudiencePage;
