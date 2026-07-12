# {{projectTitle}}

ML project — pandas, scikit-learn, JupyterLab.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

# Put your dataset at data/raw/dataset.csv, then:
python -m src.models.train
python -m src.models.predict data/raw/new.csv

jupyter lab
pytest
```

## Layout

```
config.yaml           Every knob that changes a result
data/
├── raw/              Immutable input. Never written to.
└── processed/        Derived — always regenerable from raw/
notebooks/            Exploration and figures. No logic.
src/
├── config.py         Loads config.yaml
├── data/load.py      I/O
├── features/build.py The sklearn preprocessing pipeline
└── models/
    ├── train.py      python -m src.models.train
    └── predict.py    python -m src.models.predict <csv>
models/               Trained artifacts (.joblib) — gitignored
reports/              metrics.json and figures — gitignored
tests/
```

## The three rules

**Notebooks look; `src/` does.** A notebook cell you would run twice belongs in
`src/` where it can be imported, tested and run from a terminal. `%autoreload 2`
is already set up so editing `src/` takes effect without a kernel restart.

**Preprocessing lives inside the sklearn Pipeline.** Not as a step you run over
the whole dataframe first. Fitting a scaler or imputer before the train/test
split leaks test statistics into training — it is the single most common reason
a notebook reports a score that does not survive contact with real data. It also
means `model.joblib` is deployable on its own: it carries its own preprocessing.

**Config, not constants.** `config.yaml` holds the seed, the paths, the
hyperparameters. Reproducing a run means checking out the commit and running
`python -m src.models.train` — not scrolling for the cell where `n_estimators`
was last edited.

## Data is not source code

`data/` and `models/` are gitignored. Git handles neither large binaries nor
their history well. Track them with DVC, or keep them in object storage and
document how to fetch them here.
