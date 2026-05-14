from flask import Flask
from flask_cors import CORS
from flask_caching import Cache
from sqlalchemy import inspect
from .config import Config
from .models import db

cache = Cache()


def _ensure_auth_columns(app):
    """Add auth columns for existing demo SQLite/Postgres databases."""
    required_columns = {
        'auth_provider': "VARCHAR(20) NOT NULL DEFAULT 'local'",
        'failed_login_attempts': 'INTEGER NOT NULL DEFAULT 0',
        'locked_until': 'TIMESTAMP NULL',
        'twofa_enabled': 'BOOLEAN NOT NULL DEFAULT FALSE',
        'twofa_code_hash': 'VARCHAR(255) NULL',
        'twofa_expires_at': 'TIMESTAMP NULL',
        'reset_token_hash': 'VARCHAR(255) NULL',
        'reset_token_expires_at': 'TIMESTAMP NULL',
    }

    inspector = inspect(db.engine)
    if 'users' not in inspector.get_table_names():
        return

    existing_columns = {column['name'] for column in inspector.get_columns('users')}
    for column_name, column_type in required_columns.items():
        if column_name not in existing_columns:
            db.session.execute(db.text(f'ALTER TABLE users ADD COLUMN {column_name} {column_type}'))

    db.session.commit()


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)

    # Initialize extensions
    db.init_app(app)
    cache.init_app(app)

    # Allow requests from the Vite dev server
    CORS(app, resources={
    r"/api/*": {"origins": ["http://localhost:5173", "http://localhost:3000", "https://cs491-final-take.vercel.app"]},
    r"/auth/*": {"origins": ["http://localhost:5173", "http://localhost:3000", "https://cs491-final-take.vercel.app"]}
    })

    from .api_routes import bp
    app.register_blueprint(bp)

    from .routes.auth import auth_bp
    app.register_blueprint(auth_bp)

    from .routes.favorites import favorites_bp
    app.register_blueprint(favorites_bp)

    from .routes.reviews import reviews_bp
    app.register_blueprint(reviews_bp)

    # Create database tables
    with app.app_context():
        db.create_all()
        _ensure_auth_columns(app)

    return app
