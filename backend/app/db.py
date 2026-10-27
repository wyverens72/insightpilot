import json
import sqlite3
from contextlib import contextmanager


@contextmanager
def connect(path):
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize(path):
    with connect(path) as db:
        db.execute("""CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE,
            text TEXT NOT NULL, rating INTEGER, date TEXT NOT NULL,
            source TEXT NOT NULL, sentiment TEXT NOT NULL, topics TEXT NOT NULL
        )""")


def get_reviews(path, source=None, sentiment=None, query=None):
    conditions, values = [], []
    for field, value in (("source", source), ("sentiment", sentiment)):
        if value:
            conditions.append(f"{field} = ?")
            values.append(value)
    if query:
        conditions.append("instr(lower(text), lower(?)) > 0")
        values.append(query)
    sql = "SELECT * FROM reviews" + (
        " WHERE " + " AND ".join(conditions) if conditions else ""
    )
    with connect(path) as db:
        rows = db.execute(sql + " ORDER BY date DESC, id DESC", values).fetchall()
    return [
        {
            **{
                k: r[k] for k in ("id", "text", "rating", "date", "source", "sentiment")
            },
            "topics": json.loads(r["topics"]),
        }
        for r in rows
    ]
