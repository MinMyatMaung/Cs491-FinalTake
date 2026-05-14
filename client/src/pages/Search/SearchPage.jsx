import { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import MediaCard from '../../components/media/MediaCard';
import { ThemeContext } from '../../context/ThemeContext';
import '../../styles/SearchPage.css';

const HorizontalScrollRow = ({ children }) => {
  const rowRef = useRef(null);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      // deltaMode 1 = lines (~40px each), 2 = pages; 0 = pixels (default)
      const multiplier = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      el.scrollBy({ left: e.deltaY * multiplier, behavior: 'auto' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="trending-row" ref={rowRef}>
      {children}
    </div>
  );
};

const SkeletonCard = () => (
  <div className="skeleton-card">
    <div className="skeleton-image" />
    <div className="skeleton-text skeleton-title" />
    <div className="skeleton-text skeleton-subtitle" />
  </div>
);

const SearchPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [mediaResults, setMediaResults] = useState([]);
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [trendingShows, setTrendingShows] = useState([]);
  const [trendingGames, setTrendingGames] = useState([]);
  const [trendingBooks, setTrendingBooks] = useState([]);
  const [popularMovies, setPopularMovies] = useState([]);
  const [topRatedMovies, setTopRatedMovies] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTrendingLoading, setIsTrendingLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeTab, setActiveTab] = useState('movies');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchWrapperRef = useRef(null);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [user] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  // Load recently viewed from localStorage on mount
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    setRecentlyViewed(stored);
  }, []);

  // Fetch trending + popular + top-rated on mount
  useEffect(() => {
    const fetchTrending = async () => {
      setIsTrendingLoading(true);
      try {
        const [trendingResp, popularResp, topRatedResp] = await Promise.all([
          fetch('/api/trending-all').then(r => r.json()),
          fetch('/api/popular?type=movie').then(r => r.json()),
          fetch('/api/top-rated?type=movie').then(r => r.json()),
        ]);
        setTrendingMovies(trendingResp.movies || []);
        setTrendingShows(trendingResp.shows || []);
        setTrendingGames(trendingResp.games || []);
        setTrendingBooks(trendingResp.books || []);
        setPopularMovies(popularResp.results || []);
        setTopRatedMovies(topRatedResp.results || []);
      } catch {
        setTrendingMovies([]);
        setTrendingShows([]);
        setTrendingGames([]);
        setTrendingBooks([]);
      } finally {
        setIsTrendingLoading(false);
      }
    };
    fetchTrending();
  }, []);

  // Debounced preview suggestions
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ query: searchQuery.trim(), limit: 5 });
        if (selectedType !== 'all') params.append('type', selectedType);
        const res = await fetch(`/api/search?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.results?.slice(0, 5) || []);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedType]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSuggestionClick = (item) => {
    setShowSuggestions(false);
    navigate(`/media/${item.type}/${item.id}`);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setShowSuggestions(false);
    setSuggestions([]);

    try {
      const params = new URLSearchParams({ query: searchQuery.trim() });
      if (selectedType !== 'all') params.append('type', selectedType);

      const res = await fetch(`/api/search?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      setMediaResults(data.results || []);
    } catch (err) {
      setError(err.message);
      setMediaResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSearchQuery('');
    setSelectedType('all');
    setMediaResults([]);
    setHasSearched(false);
    setError(null);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleHomeClick = () => {
    navigate('/search');
  };

  const trendingTabs = [
    { key: 'movies', label: 'Trending Movies', data: trendingMovies },
    { key: 'tv', label: 'Trending TV', data: trendingShows },
    { key: 'games', label: 'Trending Games', data: trendingGames },
    { key: 'books', label: 'Trending Books', data: trendingBooks },
    { key: 'popular', label: 'Popular Movies', data: popularMovies },
    { key: 'top-rated', label: 'Top Rated Movies', data: topRatedMovies },
  ];

  return (
    <div className="search-page">
      <header className="search-header">
        <button className="header-logo" onClick={handleHomeClick} title="Go to Home">
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
              <button className="btn btn-secondary" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => navigate('/login')}
            >
              Login
            </button>
          )}
        </div>
      </header>

      <div className="search-container">
        <button className="home-button" onClick={handleHomeClick} title="Go to Home">
          <h1 className="site-title">
            <span className="star-icon">★</span>
            FinalTake
            <span className="star-icon">★</span>
          </h1>
          <p className="site-tagline">Share Your Entertainment Experience</p>
        </button>
        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-input-group" ref={searchWrapperRef} style={{ position: 'relative' }}>
            <input
              type="text"
              className="search-input"
              placeholder="Search for movies, books, games, TV shows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="suggestions-dropdown">
                {suggestions.map((item) => (
                  <li
                    key={`${item.type}-${item.id}`}
                    className="suggestion-item"
                    onMouseDown={() => handleSuggestionClick(item)}
                  >
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" className="suggestion-thumb" />
                    )}
                    <span className="suggestion-title">{item.title}</span>
                    <span className="suggestion-type">{item.type}</span>
                  </li>
                ))}
              </ul>
            )}
            <select
              className="type-filter"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="movie">Movies</option>
              <option value="tv">TV Shows</option>
              <option value="game">Games</option>
              <option value="book">Books</option>
            </select>
          </div>
          <div className="search-buttons">
            <button type="submit" className="btn btn-primary">Search</button>
            <button type="button" className="btn btn-secondary" onClick={handleReset}>
              Reset
            </button>
          </div>
        </form>
      </div>

      <div className="results-container">
        {error && (
          <div className="error-state">
            <p>Error: {error}</p>
          </div>
        )}

        {!error && hasSearched && (
          <>
            <div className="results-header">
              <h2>Search Results {!isLoading && `(${mediaResults.length})`}</h2>
            </div>
            {isLoading ? (
              <div className="media-grid">
                {Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : mediaResults.length > 0 ? (
              <div className="media-grid">
                {mediaResults.map((media) => (
                  <MediaCard
                    key={`${media.type}-${media.id}`}
                    id={media.id}
                    title={media.title}
                    type={media.type}
                    rating={media.rating}
                    imageUrl={media.imageUrl}
                  />
                ))}
              </div>
            ) : (
              <div className="no-results">
                <p>No media found matching your search.</p>
                <button className="btn btn-secondary" onClick={handleReset}>
                  Clear Filters
                </button>
              </div>
            )}
          </>
        )}

        {!error && !hasSearched && (
          <>
            {recentlyViewed.length > 0 && (
              <div className="recently-viewed-section">
                <div className="results-header">
                  <h2>Recently Viewed</h2>
                </div>
                <HorizontalScrollRow>
                  {recentlyViewed.map((item) => (
                    <MediaCard
                      key={`rv-${item.type}-${item.id}`}
                      id={item.id}
                      title={item.title}
                      type={item.type}
                      rating={item.rating}
                      imageUrl={item.imageUrl}
                    />
                  ))}
                </HorizontalScrollRow>
              </div>
            )}

            <div className="trending-tabs">
              {trendingTabs.map(({ key, label }) => (
                <button
                  key={key}
                  className={`tab-btn${activeTab === key ? ' tab-btn--active' : ''}`}
                  onClick={() => setActiveTab(key)}
                  disabled={isTrendingLoading}
                >
                  {label}
                </button>
              ))}
            </div>
            {isTrendingLoading ? (
              <HorizontalScrollRow>
                {Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
              </HorizontalScrollRow>
            ) : (
              trendingTabs.map(({ key, label, data }) =>
                activeTab === key && (
                  <div key={key}>
                    <div className="results-header">
                      <h2>Trending {label}</h2>
                    </div>
                    {data.length > 0 ? (
                      <HorizontalScrollRow>
                        {data.map((media) => (
                          <MediaCard
                            key={`${key}-${media.id}`}
                            id={media.id}
                            title={media.title}
                            type={media.type}
                            rating={media.rating}
                            imageUrl={media.imageUrl}
                          />
                        ))}
                      </HorizontalScrollRow>
                    ) : (
                      <div className="empty-state">
                        <p>No trending {label.toLowerCase()} available right now.</p>
                      </div>
                    )}
                  </div>
                )
              )
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
