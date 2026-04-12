import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { InputOTP, InputOTPGroup, InputOTPSlot, REGEXP_ONLY_DIGITS } from '@heroui/react';
import { login, checkAuth } from '../api/client';

export default function Login() {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth().then((valid) => {
      if (valid) {
        navigate('/dashboard', { replace: true });
      } else {
        setLoading(false);
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (pin.length === 4) {
      handleComplete(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const handleComplete = async (value: string) => {
    setError('');
    try {
      await login(value);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Invalid PIN');
      setShake(true);
      setPin('');
      setTimeout(() => setShake(false), 500);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#fbf9f5' }}
      >
        <div
          className="w-10 h-10 rounded-full animate-spin"
          style={{
            border: '3px solid #e4e2de',
            borderTopColor: '#974400',
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: '#fbf9f5' }}
    >
      <div className="flex flex-col items-center w-full max-w-xs">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
          style={{ backgroundColor: '#974400' }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z" />
          </svg>
        </div>

        <h1
          className="text-2xl font-bold mb-1"
          style={{
            color: '#1b1c1a',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            letterSpacing: '-0.02em',
          }}
        >
          SDMS Automator
        </h1>
        <p
          className="text-sm mb-8"
          style={{ color: '#564338' }}
        >
          Enter your PIN to continue
        </p>

        <div className={shake ? 'animate-shake' : ''}>
          <InputOTP
            maxLength={4}
            value={pin}
            onChange={setPin}
            pattern={REGEXP_ONLY_DIGITS}
          >
            <InputOTPGroup className="gap-3">
              {[0, 1, 2, 3].map((i) => (
                <InputOTPSlot key={i} index={i} className="w-16 h-16 text-xl font-bold" />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && (
          <p
            className="mt-4 text-sm font-medium"
            style={{ color: '#ba1a1a' }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
