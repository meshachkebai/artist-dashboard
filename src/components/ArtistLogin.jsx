import React, { useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const ArtistLogin = ({ onLogin }) => {
  const [artistName, setArtistName] = useState('');
  const [code, setCode] = useState(['', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attemptCount, setAttemptCount] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null);
  const inputRefs = useRef([]);

  // Check if currently locked out
  const isLockedOut = lockoutUntil && new Date() < lockoutUntil;

  const handleCodeChange = (value, index) => {
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 4) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newCode.every(digit => digit !== '') && index === 4) {
      setTimeout(() => handleSubmit(newCode.join('')), 100);
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (submittedCode) => {
    const finalCode = submittedCode || code.join('');

    // Check lockout
    if (isLockedOut) {
      const remainingSeconds = Math.ceil((lockoutUntil - new Date()) / 1000);
      setError(`Too many attempts. Try again in ${remainingSeconds} seconds.`);
      return;
    }

    if (!artistName.trim()) {
      setError('Please enter your artist name');
      return;
    }

    if (finalCode.length !== 5) {
      setError('Please enter all 5 digits');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: queryError } = await supabase
        .from('artist_access_codes')
        .select('*')
        .eq('artist_name', artistName.trim())
        .eq('code', finalCode)
        .eq('is_revoked', false)
        .single();

      if (queryError || !data) {
        // Failed attempt - increment counter
        const newAttemptCount = attemptCount + 1;
        setAttemptCount(newAttemptCount);

        // Lockout after 5 failed attempts
        if (newAttemptCount >= 5) {
          const lockoutTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
          setLockoutUntil(lockoutTime);
          setError('Too many failed attempts. Locked out for 5 minutes.');
        } else {
          setError(`Invalid credentials. ${5 - newAttemptCount} attempts remaining.`);
        }
        
        setCode(['', '', '', '', '']);
        inputRefs.current[0]?.focus();
        return;
      }

      // Success - reset attempts
      setAttemptCount(0);
      setLockoutUntil(null);
      onLogin(data.artist_name, data.is_admin || false);
    } catch (error) {
      console.error('Login error:', error);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #A14189 0%, #FFFFFF 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '40px',
        maxWidth: '400px',
        width: '100%',
        boxShadow: '0 10px 40px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: 'bold',
          color: '#000',
          marginBottom: '12px',
          textAlign: 'center'
        }}>
          Artist Access
        </h1>
        <p style={{
          fontSize: '16px',
          color: '#666',
          marginBottom: '40px',
          textAlign: 'center'
        }}>
          Enter your credentials to access the dashboard
        </p>

        {error && (
          <div style={{
            background: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '20px',
            color: '#d32f2f',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#333'
          }}>
            Artist Name
          </label>
          <input
            type="text"
            value={artistName}
            onChange={(e) => setArtistName(e.target.value)}
            placeholder="Enter your artist name"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              border: '2px solid #ddd',
              borderRadius: '8px',
              outline: 'none',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.borderColor = '#A14189'}
            onBlur={(e) => e.target.style.borderColor = '#ddd'}
          />
        </div>

        <div style={{ marginBottom: '32px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#333'
          }}>
            Access Code
          </label>
          <div style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center'
          }}>
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(ref) => { inputRefs.current[index] = ref; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(e.target.value, index)}
                onKeyDown={(e) => handleKeyPress(e, index)}
                disabled={loading}
                autoFocus={index === 0}
                style={{
                  width: '50px',
                  height: '60px',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  border: `2px solid ${digit ? '#A14189' : '#ddd'}`,
                  borderRadius: '8px',
                  outline: 'none',
                  transition: 'all 0.2s',
                  background: digit ? '#f5f5f5' : 'white'
                }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={() => handleSubmit()}
          disabled={loading || !artistName.trim() || !code.every(d => d !== '') || isLockedOut}
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '16px',
            fontWeight: '600',
            color: 'white',
            background: loading || !artistName.trim() || !code.every(d => d !== '') || isLockedOut ? '#ccc' : '#A14189',
            border: 'none',
            borderRadius: '8px',
            cursor: loading || !artistName.trim() || !code.every(d => d !== '') || isLockedOut ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => {
            if (!loading && artistName.trim() && code.every(d => d !== '') && !isLockedOut) {
              e.target.style.background = '#8a3674';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading && artistName.trim() && code.every(d => d !== '') && !isLockedOut) {
              e.target.style.background = '#A14189';
            }
          }}
        >
          {loading ? 'Verifying...' : 'Access Dashboard'}
        </button>

        <p style={{
          marginTop: '24px',
          fontSize: '12px',
          color: '#999',
          textAlign: 'center',
          lineHeight: '1.5'
        }}>
          Your access code is provided by the platform administrator
        </p>
      </div>
    </div>
  );
};

export default ArtistLogin;
