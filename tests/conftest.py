import os
import uuid

import psycopg
import pytest

from pipeline import db


@pytest.fixture
def conn():
    """Real Postgres in a throwaway schema (needs pgvector + pg_trgm). Skipped without
    TEST_DATABASE_URL; CI sets it to a service container. Never point it at data you care about
    without a spare schema: tables are created and dropped only inside the temp schema."""
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set")
    schema = f"t_{uuid.uuid4().hex[:8]}"
    c = psycopg.connect(url, autocommit=True)
    c.execute("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public")
    c.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public")
    c.execute(f"CREATE SCHEMA {schema}")
    c.execute(f"SET search_path TO {schema}, public")
    db.apply_schema(c)
    try:
        yield c
    finally:
        c.execute(f"DROP SCHEMA {schema} CASCADE")
        c.close()
