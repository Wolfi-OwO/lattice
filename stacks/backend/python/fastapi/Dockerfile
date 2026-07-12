FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Run unprivileged.
RUN useradd --create-home appuser
USER appuser

EXPOSE {{port}}
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "{{port}}"]
