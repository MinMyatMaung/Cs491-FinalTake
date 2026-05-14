import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeContext } from '../../context/ThemeContext';
import '../../styles/ProfilePage.css';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [user] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [favorites, setFavorites] = useState([]);
  const [favLoading, setFavLoading] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  // Fetch favorites for this user (must be before any early return)
  useEffect(() => {
    if (!user) return;
    fetch('/api/favorites', { headers: { 'X-User-Id': String(user.id) } })
      .then(r => r.json())
      .then(data => setFavorites(data.favorites || []))
      .catch(() => setFavorites([]))
      .finally(() => setFavLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch this user's reviews
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
    navigate('/login');
  };

  const handleHomeClick = () => {
    navigate('/search');
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    : 'Unknown';

  return (
    <div className="profile-page">
      <header className="profile-header">
        <div className="header-content">
          <button className="home-button" onClick={handleHomeClick} title="Go to Home">
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
          <div className="profile-avatar">
            <span className="avatar-initials">
              {user.username ? user.username[0].toUpperCase() : '?'}
            </span>
          </div>
          <div className="profile-info">
            <h2 className="profile-username">{user.username}</h2>
            <p className="profile-email">{user.email}</p>
            <p className="profile-since">Member since {memberSince}</p>
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
                  onClick={() => navigate(`/media/${review.media_type}/${review.media_id}`)}
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
                    <div className="profile-review-stars">
                      {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                    </div>
                    {review.body && (
                      <p className="profile-review-body">{review.body}</p>
                    )}
                    <span className="profile-review-date">
                      {new Date(review.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Ratings Section — derived from reviews */}
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
