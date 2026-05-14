import { useState, useContext, useEffect, useCallback } from 'react';
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
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [twofaEnabled, setTwofaEnabled] = useState(false);
  const [twofaCode, setTwofaCode] = useState('');
  const [pendingUserId, setPendingUserId] = useState(null);
  const [resetToken, setResetToken] = useState('');
  const [resetMethod, setResetMethod] = useState('email');
  const [demoMessage, setDemoMessage] = useState('');
  const [twofaSetup, setTwofaSetup] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
        setDemoMessage('Enter the 6-digit code from your authenticator app.');
        setMode('2fa');
        return;
      }
      if (data.requires_2fa_setup) {
        setPendingUserId(data.user_id);
        setTwofaSetup(data.twofa_setup);
        setDemoMessage('Scan the QR code with your authenticator app, then enter the 6-digit code.');
        setMode('setup2fa');
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

    if (!username || !email || !password || !securityQuestion || !securityAnswer) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          password,
          security_question: securityQuestion,
          security_answer: securityAnswer,
          twofa_enabled: twofaEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }
      if (data.requires_2fa_setup) {
        if (!data.twofa_setup?.qr_code_data_url || !data.twofa_setup?.manual_entry_key) {
          setError('Two-factor setup failed. Redeploy the backend with the latest requirements.');
          return;
        }
        setPendingUserId(data.user_id);
        setTwofaSetup(data.twofa_setup);
        setDemoMessage('Scan this QR code in your authenticator app, then enter the 6-digit code.');
        setMode('setup2fa');
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
      const res = await fetch(mode === 'setup2fa' ? '/auth/confirm-2fa' : '/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: pendingUserId, code: twofaCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed');
        return;
      }
      setTwofaSetup(null);
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

    setMode('reset-choice');
  };

  const handleResetMethodSelect = async (method) => {
    setError('');
    setDemoMessage('');
    setResetMethod(method);
    setResetToken('');
    setTwofaCode('');
    setSecurityAnswer('');

    if (!email) {
      setError('Enter your email');
      setMode('forgot');
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
      setSecurityQuestion(data.security_question || '');

      if (method === 'email' && data.demo_reset_token) {
        setResetToken(data.demo_reset_token);
        setDemoMessage(`Email reset token: ${data.demo_reset_token}`);
      } else if (method === '2fa') {
        setDemoMessage('Enter the 6-digit code from your authenticator app.');
      } else if (method === 'security') {
        setDemoMessage('Answer your security question to reset your password.');
      } else if (!data.demo_reset_token) {
        setDemoMessage(data.message);
      }

      setMode('reset');
    } catch {
      setError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !newPassword) {
      setError('Email and new password are required');
      return;
    }

    if (resetMethod === 'email' && !resetToken) {
      setError('Reset token is required');
      return;
    }

    if (resetMethod === '2fa' && !twofaCode) {
      setError('Authenticator code is required');
      return;
    }

    if (resetMethod === 'security' && !securityAnswer) {
      setError('Security answer is required');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          token: resetToken,
          password: newPassword,
          code: twofaCode,
          security_answer: securityAnswer,
          reset_method: resetMethod,
        }),
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
      setSecurityAnswer('');
      setDemoMessage(data.message);
      setMode('login');
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
                : mode === '2fa' || mode === 'setup2fa'
                  ? handleVerify2fa
                  : mode === 'forgot'
                    ? handleForgotPassword
                    : mode === 'reset-choice'
                      ? (e) => e.preventDefault()
                    : handleResetPassword
          }
        >
          <h2>
            {mode === 'login' && 'Login'}
            {mode === 'register' && 'Create Account'}
            {mode === '2fa' && 'Verify Code'}
            {mode === 'setup2fa' && 'Set Up 2FA'}
            {mode === 'forgot' && 'Forgot Password'}
            {mode === 'reset-choice' && 'Choose Reset Method'}
            {mode === 'reset' && 'Reset Password'}
          </h2>

          {error && <div className="error-message">{error}</div>}
          {demoMessage && <div className="demo-message">{demoMessage}</div>}

          {mode === 'register' && (
            <>
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
              <div className="form-group">
                <label htmlFor="securityQuestion">Security question</label>
                <input
                  type="text"
                  id="securityQuestion"
                  className="form-input"
                  placeholder="Example: What was your first school?"
                  value={securityQuestion}
                  onChange={(e) => setSecurityQuestion(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="securityAnswer">Security answer</label>
                <input
                  type="text"
                  id="securityAnswer"
                  className="form-input"
                  placeholder="Your answer"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                />
              </div>
            </>
          )}

          {mode !== '2fa' && mode !== 'setup2fa' && (
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
              Enable authenticator app 2FA
            </label>
          )}

          {mode === 'setup2fa' && twofaSetup && (
            <div className="totp-setup">
              <img src={twofaSetup.qr_code_data_url} alt="Authenticator app QR code" />
              <span className="manual-key-label">Manual setup key</span>
              <p className="manual-key">{twofaSetup.manual_entry_key}</p>
            </div>
          )}

          {(mode === '2fa' || mode === 'setup2fa') && (
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

          {mode === 'reset-choice' && (
            <div className="reset-methods">
              <button type="button" className="btn btn-secondary btn-full" onClick={() => handleResetMethodSelect('email')}>
                Email reset link
              </button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => handleResetMethodSelect('2fa')}>
                Authenticator app
              </button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => handleResetMethodSelect('security')}>
                Security question
              </button>
            </div>
          )}

          {mode === 'reset' && (
            <>
              {resetMethod === 'email' && (
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
              )}
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
              {resetMethod === '2fa' && (
                <div className="form-group">
                  <label htmlFor="resetTwofaCode">Authenticator code</label>
                  <input
                    type="text"
                    id="resetTwofaCode"
                    className="form-input"
                    placeholder="000000"
                    value={twofaCode}
                    onChange={(e) => setTwofaCode(e.target.value)}
                  />
                </div>
              )}
              {resetMethod === 'security' && (
                <>
                  {securityQuestion && (
                    <div className="security-question-prompt">
                      {securityQuestion}
                    </div>
                  )}
                  <div className="form-group">
                    <label htmlFor="resetSecurityAnswer">Security answer</label>
                    <input
                      type="text"
                      id="resetSecurityAnswer"
                      className="form-input"
                      placeholder="Your answer"
                      value={securityAnswer}
                      onChange={(e) => setSecurityAnswer(e.target.value)}
                    />
                  </div>
                </>
              )}
            </>
          )}

          <button type="submit" className="btn btn-primary btn-full" disabled={isLoading}>
            {isLoading && 'Please wait...'}
            {!isLoading && mode === 'login' && 'Login'}
            {!isLoading && mode === 'register' && 'Create Account'}
            {!isLoading && mode === '2fa' && 'Verify'}
            {!isLoading && mode === 'setup2fa' && 'Enable 2FA'}
            {!isLoading && mode === 'forgot' && 'Send Reset'}
            {!isLoading && mode === 'reset-choice' && 'Choose an Option'}
            {!isLoading && mode === 'reset' && 'Reset Password'}
          </button>

          {mode === 'login' && (
            <div className="forgot-password-section">
              <button type="button" className="forgot-password-link" onClick={() => { setMode('forgot'); setError(''); }}>
                Forgot password?
              </button>
            </div>
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
          ) : mode === '2fa' || mode === 'setup2fa' || mode === 'reset-choice' ? (
            <p className="signup-text">
              <button className="signup-link" onClick={() => { setMode('login'); setError(''); setDemoMessage(''); }}>
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
