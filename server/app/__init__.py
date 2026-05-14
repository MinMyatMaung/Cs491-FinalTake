from flask import Flask
from flask_cors import CORS
from flask_caching import Cache
from .config import Config
from .models import db

cache = Cache()


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
        r"/api/*": {"origins": ["http://localhost:5173", "http://localhost:3000"]},
        r"/auth/*": {"origins": ["http://localhost:5173", "http://localhost:3000"]}
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

    return app