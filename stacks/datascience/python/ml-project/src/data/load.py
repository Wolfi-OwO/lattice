from pathlib import Path

import pandas as pd


def load_raw(path: Path) -> pd.DataFrame:
    """Read the immutable source data. Nothing in this project ever writes to
    data/raw/ — that is what makes a run reproducible from scratch."""
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Put the source dataset there, or point "
            f"config.yaml:data.raw_path somewhere else."
        )
    return pd.read_csv(path)


def save_processed(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(path, index=False)
