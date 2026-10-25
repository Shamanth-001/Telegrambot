"""
query_parser.py — Split a user's search like "game of thrones s1e1" into
(title, season, episode). Shared by the bot and the API.
"""
import re

_PATTERNS = [
    # s01e01, s1e1, s1 e1, s01.e01
    re.compile(r"(?<![\w'’])s(?:eason)?\s*\.?(\d{1,2})\s*[ ._-]?\s*e(?:p(?:isode)?)?\s*\.?(\d{1,3})\b", re.I),
    # season 1 episode 1, season 1 ep 1, season 1, episode 1
    re.compile(r"\bseason\s*(\d{1,2})\s*,?\s*(?:ep(?:isode)?|e)\s*\.?\s*(\d{1,3})\b", re.I),
    # 1x01
    re.compile(r"\b(\d{1,2})x(\d{2,3})\b", re.I),
]
_SEASON_ONLY = re.compile(r"(?<![\w'’])(?:s|season)\s*\.?(\d{1,2})\b(?!\s*[ ._-]?\s*e\d)", re.I)


def parse_query(text: str) -> tuple[str, int, int]:
    """
    >>> parse_query("game of thrones s1e1")
    ('game of thrones', 1, 1)
    >>> parse_query("Game of Thrones season 1 episode 1")
    ('Game of Thrones', 1, 1)
    >>> parse_query("breaking bad season 2")
    ('breaking bad', 2, 0)
    >>> parse_query("Interstellar")
    ('Interstellar', 0, 0)
    """
    text = (text or "").strip()
    for pat in _PATTERNS:
        m = pat.search(text)
        if m:
            title = (text[:m.start()] + " " + text[m.end():]).strip(" -,:")
            return re.sub(r"\s+", " ", title), int(m.group(1)), int(m.group(2))
    m = _SEASON_ONLY.search(text)
    if m:
        title = (text[:m.start()] + " " + text[m.end():]).strip(" -,:")
        # A bare "S" or "season" number at the end is a season, e.g. "dark s2"
        title = re.sub(r"\s+", " ", title)
        if title:
            return title, int(m.group(1)), 0
    return text, 0, 0
