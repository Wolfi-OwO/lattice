"""Score new data with the trained model.

    python -m src.models.predict data/raw/new.csv
"""

import sys
from pathlib import Path

import joblib
import pandas as pd

from src.config import load_config


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python -m src.models.predict <csv-path>")

    config = load_config()
    model = joblib.load(config.path("output", "model_path"))

    frame = pd.read_csv(Path(sys.argv[1]))
    frame["prediction"] = model.predict(frame)

    print(frame.head().to_string(index=False))


if __name__ == "__main__":
    main()
