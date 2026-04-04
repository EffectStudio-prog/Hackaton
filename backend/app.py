try:
    from .main import app
except ImportError:  # pragma: no cover - allows running as a top-level module
    from main import app  # type: ignore
