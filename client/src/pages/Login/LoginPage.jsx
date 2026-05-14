import { useState, useContext, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ThemeContext } from '../../context/ThemeContext';
import '../../styles/LoginPage.css';

const LoginPage = () => {
  const location = useLocation();
  const [mode, setMode] = useState(location.state?.mode || 'login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [twofaEnabled, setTwofaEnabled] = useState(false);
  const [twofaCode, setTwofaCode] = useState('');
  const [pendingUserId, setPendingUserId] = useState(null);
  const [resetToken, setResetToken] = useState('');
  const [demoMessage, setDemoMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const navigate = useNavigate();
  const { theme, toggleTheme } = useContext(ThemeContext);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset_token');
    const resetEmail = params.get('email');
    if (token && resetEmail) {
      setMode('reset');
      setResetToken(token);
      setEmail(resetEmail);
    }
  }, []);

  const finishLogin = useCallback((user) => {
    localStorage.setItem('user', JSON.stringify({ ...user, isLoggedIn: true }));
    navigate('/search');
  }, [navigate]);

  const handleGoogleCredential = useCallback(async (idToken) => {
    setError('');
    setDemoMessage('');
    setIsLoading(true);
    try {
      const res = await fetch('/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Google sign-in failed');
        return;
      }
      finishLogin(data.user);
    } catch {
      setError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  }, [finishLogin]);

  useEffect(() => {
    if (mode !== 'login' || !googleClientId || !googleButtonRef.current) {
      return undefined;
    }

    const initializeGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }
      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => handleGoogleCredential(response.credential),
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 340,
      });
    };

    if (window.google?.accounts?.id) {
      initializeGoogleButton();
      return undefined;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleButton;
    document.body.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [mode, googleClientId, handleGoogleCredential]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      if (data.requires_2fa) {
        setPendingUserId(data.user_id);
        setDemoMessage(data.demo_2fa_code ? `Demo 2FA code: ${data.demo_2fa_code}` : '');
        setMode('2fa');
        return;
      }
      finishLogin(data.user);
    } catch {
      setError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (!username || !email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, twofa_enabled: twofaEnabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }
      finishLogin(data.user);
    } catch {
      setError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2fa = async (e) => {
    e.preventDefault();
    setError('');

    if (!pendingUserId || !twofaCode) {
      setError('Enter your verification code');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: pendingUserId, code: twofaCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed');
        return;
      }
      finishLogin(data.user);
    } catch {
      setError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setDemoMessage('');

    if (!email) {
      setError('Enter your email');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Reset failed');
        return;
      }
      if (data.demo_reset_token) {
        setResetToken(data.demo_reset_token);
        setDemoMessage([
          data.demo_reset_token ? `Demo reset token: ${data.demo_reset_token}` : '',
          data.demo_2fa_code ? `Demo 2FA code: ${data.demo_2fa_code}` : '',
        ].filter(Boolean).join(' | '));
        setMode('reset');
      } else {
        setDemoMessage(data.message);
      }
    } catch {
      setError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !resetToken || !newPassword) {
      setError('Email, reset token, and new password are required');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: resetToken, password: newPassword, code: twofaCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Password reset failed');
        return;
      }
      setPassword('');
      setNewPassword('');
      setResetToken('');
      setTwofaCode('');
      setDemoMessage(data.message);
      setMode('login');
    } catch {
      setError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleDemo = async () => {
    setError('');
    setDemoMessage('');
    setIsLoading(true);
    try {
      const res = await fetch('/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Google sign-in failed');
        return;
      }
      finishLogin(data.user);
    } catch {
      setError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleHomeClick = () => {
    navigate('/search');
  };

  return (
    <div className="login-page">
      <header className="login-header">
        <button
          className="home-button"
          onClick={handleHomeClick}
          title="Go to Home"
        >
          <h1 className="site-title">
            <span className="star-icon">★</span>
            FinalTake
            <span className="star-icon">★</span>
          </h1>
          <p className="site-tagline">Share Your Entertainment Experience</p>
        </button>
        <div className="header-actions">
          <button
            className="btn btn-theme"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '☽' : '☀'}
          </button>
        </div>
      </header>

      <div className="login-container">
        <form
          className="login-form"
          onSubmit={
            mode === 'login'
              ? handleLogin
              : mode === 'register'
                ? handleRegister
                : mode === '2fa'
                  ? handleVerify2fa
                  : mode === 'forgot'
                    ? handleForgotPassword
                    : handleResetPassword
          }
        >
          <h2>
            {mode === 'login' && 'Login'}
            {mode === 'register' && 'Create Account'}
            {mode === '2fa' && 'Verify Code'}
            {mode === 'forgot' && 'Forgot Password'}
            {mode === 'reset' && 'Reset Password'}
          </h2>

          {error && <div className="error-message">{error}</div>}
          {demoMessage && <div className="demo-message">{demoMessage}</div>}

          {mode === 'register' && (
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                className="form-input"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}

          {mode !== '2fa' && (
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              className="form-input"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          )}

          {(mode === 'login' || mode === 'register') && (
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                className="form-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'HIDE' : 'SHOW'}
              </button>
            </div>
          </div>
          )}

          {mode === 'register' && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={twofaEnabled}
                onChange={(e) => setTwofaEnabled(e.target.checked)}
              />
              Enable demo 2FA
            </label>
          )}

          {mode === '2fa' && (
            <div className="form-group">
              <label htmlFor="twofaCode">Verification code</label>
              <input
                type="text"
                id="twofaCode"
                className="form-input"
                placeholder="000000"
                value={twofaCode}
                onChange={(e) => setTwofaCode(e.target.value)}
              />
            </div>
          )}

          {mode === 'reset' && (
            <>
              <div className="form-group">
                <label htmlFor="resetToken">Reset token</label>
                <input
                  type="text"
                  id="resetToken"
                  className="form-input"
                  placeholder="Paste reset token"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="newPassword">New password</label>
                <input
                  type="password"
                  id="newPassword"
                  className="form-input"
                  placeholder="Enter a new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="resetTwofaCode">2FA code</label>
                <input
                  type="text"
                  id="resetTwofaCode"
                  className="form-input"
                  placeholder="Only required if enabled"
                  value={twofaCode}
                  onChange={(e) => setTwofaCode(e.target.value)}
                />
              </div>
            </>
          )}

          <button type="submit" className="btn btn-primary btn-full" disabled={isLoading}>
            {isLoading && 'Please wait...'}
            {!isLoading && mode === 'login' && 'Login'}
            {!isLoading && mode === 'register' && 'Create Account'}
            {!isLoading && mode === '2fa' && 'Verify'}
            {!isLoading && mode === 'forgot' && 'Send Reset'}
            {!isLoading && mode === 'reset' && 'Reset Password'}
          </button>

          {mode === 'login' && (
            <>
              {googleClientId ? (
                <div className="google-button-wrap" ref={googleButtonRef} />
              ) : (
                <button type="button" className="btn btn-secondary btn-full" onClick={handleGoogleDemo} disabled={isLoading}>
                  Continue with Google
                </button>
              )}
              <div className="forgot-password-section">
                <button type="button" className="forgot-password-link" onClick={() => { setMode('forgot'); setError(''); }}>
                  Forgot password?
                </button>
              </div>
            </>
          )}
        </form>

        <div className="signup-section">
          {mode === 'login' ? (
            <p className="signup-text">
              Don&apos;t have an account?{' '}
              <button className="signup-link" onClick={() => { setMode('register'); setError(''); }}>
                Sign up
              </button>
            </p>
          ) : mode === '2fa' ? (
            <p className="signup-text">
              <button className="signup-link" onClick={() => { setMode('login'); setError(''); }}>
                Back to login
              </button>
            </p>
          ) : (
            <p className="signup-text">
              Already have an account?{' '}
              <button className="signup-link" onClick={() => { setMode('login'); setError(''); setDemoMessage(''); }}>
                Log in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
