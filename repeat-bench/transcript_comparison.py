"""Exact deterministic records; raw concurrent order is evidence, not a contract."""
from collections import Counter

def concurrent_messages(case):
    assert set(case) == {'ok', 'response'} and case['ok'] is True, case
    assert set(case['response']) == {'messages'}, case
    values = case['response']['messages']
    assert isinstance(values, list) and all(isinstance(x, str) for x in values), case
    return values

def assert_concurrent_membership(case):
    values = concurrent_messages(case)
    expected = [''] + ['concurrent-' + str(i) for i in range(8)]
    assert Counter(values) == Counter(expected), (values, expected)
    return values

def compare_transcripts(left, right):
    assert left['complete'] is True and right['complete'] is True
    a, b = left['cases'], right['cases']
    assert set(a) == set(b), (set(a), set(b))
    assert 'isolation' in a
    deterministic = [name for name in a if name != 'isolation']
    for name in deterministic:
        assert a[name] == b[name], (name, a[name], b[name])
    raw_a = assert_concurrent_membership(a['isolation'])
    raw_b = assert_concurrent_membership(b['isolation'])
    assert left['concurrency_raw_messages'] == raw_a
    assert right['concurrency_raw_messages'] == raw_b
    return {
        'complete': True,
        'records_each': len(a),
        'deterministic_records_exact': len(deterministic),
        'concurrent_membership_multiplicity_records': 1,
        'concurrent_membership_multiplicity_equal': Counter(raw_a) == Counter(raw_b),
        'raw_concurrent_messages': [raw_a, raw_b],
        'raw_concurrent_order_equal': raw_a == raw_b,
        'entire_cases_exact_equal_observed': a == b,
        'ordering_required_for_concurrent_record': False,
    }
