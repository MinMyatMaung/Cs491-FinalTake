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
    <div className="trending-row-wrapper">
      <div className="trending-row" ref={rowRef}>
        {children}
      </div>
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

const TAGLINE_QUOTES = [
  { text: "Yeah, well, you know, that's just, like, your opinion, man.", attribution: "The Dude, The Big Lebowski" },
  { text: "Everyone's a critic. You wouldn't know true art if it hit you in the face!", attribution: "Squidward Tentacles, SpongeBob SquarePants" },
  { text: "You can't let a bad review destroy your confidence! You have to ignore it, like I do with the speed limit.", attribution: "Captain Holt, Brooklyn Nine-Nine" },
  { text: "In many ways, the work of a critic is easy. We risk very little, yet enjoy a position over those who offer up their work and their selves to our judgment.", attribution: "Anton Ego, Ratatouille" },
  { text: "A thing is a thing, not what is said of that thing.", attribution: "Tabitha Dickinson (quoting Susan Sontag), Birdman" },
  { text: "It is the spectator, and not life, that art really mirrors.", attribution: "Oscar Wilde, The Picture of Dorian Gray" },
  { text: "We all make choices, but in the end, our choices make us.", attribution: "Andrew Ryan, BioShock" },
  { text: "Are you not entertained?", attribution: "Maximus, Gladiator" },
  { text: "I've seen things you people wouldn't believe.", attribution: "Roy Batty, Blade Runner" },
];

const SearchPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [sortBy, setSortBy] = useState("default");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [mediaResults, setMediaResults] = useState([]);
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [trendingShows, setTrendingShows] = useState([]);
  const [trendingGames, setTrendingGames] = useState([]);
  const [trendingBooks, setTrendingBooks] = useState([]);
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
  const [taglineIndex, setTaglineIndex] = useState(() => Math.floor(Math.random() * TAGLINE_QUOTES.length));
  const tagline = TAGLINE_QUOTES[taglineIndex];

  const cycleTagline = () => {
    setTaglineIndex(i => (i + 1) % TAGLINE_QUOTES.length);
  };

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
        const [trendingResp, topRatedResp] = await Promise.all([
          fetch('/api/trending-all').then(r => r.json()),
          fetch('/api/top-rated?type=movie').then(r => r.json()),
        ]);
        setTrendingMovies(trendingResp.movies || []);
        setTrendingShows(trendingResp.shows || []);
        setTrendingGames(trendingResp.games || []);
        setTrendingBooks(trendingResp.books || []);
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
    navigate('/search');
  };

  const handleHomeClick = () => {
    navigate('/search');
  };

  const trendingTabs = [
    { key: 'movies', label: 'Trending Movies', data: trendingMovies },
    { key: 'tv', label: 'Trending TV', data: trendingShows },
    { key: 'games', label: 'Trending Games', data: trendingGames },
    { key: 'books', label: 'Trending Books', data: trendingBooks },
    { key: 'top-rated', label: 'Top Rated Movies', data: topRatedMovies },
  ];

  const filteredResults =
  selectedType === 'all'
    ? mediaResults
    : mediaResults.filter((media) => media.type === selectedType);

  const sortedResults = [...filteredResults].sort((a, b) => {
    if (sortBy === 'highest') {
      return (b.rating || 0) - (a.rating || 0);
    }

    if (sortBy === 'lowest') {
      return (a.rating || 0) - (b.rating || 0);
    }

    if (sortBy === 'popular') {
      return (b.popularity || 0) - (a.popularity || 0);
    }

    if (sortBy === 'az') {
      return (a.title || '').localeCompare(b.title || '');
    }

    if (sortBy === 'newest') {
      return new Date(b.releaseDate || b.release_date || 0)
        - new Date(a.releaseDate || a.release_date || 0);
    }

    return 0;
  });

  return (
    <div className="search-page">
      <header className="search-header">
        <div className="header-brand">
          <button className="header-logo" onClick={handleHomeClick} title="Go to Home">
            <span className="logo-accent">Final</span>Take
          </button>
          <span className="header-tagline">
            <span className="header-tagline-line1">Don't just watch it.</span>
            <span className="header-tagline-line2"><em>Play</em> it, <em>read</em> it, <em>rate</em> it.</span>
          </span>
        </div>
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
              <span className="user-email">{user.username}</span>
              <button className="btn btn-secondary" onClick={() => navigate('/profile')}>
                Profile
              </button>
              <button className="btn btn-secondary" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => navigate('/login', { state: { mode: 'register' } })}>
                Sign Up
              </button>
              <button className="btn btn-primary" onClick={() => navigate('/login')}>
                Login
              </button>
            </>
          )}
        </div>
      </header>

      <div className="search-container">
        <button className="home-button" onClick={cycleTagline} title="Click for a new quote">
          <h1 className="site-title"><span className="logo-accent">Final</span>Take</h1>
          <p className="site-tagline">"{tagline.text}"</p>
          <p className="site-tagline-attribution">— {tagline.attribution}</p>
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
            <div className="filter-menu-wrapper">
              <button
                type="button"
                className="type-filter filter-menu-button"
                onClick={() => setShowFilterMenu(!showFilterMenu)}
              >
                Filters ▾
              </button>

              {showFilterMenu && (
                <div className="filter-menu">

                  <div className="filter-section-title">Media Type</div>

                  {[
                    ['all', 'All Types'],
                    ['movie', 'Movies'],
                    ['tv', 'TV Shows'],
                    ['game', 'Games'],
                    ['book', 'Books'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className="filter-menu-item"
                      onClick={() => setSelectedType(value)}
                    >
                      <span>{selectedType === value ? '✓' : ''}</span>
                      {label}
                    </button>
                  ))}

                  <div className="filter-menu-divider"></div>

                  <div className="filter-section-title">Sort By</div>

                  {[
                    ['default', 'Default'],
                    ['highest', 'Highest Rated'],
                    ['lowest', 'Lowest Rated'],
                    ['popular', 'Most Popular'],
                    ['az', 'A–Z'],
                    ['newest', 'Newest'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className="filter-menu-item"
                      onClick={() => setSortBy(value)}
                    >
                      <span>{sortBy === value ? '✓' : ''}</span>
                      {label}
                    </button>
                  ))}

                </div>
              )}
            </div>
          </div>
          <div className="search-buttons">
            <button type="submit" className="btn btn-primary">
              Search
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleReset}
            >
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
                {sortedResults.map((media) => (
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
