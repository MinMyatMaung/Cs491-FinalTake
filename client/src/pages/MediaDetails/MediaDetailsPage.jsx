import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback, useContext } from 'react';
import { ThemeContext } from '../../context/ThemeContext';
import '../../styles/MediaDetailsPage.css';

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

const MediaDetailsPage = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [media, setMedia] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [myReview, setMyReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 0, body: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const authHeaders = user ? { 'X-User-Id': String(user.id) } : {};

  useEffect(() => {
    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/media/${type}/${id}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `Server error ${res.status}`);
        }
        const data = await res.json();
        setMedia(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetails();
  }, [type, id]);

  // Check favorite status once media is loaded
  useEffect(() => {
    if (!user || !id || !type) return;
    fetch(`/api/favorites/check/${type}/${id}`, { headers: authHeaders })
      .then(r => r.json())
      .then(data => setIsFavorite(data.is_favorite))
      .catch(() => {});
  }, [id, type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch reviews for this media item
  useEffect(() => {
    if (!id || !type) return;
    setReviewsLoading(true);
    fetch(`/api/reviews?media_type=${type}&media_id=${id}`)
      .then(r => r.json())
      .then(data => {
        const all = data.reviews || [];
        setReviews(all);
        if (user) {
          setMyReview(all.find(r => r.user_id === user.id) || null);
        }
      })
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  }, [id, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFavoriteToggle = useCallback(async () => {
    if (!user) { navigate('/login'); return; }
    setFavoriteLoading(true);
    try {
      if (isFavorite) {
        await fetch(`/api/favorites/${type}/${id}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
        setIsFavorite(false);
      } else {
        await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            media_id: id,
            media_type: type,
            title: media?.title || '',
            image_url: media?.imageUrl || null,
            rating: media?.rating || null,
          }),
        });
        setIsFavorite(true);
      }
    } catch {
      // silently ignore network errors
    } finally {
      setFavoriteLoading(false);
    }
  }, [isFavorite, id, type, media, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!user) { navigate('/login'); return; }
    if (reviewForm.rating === 0) { setReviewError('Please select a star rating.'); return; }
    setReviewError('');
    setReviewSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          media_id: id,
          media_type: type,
          title: media?.title || '',
          image_url: media?.imageUrl || null,
          rating: reviewForm.rating,
          body: reviewForm.body.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setReviewError(data.error || 'Failed to submit review.'); return; }
      const updated = data.review;
      setMyReview(updated);
      setReviews(prev => {
        const filtered = prev.filter(r => r.id !== updated.id);
        return [updated, ...filtered];
      });
      setReviewForm({ rating: 0, body: '' });
    } catch {
      setReviewError('Cannot reach server.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleReviewDelete = async () => {
    if (!myReview) return;
    try {
      await fetch(`/api/reviews/${myReview.id}`, { method: 'DELETE', headers: authHeaders });
      setReviews(prev => prev.filter(r => r.id !== myReview.id));
      setMyReview(null);
      setReviewForm({ rating: 0, body: '' });
    } catch {
      // silently ignore
    }
  };

  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;

    for (let i = 0; i < fullStars; i++) {
      stars.push(<span key={`full-${i}`} className="star full">★</span>);
    }

    if (hasHalfStar) {
      stars.push(<span key="half" className="star half">★</span>);
    }

    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<span key={`empty-${i}`} className="star empty">☆</span>);
    }

    return stars;
  };

  const getCreatorLabel = (type) => {
    return type === 'movie' ? 'Director' : 'Creator';
  };

  const getCreatorValue = (media) => {
    return media.director || media.creator || 'Unknown';
  };

  if (isLoading) {
    return (
      <div className="media-details-page">
        <div className="loading-container">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !media) {
    return (
      <div className="media-details-page">
        <div className="error-container">
          <h2>Media Not Found</h2>
          <p>{error || 'The requested media could not be found.'}</p>
          <button className="btn btn-primary" onClick={() => navigate('/search')}>
            Back to Search
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="media-details-page">
      <header className="search-header">
        <button className="header-logo" onClick={() => navigate('/search')} title="Go to Home">
          FinalTake
        </button>
        <div className="header-actions">
          <button
            className="btn btn-theme"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '☽' : '☀'}
          </button>
          {user ? (
            <>
              <span className="user-email">{user.email}</span>
              <button className="btn btn-secondary" onClick={() => navigate('/profile')}>
                Profile
              </button>
              <button className="btn btn-secondary" onClick={() => { localStorage.removeItem('user'); navigate('/login'); }}>
                Logout
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => navigate('/login')}>
              Login
            </button>
          )}
        </div>
      </header>
      <button className="back-button" onClick={() => navigate('/search')}>
        ← Back to Search
      </button>

      <div className="details-container">
        <div className="details-header">
          <div className={`media-image-large${media.type === 'game' ? ' game-image' : ''}`}>
            {media.imageUrl ? (
              <img src={media.imageUrl} alt={media.title} loading="lazy" />
            ) : (
              <div className="placeholder-image-large">
                <span className="placeholder-icon">🎬</span>
              </div>
            )}
          </div>

          <div className="media-info-section">
            <div className="type-badge">{media.type}</div>
            <h1 className="media-title-large">{media.title}</h1>
            <div className="media-meta">
              <span className="meta-item">{media.releaseYear}</span>
              <span className="meta-separator">•</span>
              <span className="meta-item">{getCreatorLabel(media.type)}: {getCreatorValue(media)}</span>
            </div>
            
            <div className="rating-section">
              <div className="stars-display">
                {renderStars(media.rating)}
              </div>
              <span className="rating-number">{media.rating.toFixed(1)} / 5.0</span>
            </div>

            <div className="genre-tags">
              {media.genre.map((g, index) => (
                <span key={index} className="genre-tag">{g}</span>
              ))}
            </div>

            <button
              className={`favorite-button ${isFavorite ? 'favorited' : ''}`}
              onClick={handleFavoriteToggle}
              disabled={favoriteLoading}
            >
              <span className="heart-icon">{isFavorite ? '❤️' : '🤍'}</span>
              {favoriteLoading ? 'Saving...' : isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
            </button>
          </div>
        </div>
        <div className="details-body">
          <section className="description-section">
            <h2>Description</h2>
            <p>{media.description}</p>
          </section>

          <section className="reviews-section">
            <h2>Reviews</h2>

            {/* Write / edit review form */}
            {user && !myReview && (
              <form className="review-form" onSubmit={handleReviewSubmit}>
                <p className="review-form-label">Your rating</p>
                <StarPicker
                  value={reviewForm.rating}
                  onChange={val => setReviewForm(f => ({ ...f, rating: val }))}
                />
                <textarea
                  className="review-textarea"
                  placeholder="Write a review (optional)..."
                  value={reviewForm.body}
                  onChange={e => setReviewForm(f => ({ ...f, body: e.target.value }))}
                  maxLength={1000}
                  rows={4}
                />
                {reviewError && <p className="review-error">{reviewError}</p>}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={reviewSubmitting}
                >
                  {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                </button>
              </form>
            )}

            {/* Current user's existing review */}
            {user && myReview && (
              <div className="my-review-card">
                <div className="review-header">
                  <span className="review-author">Your review</span>
                  <div className="review-stars">
                    {'★'.repeat(myReview.rating)}{'☆'.repeat(5 - myReview.rating)}
                  </div>
                  <button
                    className="btn btn-danger-sm"
                    onClick={handleReviewDelete}
                  >
                    Delete
                  </button>
                </div>
                {myReview.body && <p className="review-body">{myReview.body}</p>}
                <span className="review-date">
                  {new Date(myReview.created_at).toLocaleDateString()}
                </span>
              </div>
            )}

            {/* All reviews */}
            {reviewsLoading ? (
              <p className="reviews-loading">Loading reviews...</p>
            ) : reviews.filter(r => !user || r.user_id !== user.id).length === 0 && !myReview ? (
              <div className="reviews-placeholder">
                <p>No reviews yet. Be the first to review!</p>
              </div>
            ) : (
              <div className="reviews-list">
                {reviews
                  .filter(r => !user || r.user_id !== user.id)
                  .map(review => (
                    <div key={review.id} className="review-card">
                      <div className="review-header">
                        <span className="review-author">{review.username}</span>
                        <div className="review-stars">
                          {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                        </div>
                        <span className="review-date">
                          {new Date(review.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {review.body && <p className="review-body">{review.body}</p>}
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default MediaDetailsPage;