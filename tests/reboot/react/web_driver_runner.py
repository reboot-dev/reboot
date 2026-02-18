import os
import reboot.templates.tools as template_tools
import shutil
import threading
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from testing.web import webtest


@contextmanager
def web_driver(
    uri: str,
    bundle_js_path: str,
):
    driver = None
    static_file_server = None
    thread = None
    try:
        driver = webtest.new_webdriver_session(
            capabilities={
                'goog:chromeOptions':
                    {
                        'args':
                            [
                                '--headless',
                                '--no-sandbox',
                                '--disable-dev-shm-usage',
                                '--ignore-certificate-errors',
                            ],
                    },
                'goog:loggingPrefs': {
                    'browser': 'ALL',
                },
            }
        )

        template_input = {'uri': uri, 'bundle_js_path': './bundle.js'}

        index_html_j2_path = os.path.join(
            Path(__file__).parent.parent, 'index.html.j2'
        )
        index = template_tools.render_template(
            index_html_j2_path, template_input
        )

        # Place all of the data we'll be serving into the same directory, to
        # make sure our web server can read it.
        DIRECTORY = os.path.dirname(__file__)
        with open(os.path.join(DIRECTORY, 'index.html'), 'w') as file:
            file.write(index)
        shutil.copyfile(bundle_js_path, os.path.join(DIRECTORY, "bundle.js"))

        class TestServer(SimpleHTTPRequestHandler):

            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=DIRECTORY, **kwargs)

        static_file_server = ThreadingHTTPServer(('', 0), TestServer)

        def serve_until_shutdown():
            assert static_file_server is not None
            with static_file_server as server:
                server.serve_forever()

        thread = threading.Thread(target=serve_until_shutdown)
        thread.start()

        port = static_file_server.server_address[1]
        yield (driver, port)
    finally:
        if driver is not None:
            # Print `console.log()|error()|...` calls.
            print("##### Browser logs #####")
            for e in driver.get_log('browser'):
                print(e)
            print("##### End of browser logs #####")
            driver.quit()

        if static_file_server is not None:
            static_file_server.shutdown()

        if thread is not None:
            thread.join()
