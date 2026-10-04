"""ASGI entrypoint: ``uvicorn flowd_ml.main:app``. Settings come from ``ML_*`` environment variables."""

from .api.app import create_app

app = create_app()
