import pandas as pd

from src.features.build import build_preprocessor


def test_preprocessor_handles_mixed_types_and_missing_values():
    frame = pd.DataFrame(
        {
            "age": [30, None, 45],
            "city": ["Villach", "Wien", None],
        }
    )

    transformed = build_preprocessor(frame).fit_transform(frame)

    assert transformed.shape[0] == 3
    # Numeric column stays one; the two known cities become one-hot columns.
    assert transformed.shape[1] >= 3


def test_preprocessor_ignores_unseen_categories_at_predict_time():
    train = pd.DataFrame({"city": ["Villach", "Wien"]})
    preprocessor = build_preprocessor(train).fit(train)

    # handle_unknown="ignore" is what stops a new category crashing production.
    transformed = preprocessor.transform(pd.DataFrame({"city": ["Graz"]}))

    assert transformed.shape[0] == 1
