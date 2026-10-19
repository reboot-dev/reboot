import copy
import unittest
from transcript_comparison import compare_transcripts

class TranscriptComparisonTests(unittest.TestCase):
    def sample(self):
        raw = [''] + ['concurrent-' + str(i) for i in range(8)]
        return {'complete': True, 'concurrency_raw_messages': raw.copy(), 'cases': {
            'isolation': {'ok': True, 'response': {'messages': raw.copy()}},
            'error': {'ok': False, 'message': '', 'details': [
                {'type_url': 'type.googleapis.com/rbt.v1alpha1.StateNotConstructed', 'value_hex': '0801'}]},
            'messages': {'ok': True, 'response': {'messages': ['first', 'second']}}}}
    def changed(self, mutate):
        a = self.sample(); b = copy.deepcopy(a)
        mutate(b['cases']['isolation']['response']['messages'])
        b['concurrency_raw_messages'] = b['cases']['isolation']['response']['messages'].copy()
        return a, b
    def test_order_not_required_and_raw_retained(self):
        a, b = self.changed(lambda x: x.reverse())
        before = copy.deepcopy(b)
        r = compare_transcripts(a, b)
        self.assertFalse(r['raw_concurrent_order_equal'])
        self.assertFalse(r['entire_cases_exact_equal_observed'])
        self.assertTrue(r['concurrent_membership_multiplicity_equal'])
        self.assertEqual(b, before)
    def test_missing_message_rejected(self):
        with self.assertRaises(AssertionError): compare_transcripts(*self.changed(lambda x: x.pop()))
    def test_duplicate_message_rejected(self):
        with self.assertRaises(AssertionError): compare_transcripts(*self.changed(lambda x: x.append(x[1])))
    def test_unexpected_message_rejected(self):
        with self.assertRaises(AssertionError): compare_transcripts(*self.changed(lambda x: x.__setitem__(1, 'unexpected')))
    def test_equal_length_duplicate_replacement_rejected(self):
        with self.assertRaises(AssertionError): compare_transcripts(*self.changed(lambda x: x.__setitem__(1, x[2])))
    def test_both_sides_same_invalid_membership_rejected(self):
        a, b = self.changed(lambda x: x.pop())
        with self.assertRaises(AssertionError): compare_transcripts(b, copy.deepcopy(b))
    def test_deterministic_error_bytes_rejected(self):
        a = self.sample(); b = copy.deepcopy(a)
        b['cases']['error']['details'][0]['value_hex'] = '0800'
        with self.assertRaises(AssertionError): compare_transcripts(a, b)
    def test_deterministic_error_message_rejected(self):
        a = self.sample(); b = copy.deepcopy(a); b['cases']['error']['message'] = 'normalized'
        with self.assertRaises(AssertionError): compare_transcripts(a, b)
    def test_deterministic_order_rejected(self):
        a = self.sample(); b = copy.deepcopy(a); b['cases']['messages']['response']['messages'].reverse()
        with self.assertRaises(AssertionError): compare_transcripts(a, b)
    def test_raw_evidence_disagreement_rejected(self):
        a = self.sample(); b = copy.deepcopy(a); b['concurrency_raw_messages'].reverse()
        with self.assertRaises(AssertionError): compare_transcripts(a, b)
    def test_case_omission_rejected(self):
        a = self.sample(); b = copy.deepcopy(a); del b['cases']['messages']
        with self.assertRaises(AssertionError): compare_transcripts(a, b)
    def test_exact_valid_records_pass(self):
        a = self.sample(); r = compare_transcripts(a, copy.deepcopy(a))
        self.assertEqual(r['records_each'], len(a['cases']))
        self.assertEqual(r['deterministic_records_exact'], len(a['cases']) - 1)

if __name__ == '__main__': unittest.main()
