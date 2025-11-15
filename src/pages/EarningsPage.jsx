import React, { useState } from 'react';
import { useEarnings } from '../hooks/useAnalytics';
import { useEarningsByRole } from '../hooks/useEarningsByRole';
import { usePaymentSummary, usePlatformPaymentSummary, useTracksWithMissingSplits } from '../hooks/usePayments';
import { useUnifiedAnalytics } from '../hooks/useUnifiedAnalytics';
import StatCard from '../components/shared/StatCard';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import './EarningsPage.css';

const EarningsPage = ({ artistName, artistId, isAdmin }) => {
  const [dateRange, setDateRange] = useState(30);
  const { data: periodStats, loading: periodLoading } = useUnifiedAnalytics(artistId, isAdmin, dateRange);
  const { data: earnings, loading } = useEarnings(artistId, isAdmin, dateRange);
  const { data: earningsByRole, loading: roleLoading } = useEarningsByRole(!isAdmin ? artistId : null, dateRange);
  const { data: paymentSummary, loading: paymentLoading } = usePaymentSummary(artistId);
  const { data: platformPaymentSummary, loading: platformPaymentLoading } = usePlatformPaymentSummary();
  const { data: missingSplits } = useTracksWithMissingSplits(artistId, isAdmin);

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

      {/* Payment Summary - Both Admin and Artist */}
      {isAdmin ? (
        <div className="payment-summary" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <StatCard
            label="Total Platform Earnings"
            value={`K${platformPaymentSummary?.totalRevenue || '0.000000'}`}
            change="All time"
            loading={platformPaymentLoading}
          />
          <StatCard
            label="Artist Share (70%)"
            value={`K${platformPaymentSummary?.totalArtistEarnings || '0.000000'}`}
            change="All time"
            loading={platformPaymentLoading}
          />
          <StatCard
            label="Total Paid to Artists"
            value={`K${platformPaymentSummary?.totalPaid || '0.000000'}`}
            change="All time"
            loading={platformPaymentLoading}
          />
          <StatCard
            label="Pending Payouts"
            value={`K${platformPaymentSummary?.pendingPayout || '0.000000'}`}
            change="Ready to pay"
            loading={platformPaymentLoading}
          />
        </div>
      ) : paymentSummary && (
        <div className="payment-summary" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <StatCard
            label="Total Earned"
            value={`K${paymentSummary.totalEarned}`}
            change="All time"
            loading={paymentLoading}
          />
          <StatCard
            label="Total Paid"
            value={`K${paymentSummary.totalPaid}`}
            change="All time"
            loading={paymentLoading}
          />
          <StatCard
            label="Pending Payout"
            value={`K${paymentSummary.pendingPayout}`}
            change="Ready to pay"
            loading={paymentLoading}
          />
        </div>
      )}

      <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
        {isAdmin ? 'Period Revenue' : 'Period Earnings'}
      </h2>

      <div className="earnings-summary">
        {isAdmin ? (
          <>
            <StatCard
              label="Total Revenue Generated"
              value={`K${periodStats?.totalRevenue?.toFixed(6) || '0.000000'}`}
              change={`Last ${dateRange} days`}
              loading={periodLoading}
            />
            <StatCard
              label="Artist Payouts (70%)"
              value={`K${periodStats?.artistShare?.toFixed(6) || '0.000000'}`}
              change={`Last ${dateRange} days`}
              loading={periodLoading}
            />
            <StatCard
              label="Platform Revenue (30%)"
              value={`K${periodStats?.platformFee?.toFixed(6) || '0.000000'}`}
              change={`Last ${dateRange} days`}
              loading={periodLoading}
            />
          </>
        ) : (
          <>
            <StatCard
              label="Period Earnings"
              value={`K${earnings?.myTotalEarnings || '0.000000'}`}
              change={`Last ${dateRange} days`}
              loading={loading}
            />
            <StatCard
              label="Period Streams"
              value={earnings?.byTrack?.reduce((sum, track) => sum + track.streams, 0).toLocaleString() || '0'}
              change={`Last ${dateRange} days`}
              loading={loading}
            />
          </>
        )}
      </div>

      {/* Missing Splits Warning */}
      {missingSplits && missingSplits.length > 0 && (
        <div style={{
          background: 'var(--warning-bg, #fff3cd)',
          border: '2px solid var(--warning, #ffc107)',
          borderRadius: '8px',
          padding: '1.5rem',
          marginTop: '2rem'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', color: 'var(--warning-dark, #856404)' }}>
            ⚠️ {missingSplits.length} Track{missingSplits.length > 1 ? 's' : ''} with Missing Splits
          </h3>
          <p style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
            These tracks have streams but no revenue splits set. {isAdmin ? 'Artists' : 'You'} won't earn money until splits are configured.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {missingSplits.map((track, index) => (
              <div key={track.trackId} style={{
                background: 'var(--bg-primary, #fff)',
                padding: '1rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #e0e0e0)'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                  {track.trackTitle}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Contributors: {track.contributors.map(c => `${c.name} (${c.role})`).join(', ')}
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--brand-primary)' }}>
                  → Go to {isAdmin ? 'All Tracks' : 'My Tracks'} and edit this track to set revenue splits
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Payment History - Artist View Only */}
      {!isAdmin && paymentSummary && paymentSummary.paymentHistory.length > 0 && (
        <div className="payment-history" style={{ marginTop: '2rem' }}>
          <h2>Payment History</h2>
          <div className="revenue-list">
            {paymentSummary.paymentHistory.map((payment, index) => (
              <div key={payment.id || index} className="revenue-item" style={{
                opacity: payment.status === 'completed' ? 1 : 0.7
              }}>
                <div className="revenue-rank">{index + 1}</div>
                <div className="revenue-track">
                  <div className="track-title">
                    {new Date(payment.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    {payment.period_start !== payment.period_end && 
                      ` - ${new Date(payment.period_end).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                    }
                  </div>
                  <div className="track-streams">
                    {payment.streams_count.toLocaleString()} streams
                    {payment.payment_method && ` • ${payment.payment_method.replace('_', ' ')}`}
                    {payment.payment_reference && (
                      <span style={{ 
                        marginLeft: '0.5rem',
                        fontSize: '0.75rem',
                        opacity: 0.7
                      }}>
                        Ref: {payment.payment_reference}
                      </span>
                    )}
                  </div>
                </div>
                <div className="revenue-amounts">
                  <div className="revenue-total">
                    <span className="amount-label">
                      {payment.status === 'completed' ? 'Paid' : payment.status === 'processing' ? 'Processing' : 'Pending'}
                    </span>
                    <span className="amount-value" style={{
                      color: payment.status === 'completed' ? 'var(--success, #28a745)' : 
                             payment.status === 'failed' ? 'var(--danger, #dc3545)' : 
                             'var(--text-secondary)'
                    }}>
                      K{parseFloat(payment.amount_kwacha).toFixed(6)}
                    </span>
                  </div>
                  {payment.status === 'completed' && payment.payment_date && (
                    <div className="revenue-artist">
                      <span className="amount-label">Date</span>
                      <span className="amount-value">
                        {new Date(payment.payment_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
