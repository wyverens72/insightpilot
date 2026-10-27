import csv
import hashlib
import io
import json
from datetime import date

from .analysis import classify
from .db import connect

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 5000


class ImportProblem(ValueError):
    pass


def import_csv(path, content):
    if len(content) > MAX_BYTES:
        raise ImportProblem("The file exceeds the 2 MB limit.")
    try:
        reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")), strict=True)
        if not reader.fieldnames or len(set(reader.fieldnames)) != len(
            reader.fieldnames
        ):
            raise ImportProblem(
                "Use unique column headers: text, rating, date, source."
            )
        if "text" not in reader.fieldnames:
            raise ImportProblem("The CSV must include a text column.")
        valid, errors = [], []
        for number, row in enumerate(reader, start=2):
            if number > MAX_ROWS + 1:
                raise ImportProblem("Import at most 5,000 reviews at a time.")
            try:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError("Column count does not match the header.")
                text = row["text"].strip()
                if not 3 <= len(text) <= 10000:
                    raise ValueError("Review text must contain 3–10,000 characters.")
                raw_rating = row.get("rating", "").strip()
                rating = int(raw_rating) if raw_rating else None
                if rating is not None and not 1 <= rating <= 5:
                    raise ValueError("Rating must be an integer from 1 to 5.")
                raw_date = row.get("date", "").strip()
                review_date = (
                    date.fromisoformat(raw_date).isoformat()
                    if raw_date
                    else date.today().isoformat()
                )
                source = row.get("source", "").strip() or "CSV import"
                if len(source) > 80:
                    raise ValueError("Source must contain at most 80 characters.")
                sentiment, topics = classify(text, rating)
                fingerprint = hashlib.sha256(
                    json.dumps([text, rating, review_date, source]).encode()
                ).hexdigest()
                valid.append(
                    (
                        fingerprint,
                        text,
                        rating,
                        review_date,
                        source,
                        sentiment,
                        json.dumps(topics),
                    )
                )
            except ValueError as exc:
                errors.append({"row": number, "message": str(exc)})
    except (UnicodeDecodeError, csv.Error) as exc:
        raise ImportProblem(
            "Use a valid UTF-8 CSV file with quoted fields where needed."
        ) from exc
    if not valid and not errors:
        raise ImportProblem("The CSV contains no reviews.")
    inserted = 0
    with connect(path) as db:
        for row in valid:
            inserted += db.execute(
                "INSERT OR IGNORE INTO reviews (fingerprint,text,rating,date,source,sentiment,topics) VALUES (?,?,?,?,?,?,?)",
                row,
            ).rowcount
    return {
        "imported": inserted,
        "duplicates": len(valid) - inserted,
        "rejected": len(errors),
        "errors": errors[:50],
    }
