"""Compatibility wrapper for the registered auth blueprint."""

from .routes.auth import auth_bp

__all__ = ['auth_bp']
