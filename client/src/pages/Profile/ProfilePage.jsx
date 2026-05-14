import { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeContext } from '../../context/ThemeContext';
import '../../styles/ProfilePage.css';

const StarPicker = ({ value, onChange }) => (
  <div className="star-picker">
    {[1, 2, 3, 4, 5].map(n => (
      <button
        key={n}
        type="button"
        className={`star-pick ${n <= value ? 'active' : ''}`}
        onClick={() => onChange(n)}
        aria-label={`${n} star${n > 1 ? 's' : ''}`}
      >
        ★
      </button>
    ))}
  </div>
);

const ProfilePage = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useContext(ThemeContext);
  const picInputRef = useRef(null);

  const [user] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [favorites, setFavorites] = useState([]);
  const [favLoading, setFavLoading] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [profilePic, setProfilePic] = useState(() =>
    user ? localStorage.getItem(`profilePic_${user.id}`) || null : null
  );
  const [editingReview, setEditingReview] = useState(null);
  const [editForm, setEditForm] = useState({ rating: 0, body: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSuccess, setUsernameSuccess] = useState('');

  useEffect(() => {
    if (!user) return;
    fetch('/api/favorites', { headers: { 'X-User-Id': String(user.id) } })
      .then(r => r.json())
      .then(data => setFavorites(data.favorites || []))
      .catch(() => setFavorites([]))
      .finally(() => setFavLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    fetch('/api/reviews/mine', { headers: { 'X-User-Id': String(user.id) } })
      .then(r => r.json())
      .then(data => setReviews(data.reviews || []))
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/search');
  };

  const handleHomeClick = () => {
    navigate('/search');
  };

  const handlePicUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      localStorage.setItem(`profilePic_${user.id}`, base64);
      setProfilePic(base64);
    };
    reader.readAsDataURL(file);
  };

  const handlePicRemove = () => {
    localStorage.removeItem(`profilePic_${user.id}`);
    setProfilePic(null);
  };

  const handleEditStart = (review, e) => {
    e.stopPropagation();
    setEditingReview(review.id);
    setEditForm({ rating: review.rating, body: review.body || '' });
  };

  const handleEditSave = async (review, e) => {
    e.stopPropagation();
    if (editForm.rating === 0) return;
    setEditSubmitting(true);
    const authHeaders = { 'X-User-Id': String(user.id) };
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          media_id: review.media_id,
          media_type: review.media_type,
          title: review.title,
          image_url: review.image_url,
          rating: editForm.rating,
          body: editForm.body.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setReviews(prev => prev.map(r => r.id === review.id ? data.review : r));
        setEditingReview(null);
      }
    } catch {
      // silently ignore
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleEditCancel = (e) => {
    e.stopPropagation();
    setEditingReview(null);
  };

  const handleUsernameSave = async () => {
    if (!newUsername.trim()) return;
    setUsernameError('');
    setUsernameSuccess('');
    try {
      const res = await fetch('/auth/update-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': String(user.id),
        },
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUsernameError(data.error || 'Failed to update username.');
        return;
      }
      const updated = { ...user, username: data.user.username };
      localStorage.setItem('user', JSON.stringify(updated));
      setUsernameSuccess('Username updated!');
      setEditingUsername(false);
      window.location.reload();
    } catch {
      setUsernameError('Cannot reach server.');
    }
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    : 'Unknown';

  const mostReviewedType = (() => {
    if (reviews.length === 0) return null;
    const counts = reviews.reduce((acc, r) => {
      acc[r.media_type] = (acc[r.media_type] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  })();

  const recentReviews = reviews.slice(0, 3);

  return (
    <div className="profile-page">
      <header className="profile-header">
        <div className="header-content">
          <button className="home-button" onClick={handleHomeClick} title="Go to Home">
            <h1 className="site-title">
              FinalTake
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
            <button className="btn btn-secondary" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="profile-content">
        <button className="back-button" onClick={() => navigate('/search')}>
          ← Back to Search
        </button>

        {/* User Info Card */}
        <div className="profile-card">
          <div className="profile-avatar-wrapper">
            <div className="profile-avatar">
              {profilePic
                ? <img src={profilePic} alt="Profile" className="profile-avatar-img" />
                : <span className="avatar-initials">{user.username ? user.username[0].toUpperCase() : '?'}</span>
              }
            </div>
            <div className="profile-pic-actions">
              <button className="btn-pic" onClick={() => picInputRef.current.click()}>
                {profilePic ? 'Change Photo' : 'Upload Photo'}
              </button>
              {profilePic && (
                <button className="btn-pic btn-pic-remove" onClick={handlePicRemove}>
                  Remove
                </button>
              )}
              <input
                ref={picInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePicUpload}
              />
            </div>
          </div>
          <div className="profile-info">
            {editingUsername ? (
              <div className="username-edit-form">
                <input
                  className="username-input"
                  type="text"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="New username"
                  maxLength={50}
                />
                <div className="username-edit-actions">
                  <button className="btn btn-primary" onClick={handleUsernameSave}>Save</button>
                  <button className="btn btn-secondary" onClick={() => { setEditingUsername(false); setUsernameError(''); }}>Cancel</button>
                </div>
                {usernameError && <p className="username-error">{usernameError}</p>}
              </div>
            ) : (
              <div className="username-display">
                <h2 className="profile-username">{user.username}</h2>
                <button className="btn-edit-username" onClick={() => { setEditingUsername(true); setNewUsername(user.username); }}>
                  ✏
                </button>
              </div>
            )}
            {usernameSuccess && <p className="username-success">{usernameSuccess}</p>}
            <p className="profile-email">{user.email}</p>
            <p className="profile-since">Member since {memberSince}</p>
            {mostReviewedType && (
              <p className="profile-top-type">
                Top category: <strong>{mostReviewedType.charAt(0).toUpperCase() + mostReviewedType.slice(1)}</strong>
              </p>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="profile-stats">
          <div className="stat-card">
            <span className="stat-number">{favorites.length}</span>
            <span className="stat-label">Favorites</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{reviews.length}</span>
            <span className="stat-label">Reviews</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">
              {reviews.length > 0
                ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
                : '—'}
            </span>
            <span className="stat-label">Avg Rating</span>
          </div>
        </div>

        {/* Last 3 Reviews Section */}
        {!reviewsLoading && recentReviews.length > 0 && (
          <section className="profile-section">
            <h3 className="section-title">🕐 Recently Reviewed</h3>
            <div className="recent-reviews-row">
              {recentReviews.map(review => (
                <div
                  key={review.id}
                  className="recent-review-card"
                  onClick={() => navigate(`/media/${review.media_type}/${review.media_id}`)}
                >
                  <div className="recent-review-image">
                    {review.image_url
                      ? <img src={review.image_url} alt={review.title} loading="lazy" />
                      : <div className="fav-placeholder"><span>No Image</span></div>
                    }
                  </div>
                  <p className="recent-review-title">{review.title}</p>
                  <div className="recent-review-stars">
                    {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Favorites Section */}
        <section className="profile-section">
          <h3 className="section-title">❤ Favorites</h3>
          {favLoading ? (
            <p className="section-loading">Loading...</p>
          ) : favorites.length === 0 ? (
            <div className="section-empty">
              <p>No favorites yet.</p>
              <button className="btn btn-primary" onClick={handleHomeClick}>
                Browse Media
              </button>
            </div>
          ) : (
            <div className="favorites-grid">
              {favorites.map(fav => (
                <div
                  key={`${fav.media_type}-${fav.media_id}`}
                  className="fav-card"
                  onClick={() => navigate(`/media/${fav.media_type}/${fav.media_id}`)}
                >
                  <div className="fav-image">
                    {fav.image_url
                      ? <img src={fav.image_url} alt={fav.title} loading="lazy" />
                      : <div className="fav-placeholder"><span>No Image</span></div>
                    }
                  </div>
                  <div className="fav-info">
                    <p className="fav-title">{fav.title}</p>
                    <span className="fav-type">{fav.media_type}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reviews Section */}
        <section className="profile-section">
          <h3 className="section-title">✏ Reviews</h3>
          {reviewsLoading ? (
            <p className="section-loading">Loading...</p>
          ) : reviews.length === 0 ? (
            <div className="section-empty">
              <p>No reviews yet.</p>
              <button className="btn btn-primary" onClick={handleHomeClick}>
                Browse Media
              </button>
            </div>
          ) : (
            <div className="reviews-list">
              {reviews.map(review => (
                <div
                  key={review.id}
                  className="profile-review-card"
                  onClick={() => editingReview !== review.id && navigate(`/media/${review.media_type}/${review.media_id}`)}
                >
                  <div className="profile-review-image">
                    {review.image_url
                      ? <img src={review.image_url} alt={review.title} loading="lazy" />
                      : <div className="fav-placeholder"><span>No Image</span></div>
                    }
                  </div>
                  <div className="profile-review-info">
                    <p className="profile-review-title">{review.title}</p>
                    <span className="fav-type">{review.media_type}</span>

                    {editingReview === review.id ? (
                      <div className="inline-edit-form" onClick={e => e.stopPropagation()}>
                        <StarPicker
                          value={editForm.rating}
                          onChange={val => setEditForm(f => ({ ...f, rating: val }))}
                        />
                        <textarea
                          className="review-textarea"
                          value={editForm.body}
                          onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))}
                          maxLength={1000}
                          rows={3}
                          placeholder="Update your review..."
                        />
                        <div className="inline-edit-actions">
                          <button
                            className="btn btn-primary"
                            onClick={(e) => handleEditSave(review, e)}
                            disabled={editSubmitting}
                          >
                            {editSubmitting ? 'Saving...' : 'Save'}
                          </button>
                          <button className="btn btn-secondary" onClick={handleEditCancel}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="profile-review-stars">
                          {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                        </div>
                        {review.body && (
                          <p className="profile-review-body">{review.body}</p>
                        )}
                        <div className="profile-review-footer">
                          <span className="profile-review-date">
                            {new Date(review.created_at).toLocaleDateString()}
                          </span>
                          <button
                            className="btn-edit-review"
                            onClick={(e) => handleEditStart(review, e)}
                          >
                            Edit
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Ratings Section */}
        <section className="profile-section">
          <h3 className="section-title">★ Ratings</h3>
          {reviewsLoading ? (
            <p className="section-loading">Loading...</p>
          ) : reviews.length === 0 ? (
            <div className="section-empty">
              <p>No ratings yet.</p>
              <button className="btn btn-primary" onClick={handleHomeClick}>
                Browse Media
              </button>
            </div>
          ) : (
            <div className="ratings-summary">
              {[5, 4, 3, 2, 1].map(star => {
                const count = reviews.filter(r => r.rating === star).length;
                const pct = reviews.length > 0 ? Math.round((count / reviews.length) * 100) : 0;
                return (
                  <div key={star} className="rating-bar-row">
                    <span className="rating-bar-label">{star}★</span>
                    <div className="rating-bar-track">
                      <div className="rating-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="rating-bar-count">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ProfilePage;