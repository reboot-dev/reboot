class MockExitException(Exception):

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def mock_raise_instead_of_exit(self, status=0, message=None):
    """Raise an exception instead of exiting in tests.

    Intended to be used with `unittest.mock.patch`.
    """
    raise MockExitException(status, message)
