"""API routes that query TMDB, RAWG, and Google Books as databases"""
from concurrent.futures import ThreadPoolExecutor
from flask import Blueprint, request, jsonify, current_app
from app.tmdb_service import TMDBService
from app.rawg_service import RAWGService
from app.gbooks_service import GoogleBooksService
from app import cache

bp = Blueprint('api', __name__, url_prefix='/api')
tmdb = TMDBService()
rawg = RAWGService()
gbooks = GoogleBooksService()


@bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'FinalTake API is running'}), 200


@bp.route('/search', methods=['GET'])
@cache.cached(timeout=3600, query_string=True)
def search():
    """
    Search for movies, TV shows, games, or books
    Query params:
    - query: search query (required)
    - type: 'movie', 'tv', 'game', 'book', or 'all' (default: 'all')
    - page: page number (default: 1)
    """
    query = (request.args.get('query') or request.args.get('q', '')).strip()
    media_type = request.args.get('type', 'all')
    page = request.args.get('page', 1, type=int)
    
    if not query:
        return jsonify({'error': 'Query parameter "query" is required'}), 400
    
    if media_type == 'all':
        app = current_app._get_current_object()

        def _run(fn, *args):
            with app.app_context():
                return fn(*args)

        with ThreadPoolExecutor(max_workers=3) as executor:
            f_tmdb = executor.submit(_run, tmdb.search_media, query, 'multi', page)
            f_rawg = executor.submit(_run, rawg.search_games, query, page)
            f_books = executor.submit(_run, gbooks.search_books, query, page)
            tmdb_results = f_tmdb.result()
            rawg_results = f_rawg.result()
            gbooks_results = f_books.result()

        results = []
        if tmdb_results:
            results.extend(tmdb_results.get('results', []))
        if rawg_results:
            results.extend(rawg_results.get('results', []))
        if gbooks_results:
            results.extend(gbooks_results.get('results', []))

        return jsonify({
            'results': results,
            'totalResults': len(results),
        }), 200
    
    elif media_type == 'game':
        # Only query RAWG when explicitly searching games
        results = rawg.search_games(query, page)
        if results is None:
            return jsonify({'error': 'Failed to fetch from RAWG API'}), 500
        return jsonify(results), 200
    
    elif media_type == 'book':
        # Only query Google Books when explicitly searching books
        results = gbooks.search_books(query, page)
        if results is None:
            return jsonify({'error': 'Failed to fetch from Google Books API'}), 500
        return jsonify(results), 200
    
    elif media_type in ['movie', 'tv']:
        results = tmdb.search_media(query, media_type, page)
        if results is None:
            return jsonify({'error': 'Failed to fetch from TMDB API'}), 500
        return jsonify(results), 200
    
    else:
        return jsonify({'error': 'Type must be "movie", "tv", "game", "book", or "all"'}), 400


@bp.route('/movie/<int:movie_id>', methods=['GET'])
@cache.cached(timeout=86400)
def get_movie(movie_id):
    """Get movie details from TMDB"""
    movie = tmdb.get_movie(movie_id)
    
    if movie is None:
        return jsonify({'error': 'Failed to fetch movie details'}), 500
    
    if 'success' in movie and not movie['success']:
        return jsonify({'error': 'Movie not found'}), 404
    
    return jsonify(movie), 200


@bp.route('/tv/<int:tv_id>', methods=['GET'])
@cache.cached(timeout=86400)
def get_tv(tv_id):
    """Get TV show details from TMDB"""
    tv = tmdb.get_tv(tv_id)
    
    if tv is None:
        return jsonify({'error': 'Failed to fetch TV show details'}), 500
    
    if 'success' in tv and not tv['success']:
        return jsonify({'error': 'TV show not found'}), 404
    
    return jsonify(tv), 200


@bp.route('/genres', methods=['GET'])
@cache.cached(timeout=86400, query_string=True)
def get_genres():
    """Get list of genres"""
    media_type = request.args.get('type', 'movie')
    
    if media_type not in ['movie', 'tv']:
        return jsonify({'error': 'Type must be "movie" or "tv"'}), 400
    
    genres = tmdb.get_genres(media_type)
    
    if genres is None:
        return jsonify({'error': 'Failed to fetch genres'}), 500
    
    return jsonify(genres), 200



