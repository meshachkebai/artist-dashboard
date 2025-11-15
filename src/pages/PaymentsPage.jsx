import React, { useState } from 'react';
import { usePendingPayouts, createPayment } from '../hooks/usePayments';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import './PaymentsPage.css';

const PaymentsPage = () => {
  const { data: pendingPayouts, loading, error } = usePendingPayouts();
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    periodStart: '',
    periodEnd: '',
    paymentMethod: 'mobile_money',
    paymentReference: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleMarkAsPaid = (artist) => {
    // Pre-fill form with artist data
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    setSelectedArtist(artist);
    setPaymentForm({
      paymentDate: today.toISOString().split('T')[0],
      periodStart: lastMonth.toISOString().split('T')[0],
      periodEnd: lastMonthEnd.toISOString().split('T')[0],
      paymentMethod: 'mobile_money',
      paymentReference: '',
      notes: ''
    });
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    
    if (!selectedArtist) return;

    try {
      setSubmitting(true);

      await createPayment({
        artistId: selectedArtist.artistId,
        paymentDate: paymentForm.paymentDate,
        periodStart: paymentForm.periodStart,
        periodEnd: paymentForm.periodEnd,
        amount: selectedArtist.pendingPayout,
        streamsCount: selectedArtist.streamsCount,
        paymentMethod: paymentForm.paymentMethod,
        paymentReference: paymentForm.paymentReference,
        status: 'completed',
        notes: paymentForm.notes,
        createdBy: 'admin'
      });

      alert(`Payment of K${selectedArtist.pendingPayout.toFixed(6)} recorded for ${selectedArtist.artistName}`);
      
      // Reset form
      setSelectedArtist(null);
      setPaymentForm({
        paymentDate: new Date().toISOString().split('T')[0],
        periodStart: '',
        periodEnd: '',
        paymentMethod: 'mobile_money',
        paymentReference: '',
        notes: ''
      });

      // Reload page to refresh data
      window.location.reload();
    } catch (error) {
      console.error('Failed to create payment:', error);
      alert(`Failed to record payment: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="payments-page">
      <div className="page-header">
        <div>
          <h1>Artist Payments</h1>
          <p className="page-subtitle">Manage artist payouts and payment history</p>
        </div>
      </div>

      {loading && <LoadingSpinner message="Loading pending payouts..." />}
      {error && <div className="error-message">Error: {error}</div>}

      {!loading && !error && (
        <>
          {pendingPayouts.length === 0 ? (
            <EmptyState
              title="No Pending Payouts"
              message="All artists have been paid up to date."
            />
          ) : (
            <div className="pending-payouts-section">
              <h2>Pending Payouts ({pendingPayouts.length})</h2>
              <div className="payouts-list">
                {pendingPayouts.map((artist) => (
                  <div key={artist.artistId} className="payout-item card">
                    <div className="payout-info">
                      <h3>{artist.artistName}</h3>
                      <div className="payout-stats">
                        <div className="stat">
                          <span className="stat-label">Total Earned</span>
                          <span className="stat-value">K{artist.totalEarned.toFixed(6)}</span>
                        </div>
                        <div className="stat">
                          <span className="stat-label">Total Paid</span>
                          <span className="stat-value">K{artist.totalPaid.toFixed(6)}</span>
                        </div>
                        <div className="stat pending">
                          <span className="stat-label">Pending Payout</span>
                          <span className="stat-value">K{artist.pendingPayout.toFixed(6)}</span>
                        </div>
                        <div className="stat">
                          <span className="stat-label">Streams</span>
                          <span className="stat-value">{artist.streamsCount.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="payout-actions">
                      <button
                        onClick={() => handleMarkAsPaid(artist)}
                        className="btn btn-primary"
                      >
                        Mark as Paid
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Form Modal */}
          {selectedArtist && (
            <div className="modal-overlay" onClick={() => setSelectedArtist(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Record Payment</h2>
                  <button
                    onClick={() => setSelectedArtist(null)}
                    className="modal-close"
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={handleSubmitPayment} className="payment-form">
                  <div className="form-group">
                    <label>Artist</label>
                    <input
                      type="text"
                      value={selectedArtist.artistName}
                      disabled
                      style={{ background: 'var(--bg-secondary)', cursor: 'not-allowed' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>Amount</label>
                    <input
                      type="text"
                      value={`K${selectedArtist.pendingPayout.toFixed(6)}`}
                      disabled
                      style={{ background: 'var(--bg-secondary)', cursor: 'not-allowed' }}
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Period Start *</label>
                      <input
                        type="date"
                        value={paymentForm.periodStart}
                        onChange={(e) => setPaymentForm({ ...paymentForm, periodStart: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Period End *</label>
                      <input
                        type="date"
                        value={paymentForm.periodEnd}
                        onChange={(e) => setPaymentForm({ ...paymentForm, periodEnd: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Payment Date *</label>
                    <input
                      type="date"
                      value={paymentForm.paymentDate}
                      onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Payment Method *</label>
                    <select
                      value={paymentForm.paymentMethod}
                      onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                      required
                    >
                      <option value="mobile_money">Mobile Money</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="cash">Cash</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Payment Reference *</label>
                    <input
                      type="text"
                      value={paymentForm.paymentReference}
                      onChange={(e) => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })}
                      placeholder="e.g., MM-2025-11-08-001"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Notes</label>
                    <textarea
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                      placeholder="Additional notes (optional)"
                      rows="3"
                    />
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      onClick={() => setSelectedArtist(null)}
                      className="btn btn-secondary"
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={submitting}
                    >
                      {submitting ? 'Recording...' : 'Record Payment'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PaymentsPage;
