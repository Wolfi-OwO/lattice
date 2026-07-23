from app.core.security import create_access_token


def auth(role: str = "user") -> dict[str, str]:
    """A bearer header for a token this app will accept. The template ships JWT
    verification but no login endpoint — how a token is obtained is an
    application decision — so the tests sign their own against the same secret."""
    return {"Authorization": f"Bearer {create_access_token(subject='test', role=role)}"}


def make_product(client, **overrides):
    payload = {"sku": "WIDGET-1", "name": "Widget", "price_cents": 1999}
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=auth())
    assert response.status_code == 201, response.text
    return response.json()


def test_creates_a_product(client):
    product = make_product(client, sku="ANVIL-1", name="Anvil", price_cents=4500, stock=3)

    assert product["sku"] == "ANVIL-1"
    assert product["price_cents"] == 4500
    assert product["stock"] == 3
    assert product["id"]
    assert "cost_price" not in product  # the response is the DTO, not the row


def test_create_requires_authentication(client):
    response = client.post(
        "/api/products", json={"sku": "WIDGET-1", "name": "Widget", "price_cents": 100}
    )
    assert response.status_code == 401


def test_defaults_stock_to_zero(client):
    assert make_product(client)["stock"] == 0


def test_rejects_a_float_price(client):
    # The whole reason money is integer cents. pydantic rejects a float for an
    # int field, so this never reaches the service.
    response = client.post(
        "/api/products",
        json={"sku": "WIDGET-1", "name": "Widget", "price_cents": 19.99},
        headers=auth(),
    )
    assert response.status_code == 422


def test_rejects_a_negative_price(client):
    response = client.post(
        "/api/products",
        json={"sku": "WIDGET-1", "name": "Widget", "price_cents": -1},
        headers=auth(),
    )
    assert response.status_code == 422


def test_rejects_a_malformed_sku(client):
    response = client.post(
        "/api/products",
        json={"sku": "no spaces allowed", "name": "Widget", "price_cents": 100},
        headers=auth(),
    )
    assert response.status_code == 422


def test_refuses_a_duplicate_sku(client):
    make_product(client)
    response = client.post(
        "/api/products",
        json={"sku": "WIDGET-1", "name": "Other", "price_cents": 100},
        headers=auth(),
    )
    assert response.status_code == 409


def test_treats_sku_case_insensitively_when_refusing_a_duplicate(client):
    # The service uppercases on write, so `widget-1` and `WIDGET-1` are one
    # product. Postgres refuses the second on a UNIQUE index; SQLite (the test
    # store) refuses it only because of that uppercasing — nothing else checks it.
    make_product(client)
    response = client.post(
        "/api/products",
        json={"sku": "widget-1", "name": "Other", "price_cents": 100},
        headers=auth(),
    )
    assert response.status_code == 409


def test_stores_the_sku_uppercased(client):
    assert make_product(client, sku="widget-1")["sku"] == "WIDGET-1"


def test_list_is_public_and_paginates(client):
    make_product(client, sku="WIDGET-1")
    make_product(client, sku="WIDGET-2")

    response = client.get("/api/products?page=1&limit=1")
    assert response.status_code == 200

    body = response.json()
    assert set(body) == {"items", "total", "page", "limit", "pages"}
    assert len(body["items"]) == 1
    assert body["total"] == 2
    assert body["pages"] == 2


def test_finds_a_product_by_sku_fragment(client):
    make_product(client, sku="WIDGET-1")
    make_product(client, sku="OTHER-9", name="Other")

    body = client.get("/api/products?q=OTHER").json()
    assert body["total"] == 1
    assert body["items"][0]["sku"] == "OTHER-9"


def test_get_404s_an_unknown_id(client):
    response = client.get("/api/products/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


def test_updates_a_field(client):
    product = make_product(client, name="Before")

    response = client.patch(
        f"/api/products/{product['id']}", json={"name": "After"}, headers=auth()
    )
    assert response.status_code == 200
    assert response.json()["name"] == "After"
    assert response.json()["sku"] == product["sku"]


def test_update_requires_authentication(client):
    product = make_product(client)
    response = client.patch(f"/api/products/{product['id']}", json={"name": "Nobody"})
    assert response.status_code == 401


def test_refuses_a_sku_taken_by_another_product(client):
    first = make_product(client, sku="WIDGET-1")
    second = make_product(client, sku="WIDGET-2")

    response = client.patch(
        f"/api/products/{second['id']}", json={"sku": first["sku"]}, headers=auth()
    )
    assert response.status_code == 409


def test_allows_a_product_to_keep_its_own_sku(client):
    # The conflict check excludes the row being edited; without that exclusion any
    # PATCH carrying the unchanged sku would 409 against itself.
    product = make_product(client)
    response = client.patch(
        f"/api/products/{product['id']}",
        json={"sku": product["sku"], "name": "Renamed"},
        headers=auth(),
    )
    assert response.status_code == 200


def test_patch_ignores_stock(client):
    # `stock` is not on ProductUpdate, so pydantic drops it and the value is not
    # applied. Stock moves through /stock as a delta so a concurrent sale cannot
    # be clobbered by a stale absolute; what matters is that stock did NOT change.
    product = make_product(client, stock=5)
    response = client.patch(f"/api/products/{product['id']}", json={"stock": 999}, headers=auth())
    assert response.status_code == 200
    assert response.json()["stock"] == 5


def test_adds_and_removes_stock(client):
    product = make_product(client, stock=2)

    added = client.post(f"/api/products/{product['id']}/stock", json={"delta": 3}, headers=auth())
    assert added.status_code == 200
    assert added.json()["stock"] == 5

    removed = client.post(
        f"/api/products/{product['id']}/stock", json={"delta": -2}, headers=auth()
    )
    assert removed.json()["stock"] == 3


def test_refuses_to_take_stock_below_zero_and_leaves_it_untouched(client):
    # A rejected movement that still wrote would be worse than no check at all.
    product = make_product(client, stock=1)

    response = client.post(
        f"/api/products/{product['id']}/stock", json={"delta": -2}, headers=auth()
    )
    assert response.status_code == 409

    after = client.get(f"/api/products/{product['id']}")
    assert after.json()["stock"] == 1


def test_rejects_a_zero_delta(client):
    product = make_product(client)
    response = client.post(
        f"/api/products/{product['id']}/stock", json={"delta": 0}, headers=auth()
    )
    assert response.status_code == 400


def test_stock_requires_authentication(client):
    product = make_product(client)
    response = client.post(f"/api/products/{product['id']}/stock", json={"delta": 1})
    assert response.status_code == 401


def test_delete_requires_authentication(client):
    product = make_product(client)
    assert client.delete(f"/api/products/{product['id']}").status_code == 401


def test_delete_refuses_a_non_admin(client):
    product = make_product(client)
    response = client.delete(f"/api/products/{product['id']}", headers=auth("user"))
    assert response.status_code == 403


def test_admin_can_delete(client):
    product = make_product(client)
    assert client.delete(f"/api/products/{product['id']}", headers=auth("admin")).status_code == 204
    assert client.get(f"/api/products/{product['id']}").status_code == 404
