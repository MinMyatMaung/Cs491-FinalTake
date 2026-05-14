import os
from dotenv import load_dotenv

# Load .env from the server directory
basedir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
load_dotenv(os.path.join(basedir, '.env'))


class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')

    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        'sqlite:///' + os.path.join(basedir, 'finaltake.db')
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    TMDB_API_KEY = os.getenv('TMDB_API_KEY', '')
    TMDB_BASE_URL = 'https://api.themoviedb.org/3'
    TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

    RAWG_API_KEY = os.getenv('RAWG_API_KEY', '')
    RAWG_BASE_URL = 'https://api.rawg.io/api'

    GBOOKS_API_KEY = os.getenv('GBOOKS_API_KEY', '')
    GBOOKS_BASE_URL = 'https://www.googleapis.com/books/v1'

    GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
    GOOGLE_OAUTH_DEMO_ENABLED = os.getenv('GOOGLE_OAUTH_DEMO_ENABLED', 'True').lower() in ('1', 'true')

    EMAIL_PROVIDER_DOMAINS = {
        domain.strip().lower()
        for domain in os.getenv(
            'EMAIL_PROVIDER_DOMAINS',
            'gmail.com,googlemail.com,outlook.com,hotmail.com,live.com,msn.com,'
            'yahoo.com,ymail.com,icloud.com,me.com,mac.com,aol.com,proton.me,'
            'protonmail.com,zoho.com,gmx.com,mail.com,csu.fullerton.edu,fullerton.edu'
        ).split(',')
        if domain.strip()
    }

    DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() in ('1', 'true')

    CACHE_TYPE = 'SimpleCache'
    CACHE_DEFAULT_TIMEOUT = 300
