import requests
from flask import current_app


class TMDBService:
    def __init__(self):
        self.base_url = 'https://api.themoviedb.org/3'
        self.image_base = 'https://image.tmdb.org/t/p/w500'

    @property
    def api_key(self):
        return current_app.config['TMDB_API_KEY']

    def _get(self, path, params=None):
        params = params or {}
        params['api_key'] = self.api_key
        try:
            res = requests.get(f"{self.base_url}{path}", params=params, timeout=10)
            res.raise_for_status()
            return res.json()
        except requests.RequestException:
            return None

    def _normalize(self, item, media_type=None):
        mtype = media_type or item.get('media_type', 'movie')
        poster = item.get('poster_path')
        return {
            'id': item.get('id'),
            'title': item.get('title') or item.get('name', 'Unknown'),
            'type': mtype,
            'rating': round(item.get('vote_average', 0) / 2, 1),
            'imageUrl': f"{self.image_base}{poster}" if poster else None,
            'releaseYear': (item.get('release_date') or item.get('first_air_date') or '')[:4] or None,
            'overview': item.get('overview', ''),
        }

    def search_media(self, query, media_type='multi', page=1):
        if media_type == 'multi':
            data = self._get('/search/multi', {'query': query, 'page': page})
            if data is None:
                return None
            results = [
                self._normalize(r)
                for r in data.get('results', [])
                if r.get('media_type') in ('movie', 'tv')
            ]
        else:
            data = self._get(f'/search/{media_type}', {'query': query, 'page': page})
            if data is None:
                return None
            results = [self._normalize(r, media_type) for r in data.get('results', [])]

        return {
            'results': results,
            'totalResults': data.get('total_results', len(results)),
            'totalPages': data.get('total_pages', 1),
            'page': data.get('page', 1),
        }

    def get_movie(self, movie_id):
        data = self._get(f'/movie/{movie_id}', {'append_to_response': 'credits'})
        if data is None:
            return None
        return self._build_details(data, 'movie')

    def get_tv(self, tv_id):
        data = self._get(f'/tv/{tv_id}', {'append_to_response': 'credits'})
        if data is None:
            return None
        return self._build_details(data, 'tv')

    def _build_details(self, data, media_type):
        image_base = self.image_base
        poster = data.get('poster_path')
        backdrop = data.get('backdrop_path')
        genres = [g['name'] for g in data.get('genres', [])]
        credits = data.get('credits', {})

        director = None
        creator = None
        if media_type == 'movie':
            crew = credits.get('crew', [])
            dirs = [p['name'] for p in crew if p.get('job') == 'Director']
            director = ', '.join(dirs) if dirs else None
        else:
            creators = data.get('created_by', [])
            creator = ', '.join(c['name'] for c in creators) if creators else None

        cast = [
            {'name': p['name'], 'character': p.get('character', '')}
            for p in credits.get('cast', [])[:10]
        ]

        release_year = (data.get('release_date') or data.get('first_air_date') or '')[:4] or None

        return {
            'id': data.get('id'),
            'title': data.get('title') or data.get('name'),
            'type': media_type,
            'rating': round(data.get('vote_average', 0) / 2, 1),
            'releaseYear': release_year,
            'director': director,
            'creator': creator,
            'description': data.get('overview', ''),
            'genre': genres,
            'imageUrl': f"{image_base}{poster}" if poster else None,
            'backdropUrl': f"https://image.tmdb.org/t/p/original{backdrop}" if backdrop else None,
            'cast': cast,
            'runtime': data.get('runtime'),
            'tagline': data.get('tagline', ''),
            'voteCount': data.get('vote_count', 0),
        }

    def get_genres(self, media_type='movie'):
        return self._get(f'/genre/{media_type}/list')

    def get_trending(self, media_type='movie', time_window='week'):
        data = self._get(f'/trending/{media_type}/{time_window}')
        if data is None:
            return None
        data['results'] = [self._normalize(r, media_type) for r in data.get('results', [])]
        return data

    def get_popular(self, media_type='movie', page=1):
        data = self._get(f'/{media_type}/popular', {'page': page})
        if data is None:
            return None
        data['results'] = [self._normalize(r, media_type) for r in data.get('results', [])]
        return data

    def get_top_rated(self, media_type='movie', page=1):
        data = self._get(f'/{media_type}/top_rated', {'page': page})
        if data is None:
            return None
        filtered = [r for r in data.get('results', []) if r.get('vote_count', 0) >= 5000]
        data['results'] = [self._normalize(r, media_type) for r in filtered]
        return data
