from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# Import models so db.create_all() registers all tables
from . import user      # noqa: E402, F401
from . import favorite  # noqa: E402, F401
from . import review    # noqa: E402, F401
