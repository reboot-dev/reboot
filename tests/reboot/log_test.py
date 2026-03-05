import log.log
import unittest
from datetime import datetime, timedelta, timezone
from log.log import log_at_most_once_per


class TestCase(unittest.TestCase):

    def test_log_at_most_once_per(self) -> None:
        # Mock time, so that we can control when messages are unsilenced.
        fake_now = datetime.now(timezone.utc)
        log.log._get_current_datetime = lambda: fake_now

        messages: list[str] = []

        # The first time a message is logged, it is always printed.
        log_at_most_once_per(
            seconds=10,
            log_method=messages.append,
            message="One",
        )
        self.assertEqual(["One"], messages)

        # Unless time advances, the same message is not printed again.
        log_at_most_once_per(
            seconds=10,
            log_method=messages.append,
            message="One",
        )
        self.assertEqual(["One"], messages)

        # A different message does get printed.
        log_at_most_once_per(
            seconds=8,
            log_method=messages.append,
            message="Two",
        )
        self.assertEqual(["One", "Two"], messages)

        # If time does not advance sufficiently, messages are still not
        # printed again.
        fake_now += timedelta(seconds=2)
        log_at_most_once_per(
            seconds=10,
            log_method=messages.append,
            message="One",
        )
        log_at_most_once_per(
            seconds=8,
            log_method=messages.append,
            message="Two",
        )
        self.assertEqual(["One", "Two"], messages)

        # If time advances enough to expire the silence on one of the
        # messages, but not both, only the unsilenced message is printed
        # again.
        fake_now += timedelta(seconds=7)
        log_at_most_once_per(
            seconds=10,
            log_method=messages.append,
            message="One",
        )
        log_at_most_once_per(
            seconds=8,
            log_method=messages.append,
            message="Two",
        )
        self.assertEqual(["One", "Two", "Two"], messages)

        # If time advances some more, the first message is now also
        # unsilenced, but there's a new silence on the second message.
        fake_now += timedelta(seconds=2)
        log_at_most_once_per(
            seconds=10,
            log_method=messages.append,
            message="One",
        )
        log_at_most_once_per(
            seconds=8,
            log_method=messages.append,
            message="Two",
        )
        self.assertEqual(["One", "Two", "Two", "One"], messages)

        # If time advances sufficiently, all messages are unsilenced.
        fake_now += timedelta(seconds=20)
        log_at_most_once_per(
            seconds=10,
            log_method=messages.append,
            message="One",
        )
        log_at_most_once_per(
            seconds=8,
            log_method=messages.append,
            message="Two",
        )
        self.assertEqual(["One", "Two", "Two", "One", "One", "Two"], messages)


if __name__ == "__main__":
    unittest.main()