@bp.route('/trending-all', methods=['GET'])
@cache.cached(timeout=14400)
def get_trending_all():
    """Get trending movies, TV shows, games, and books in one call (optimized)"""
    try:
        app = current_app._get_current_object()

        def _run(fn, *args):
            with app.app_context():
                return fn(*args)

        with ThreadPoolExecutor(max_workers=4) as executor:
            f_movies = executor.submit(_run, tmdb.get_trending, 'movie', 'week')
            f_shows = executor.submit(_run, tmdb.get_trending, 'tv', 'week')
            f_games = executor.submit(_run, rawg.get_trending_games)
            f_books = executor.submit(_run, gbooks.get_trending_books)
            movies = f_movies.result()
            shows = f_shows.result()
            games = f_games.result()
            books = f_books.result()

        return jsonify({
            'movies': movies.get('results', []) if movies else [],
            'shows': shows.get('results', []) if shows else [],
            'games': games.get('results', []) if games else [],
            'books': books.get('results', []) if books else [],
        }), 200
    except Exception:
        return jsonify({'error': 'Failed to fetch trending data'}), 500


@bp.route('/trending', methods=['GET'])
@cache.cached(timeout=14400, query_string=True)
def get_trending():
    """Get trending movies/shows/games/books"""
    media_type = request.args.get('type', 'movie')
    time_window = request.args.get('window', 'week')
    
    if media_type not in ['movie', 'tv', 'game', 'book']:
        return jsonify({'error': 'Type must be "movie", "tv", "game", or "book"'}), 400
    
    if media_type == 'game':
        trending = rawg.get_trending_games()
        if trending is None:
            return jsonify({'error': 'Failed to fetch trending games'}), 500
        return jsonify(trending), 200
    
    if media_type == 'book':
        trending = gbooks.get_trending_books()
        if trending is None:
            return jsonify({'error': 'Failed to fetch trending books'}), 500
        return jsonify(trending), 200
    
    if time_window not in ['day', 'week']:
        return jsonify({'error': 'Window must be "day" or "week"'}), 400
    
    trending = tmdb.get_trending(media_type, time_window)
    
    if trending is None:
        return jsonify({'error': 'Failed to fetch trending'}), 500
    
    return jsonify(trending), 200


@bp.route('/popular', methods=['GET'])
@cache.cached(timeout=7200, query_string=True)
def get_popular():
    """Get popular movies/shows"""
    media_type = request.args.get('type', 'movie')
    page = request.args.get('page', 1, type=int)
    
    if media_type not in ['movie', 'tv']:
        return jsonify({'error': 'Type must be "movie" or "tv"'}), 400
    
    popular = tmdb.get_popular(media_type, page)
    
    if popular is None:
        return jsonify({'error': 'Failed to fetch popular media'}), 500
    
    return jsonify(popular), 200


@bp.route('/top-rated', methods=['GET'])
@cache.cached(timeout=7200, query_string=True)
def get_top_rated():
    """Get top rated movies/shows"""
    media_type = request.args.get('type', 'movie')
    page = request.args.get('page', 1, type=int)
    
    if media_type not in ['movie', 'tv']:
        return jsonify({'error': 'Type must be "movie" or "tv"'}), 400
    
    top_rated = tmdb.get_top_rated(media_type, page)
    
    if top_rated is None:
        return jsonify({'error': 'Failed to fetch top rated media'}), 500
    
    return jsonify(top_rated), 200


@bp.route('/media/<media_type>/<int:media_id>', methods=['GET'])
@cache.cached(timeout=86400)
def get_media_details(media_type, media_id):
    """Get details for a movie, TV show, or game by type and ID"""
    if media_type == 'movie':
        data = tmdb.get_movie(media_id)
    elif media_type == 'tv':
        data = tmdb.get_tv(media_id)
    elif media_type == 'game':
        data = rawg.get_game(media_id)
    else:
        return jsonify({'error': 'media_type must be "movie", "tv", or "game"'}), 400

    if data is None:
        return jsonify({'error': 'Failed to fetch media details'}), 500

    return jsonify(data), 200


@bp.route('/media/book/<string:book_id>', methods=['GET'])
@cache.cached(timeout=86400)
def get_book_details(book_id):
    """Get details for a book by ID"""
    data = gbooks.get_book(book_id)
    
    if data is None:
        return jsonify({'error': 'Failed to fetch book details'}), 500

    return jsonify(data), 200