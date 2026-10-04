"""HTTP API: the FastAPI application factory and routes."""

from .app import create_app

__all__ = ["create_app"]
