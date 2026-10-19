"""Assertions over actual Database inspector output (also unit-testable)."""


def roots(snapshot):
    return {r['record'] for r in snapshot['records'] if r['scope_iteration'] is None}


def assert_gc(snapshot, initial_roots, current):
    records = snapshot['records']
    assert initial_roots, 'missing root/cursor binding witness'
    assert initial_roots <= roots(snapshot), 'root records reclaimed or rewritten'
    assert all(r['scope_iteration'] in (None, current) for r in records), 'completed iteration retained'
    # This fixture has one cursor binding, one effect, one Consume, one Break,
    # and one post-loop After. Allow format/identity companions, not O(N) growth.
    assert len(records) <= len(initial_roots) + 8, 'unbounded workflow checkpoint growth'
