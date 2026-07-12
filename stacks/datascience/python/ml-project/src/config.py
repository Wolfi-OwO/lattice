from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Config:
    """Loaded from config.yaml. Frozen so nothing mutates it mid-run."""

    raw: dict[str, Any]

    def __getitem__(self, key: str) -> Any:
        return self.raw[key]

    @property
    def seed(self) -> int:
        return int(self.raw["seed"])

    def path(self, *keys: str) -> Path:
        """Resolve a config value that is a path, relative to the project root."""
        value: Any = self.raw
        for key in keys:
            value = value[key]
        return PROJECT_ROOT / str(value)


def load_config(path: Path | None = None) -> Config:
    config_path = path or PROJECT_ROOT / "config.yaml"
    with config_path.open() as handle:
        return Config(yaml.safe_load(handle))
