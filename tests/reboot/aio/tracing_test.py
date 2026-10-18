import os
import subprocess
import sys
import textwrap
import unittest
from opentelemetry.sdk.environment_variables import (
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
)


class TracingTest(unittest.TestCase):

    def test_main_span_with_tracing_enabled(self) -> None:
        # Tracing only starts, and installs its cleanup handler, which
        # requires signals to be initialized, when it has an endpoint
        # to export to. Nothing listens on this one, so `main()` exits
        # right away rather than returning, after which the exporter
        # would retry for about a minute before giving up.
        process = subprocess.run(
            [
                sys.executable,
                '-c',
                textwrap.dedent(
                    '''
                    import os
                    from reboot.aio.tracing import main_span

                    @main_span("test")
                    def main():
                        print("main ran", flush=True)
                        os._exit(0)

                    main()
                    '''
                ),
            ],
            env={
                **os.environ,
                OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
                    'http://127.0.0.1:1',
            },
            capture_output=True,
            text=True,
        )
        self.assertEqual(process.stdout, "main ran\n", process.stderr)
        self.assertEqual(process.returncode, 0, process.stderr)


if __name__ == '__main__':
    unittest.main()
