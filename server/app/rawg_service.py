import requests
from flask import current_app


class RAWGService:
    def __init__(self):
        self.base_url = 'https://api.rawg.io/api'

    @property
    def api_key(self):
        return current_app.config['RAWG_API_KEY']

    def _get(self, path, params=None):
        params = params or {}
        params['key'] = self.api_key
        try:
            res = requests.get(f"{self.base_url}{path}", params=params, timeout=10)
            res.raise_for_status()
            return res.json()
        except requests.RequestException:
            return None

    def _normalize(self, item):
        """Normalize RAWG game to match our format"""
        return {
            'id': item.get('id'),
            'title': item.get('name', 'Unknown'),
            'type': 'game',
            'rating': round(item.get('rating', 0), 1),
            'imageUrl': item.get('background_image'),
            'releaseYear': item.get('released', '')[:4] if item.get('released') else None,
            'overview': item.get('description_raw', ''),
        }

    def search_games(self, query, page=1):
        """Search for games on RAWG"""
        data = self._get('/games', {'search': query, 'page': page})
        if data is None:
            return None
        
        results = [self._normalize(r) for r in data.get('results', [])]
        
        return {
            'results': results,
            'totalResults': data.get('count', len(results)),
            'totalPages': (data.get('count', 0) + 39) // 40,  # RAWG returns 40 per page
            'page': page,
        }

    def get_game(self, game_id):
        """Get full game details from RAWG"""
        data = self._get(f'/games/{game_id}')
        if data is None:
            return None
        
        genres = [g['name'] for g in data.get('genres', [])]
        platforms = [p['platform']['name'] for p in data.get('platforms', [])]
        
        # Get developer(s)
        developers = [d['name'] for d in data.get('developers', [])]
        developer = ', '.join(developers) if developers else None
        
        # Get cast/creators info
        cast = []
        if data.get('developers'):
            cast = [
                {'name': d['name'], 'character': 'Developer'}
                for d in data.get('developers', [])[:10]
            ]
        
        return {
            'id': data.get('id'),
            'title': data.get('name'),
            'type': 'game',
            'rating': round(data.get('rating', 0), 1),
            'releaseYear': data.get('released', '')[:4] if data.get('released') else None,
            'director': developer,
            'creator': developer,
            'description': data.get('description_raw', '') or data.get('description', ''),
            'genre': genres,
            'imageUrl': data.get('background_image'),
            'backdropUrl': data.get('background_image_additional'),
            'cast': cast,
            'platforms': platforms,
            'tagline': data.get('name_original', ''),
            'voteCount': data.get('reviews_count', 0),
        }

    def get_trending_games(self, page=1):
        """Get trending games — most recently added to user libraries, quality-filtered"""
        data = self._get('/games', {
            'ordering': '-added',
            'metacritic': '70,100',
            'page': page,
            'page_size': 20,
        })
        if data is None:
            return None
        data['results'] = [self._normalize(r) for r in data.get('results', [])]
        return data
