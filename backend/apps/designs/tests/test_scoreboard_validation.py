"""The presentation scoreboard saved with a design."""

import pytest

from apps.designs.exceptions import InvalidDocument
from apps.designs.validators import validate_document

from .helpers import make_doc

LIMIT = 12 * 1024 * 1024
BOARD = {
    "entries": [{"id": "team", "name": "Team", "score": -3}, {"id": "ann", "name": "Ann", "score": 0}],
    "cards": [{"pageId": "p1", "id": "c1", "entryId": None, "visible": False}],
}


def test_accepts_a_saved_scoreboard():
    validate_document(make_doc(scoreboard=BOARD), max_bytes=LIMIT)


@pytest.mark.parametrize(
    "board",
    [
        [],
        {"entries": [], "cards": {}},
        {"entries": [{"id": "a", "name": "A", "score": 0}] * 2, "cards": []},
        {"entries": [{"id": "a", "name": " ", "score": 0}], "cards": []},
        {"entries": [{"id": "a", "name": "A", "score": 1.5}], "cards": []},
        {"entries": [{"id": "a", "name": "A", "score": True}], "cards": []},
        {"entries": [{"id": "a", "name": "A", "score": 1_000_001}], "cards": []},
        {"entries": [{"id": f"e{i}", "name": "A", "score": 0} for i in range(101)], "cards": []},
        {"entries": [], "cards": [{"pageId": "p1", "id": "c1", "entryId": 3, "visible": True}]},
        {"entries": [], "cards": [{"pageId": "p1", "id": "c1", "entryId": None, "visible": "yes"}]},
    ],
)
def test_rejects_a_malformed_scoreboard(board):
    with pytest.raises(InvalidDocument):
        validate_document(make_doc(scoreboard=board), max_bytes=LIMIT)
