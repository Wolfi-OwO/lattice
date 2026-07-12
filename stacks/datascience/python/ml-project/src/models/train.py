"""Train the model.

    python -m src.models.train

Reads config.yaml, writes models/model.joblib and reports/metrics.json.
"""

import json

import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline

from src.config import load_config
from src.data.load import load_raw
from src.features.build import build_preprocessor


def main() -> None:
    config = load_config()

    frame = load_raw(config.path("data", "raw_path"))
    target = config["data"]["target"]

    features = frame.drop(columns=[target])
    labels = frame[target]

    # Stratify so the class balance survives the split.
    x_train, x_test, y_train, y_test = train_test_split(
        features,
        labels,
        test_size=config["data"]["test_size"],
        random_state=config.seed,
        stratify=labels,
    )

    # Preprocessing lives *inside* the pipeline, so it is fitted on training
    # folds only — no leakage, and the saved artifact is deployable as-is.
    model = Pipeline(
        [
            ("preprocess", build_preprocessor(features)),
            (
                "classifier",
                RandomForestClassifier(
                    **config["model"]["params"], random_state=config.seed, n_jobs=-1
                ),
            ),
        ]
    )

    cv_scores = cross_val_score(model, x_train, y_train, cv=5, scoring="f1_weighted")
    model.fit(x_train, y_train)

    predictions = model.predict(x_test)
    metrics = {
        "cv_f1_mean": float(cv_scores.mean()),
        "cv_f1_std": float(cv_scores.std()),
        "test_f1_weighted": float(f1_score(y_test, predictions, average="weighted")),
        "report": classification_report(y_test, predictions, output_dict=True),
    }

    model_path = config.path("output", "model_path")
    metrics_path = config.path("output", "metrics_path")
    model_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)

    joblib.dump(model, model_path)
    metrics_path.write_text(json.dumps(metrics, indent=2))

    print(f"CV f1 (weighted): {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")
    print(f"Test f1 (weighted): {metrics['test_f1_weighted']:.3f}")
    print(f"Model  -> {model_path}")
    print(f"Metrics -> {metrics_path}")


if __name__ == "__main__":
    main()
