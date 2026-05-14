import re
import requests
from flask import current_app


def _strip_html(text):
    if not text:
        return ''
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    return text.strip()


class GoogleBooksService:
    def __init__(self):
        self.base_url = 'https://www.googleapis.com/books/v1'

    @property
    def api_key(self):
        return current_app.config['GBOOKS_API_KEY']

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
        """Normalize Google Books result to match our format"""
        volume_info = item.get('volumeInfo', {})
        image_url = volume_info.get('imageLinks', {}).get('thumbnail', '')
        
        # Google Books uses 0-5 rating scale
        rating = volume_info.get('averageRating', 0)
        
        authors = volume_info.get('authors', [])
        author_str = ', '.join(authors) if authors else 'Unknown Author'
        
        published_date = volume_info.get('publishedDate', '')
        year = published_date[:4] if published_date else None
        
        return {
            'id': item.get('id'),
            'title': volume_info.get('title', 'Unknown'),
            'type': 'book',
            'rating': round(rating, 1) if rating else 0,
            'imageUrl': image_url if image_url else None,
            'releaseYear': year,
            'overview': _strip_html(volume_info.get('description', '')),
            'author': author_str,
        }

    def search_books(self, query, page=1):
        """Search for books on Google Books"""
        start_index = (page - 1) * 10  # Google Books uses 0-based index
        data = self._get('/volumes', {
            'q': query,
            'startIndex': start_index,
            'maxResults': 10
        })
        if data is None:
            return None
        
        results = [self._normalize(r) for r in data.get('items', [])]
        
        return {
            'results': results,
            'totalResults': data.get('totalItems', len(results)),
            'totalPages': (data.get('totalItems', 0) + 9) // 10,  # Google Books returns 10 per page max
            'page': page,
        }

    def get_book(self, book_id):
        """Get full book details from Google Books"""
        data = self._get(f'/volumes/{book_id}')
        if data is None:
            return None
        
        volume_info = data.get('volumeInfo', {})
        image_url = volume_info.get('imageLinks', {}).get('thumbnail', '')
        backdrop_url = volume_info.get('imageLinks', {}).get('medium', '')
        
        authors = volume_info.get('authors', [])
        author_str = ', '.join(authors) if authors else 'Unknown Author'
        
        genres = volume_info.get('categories', [])
        
        published_date = volume_info.get('publishedDate', '')
        year = published_date[:4] if published_date else None
        
        rating = volume_info.get('averageRating', 0)
        
        return {
            'id': data.get('id'),
            'title': volume_info.get('title'),
            'type': 'book',
            'rating': round(rating, 1) if rating else 0,
            'releaseYear': year,
            'author': author_str,
            'creator': author_str,
            'director': author_str,
            'description': _strip_html(volume_info.get('description', '')),
            'genre': genres,
            'imageUrl': image_url if image_url else None,
            'backdropUrl': backdrop_url if backdrop_url else None,
            'cast': [{'name': a, 'character': 'Author'} for a in authors],
            'publisher': volume_info.get('publisher', ''),
            'pages': volume_info.get('pageCount', 0),
            'language': volume_info.get('language', ''),
            'tagline': volume_info.get('title', ''),
            'voteCount': volume_info.get('ratingsCount', 0),
        }

    def get_trending_books(self, page=1):
        """Get trending books — bestsellers + recent popular fiction, merged and deduplicated"""
        bestsellers = self._get('/volumes', {
            'q': 'bestseller',
            'orderBy': 'relevance',
            'startIndex': 0,
            'maxResults': 12,
        })
        recent_fiction = self._get('/volumes', {
            'q': 'subject:fiction',
            'orderBy': 'newest',
            'startIndex': 0,
            'maxResults': 12,
        })

        seen = set()
        results = []
        for source in [bestsellers, recent_fiction]:
            if source:
                for item in source.get('items', []):
                    if item.get('id') not in seen:
                        seen.add(item['id'])
                        results.append(self._normalize(item))

        return {'results': results[:20]}
