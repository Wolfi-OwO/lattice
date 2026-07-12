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
