from fastapi import APIRouter

from app.api.routes import health, products, users

# One place that knows every route module. Add a file under routes/, include it
# here, and nothing else in the app changes.
api_router = APIRouter(prefix="/api")

api_router.include_router(health.router)
api_router.include_router(users.router)
api_router.include_router(products.router)
