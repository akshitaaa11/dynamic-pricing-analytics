"""Project logging configuration."""

from __future__ import annotations

import logging
from typing import Optional


def configure_logging(level: str = "INFO", name: Optional[str] = None) -> logging.Logger:
    """Configure a logger for the project.

    Args:
        level: Logging level such as INFO or DEBUG.
        name: Optional logger name; defaults to the root logger.

    Returns:
        A configured logger instance.
    """
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
        logger.addHandler(handler)
    return logger
