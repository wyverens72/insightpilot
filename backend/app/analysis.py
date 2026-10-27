"""Transparent review classification and aggregate metrics."""

import re
from collections import Counter, defaultdict

TOPICS = {
    "Performance": (
        "slow",
        "fast",
        "speed",
        "load",
        "crash",
        "lag",
        "performance",
        "freeze",
    ),
    "Ease of use": (
        "easy",
        "intuitive",
        "confusing",
        "navigation",
        "interface",
        "onboarding",
        "setup",
    ),
    "Pricing": (
        "price",
        "pricing",
        "expensive",
        "cost",
        "subscription",
        "value",
        "affordable",
    ),
    "Support": ("support", "helpful", "response", "service", "ticket"),
    "Features": (
        "feature",
        "export",
        "integration",
        "search",
        "filter",
        "report",
        "dashboard",
    ),
}
POSITIVE = {
    "love",
    "great",
    "excellent",
    "easy",
    "fast",
    "helpful",
    "intuitive",
    "affordable",
    "reliable",
    "amazing",
}
NEGATIVE = {
    "slow",
    "bad",
    "crash",
    "confusing",
    "expensive",
    "broken",
    "poor",
    "frustrating",
    "terrible",
    "unreliable",
}


def classify(text, rating=None):
    words = set(re.findall(r"[a-z]+", text.lower()))
    score = len(words & POSITIVE) - len(words & NEGATIVE)
    # Ratings are explicit feedback; use text only when no rating is supplied.
    sentiment = (
        ("positive" if rating >= 4 else "negative" if rating <= 2 else "neutral")
        if rating
        else ("positive" if score > 0 else "negative" if score < 0 else "neutral")
    )
    topics = [
        name for name, terms in TOPICS.items() if any(term in words for term in terms)
    ]
    return sentiment, topics or ["Other"]


def summarize(reviews):
    counts = Counter(r["sentiment"] for r in reviews)
    ratings = [r["rating"] for r in reviews if r["rating"] is not None]
    topics = defaultdict(lambda: {"count": 0, "negative": 0, "positive": 0})
    trend = defaultdict(
        lambda: {"count": 0, "positive": 0, "negative": 0, "neutral": 0}
    )
    for review in reviews:
        for topic in review["topics"]:
            topics[topic]["count"] += 1
            if review["sentiment"] in ("negative", "positive"):
                topics[topic][review["sentiment"]] += 1
        bucket = trend[review["date"][:7]]
        bucket["count"] += 1
        bucket[review["sentiment"]] += 1
    return {
        "total": len(reviews),
        "average_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "positive_share": round(counts["positive"] * 100 / len(reviews))
        if reviews
        else 0,
        "sentiments": {s: counts[s] for s in ("positive", "neutral", "negative")},
        "topics": sorted(
            [{"name": k, **v} for k, v in topics.items()],
            key=lambda x: (-x["count"], x["name"]),
        ),
        "trend": [{"month": k, **v} for k, v in sorted(trend.items())],
        "sources": sorted(set(r["source"] for r in reviews)),
    }
