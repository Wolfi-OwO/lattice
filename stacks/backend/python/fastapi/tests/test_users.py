from app.core.security import create_access_token


def test_creates_user_and_never_returns_the_password_hash(client):
    response = client.post(
        "/api/users",
        json={"email": "ada@example.com", "name": "Ada", "password": "supersecret"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "ada@example.com"
    assert "password_hash" not in body


def test_rejects_invalid_payload_with_field_level_details(client):
    response = client.post(
        "/api/users",
        json={"email": "not-an-email", "name": "A", "password": "short"},
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["message"] == "Validation failed"
    assert len(error["details"]) >= 2


def test_refuses_a_duplicate_email(client):
    payload = {"email": "dup@example.com", "name": "Dup", "password": "supersecret"}

    assert client.post("/api/users", json=payload).status_code == 201
    assert client.post("/api/users", json=payload).status_code == 409


def test_delete_requires_authentication(client):
    response = client.delete("/api/users/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 401


def test_carries_both_timestamps_and_touches_updated_at_on_a_write(client):
    """The user shape is the same in every backend in this repository
    (CONVENTIONS rule 3), so a missing `updated_at` here is a broken promise,
    not a cosmetic omission."""
    created = client.post(
        "/api/users",
        json={"email": "grace@example.com", "name": "Grace", "password": "supersecret"},
    ).json()

    assert created["created_at"]
    assert created["updated_at"]

    token = create_access_token(subject=created["id"], role="user")
    patched = client.patch(
        f"/api/users/{created['id']}",
        json={"name": "Grace Hopper"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert patched.status_code == 200
    body = patched.json()
    assert body["name"] == "Grace Hopper"
    assert "password_hash" not in body
    assert body["created_at"] == created["created_at"]
    assert body["updated_at"] > created["updated_at"]
