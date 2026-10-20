"""Serving an application's web app with a Vite dev server.

A project with a Vite project in a directory under its root, the
directory holding `.rbtrc`, defines its `frontend` fixture with
`vite()` and that directory:

    @pytest.fixture
    def frontend() -> Iterator[Frontend]:
        with vite(directory='frontend') as frontend:
            yield frontend

The dev server takes a free port of the OS's choosing (Vite's
`--port 0`) before the scenario's backend comes up, and the backend's
Envoy then routes `/__/frontend/**` and the web app to it, so a
browser opens the app at the backend's own origin, where the app
finds the backend too.
"""
import aiohttp
import asyncio
import os
import re
import signal
import subprocess
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from reboot.bdd.frontend import Frontend
from reboot.bdd.loop import run
from reboot.mcp.ui import find_project_root_from
from reboot.settings import EVERY_LOCAL_NETWORK_ADDRESS
from typing import Iterator, Optional, Union

# The oldest Vite whose `--port 0` takes a free port of the OS's
# choosing: through 7, the CLI drops the 0 and binds its default,
# 5173, so two servers started at once collide.
MINIMUM_VITE_MAJOR = 8

# The line the dev server prints once it listens, '  ➜  Local:
# http://localhost:PORT/', which says the URL it took.
_LOCAL_URL = re.compile(rb'Local:\s*(https?://[^/\s]+)')

# The escape sequences Vite styles its output with when colors are
# on, which land anywhere in a line, between the host and the port of
# the URL included.
_ANSI_ESCAPE = re.compile(rb'\x1b\[[0-9;]*[A-Za-z]')

# How long a Vite dev server that has not exited gets to answer
# before serving is given up on: a cold start that pre-bundles
# dependencies can take tens of seconds on a slow machine.
SERVING_DEADLINE_SECONDS = 60

# What `vite --version` prints: 'vite/8.3.4 linux-x64 node-v22.22.0'.
_VERSION = re.compile(r'vite/(\S+)')


def _vite_version(directory: Path) -> str:
    """The version of the Vite that `npx vite` runs in the directory,
    asked of it; raises when there is none to ask, since `npx` is
    told not to fetch one, with what `npx` said."""
    command = ['npx', '--no-install', 'vite', '--version']
    result = subprocess.run(
        command,
        cwd=directory,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"The frontend's dependencies are not installed in {directory}, "
            "or its Vite does not run; `npm install` there is what makes "
            f"Vite available. `{' '.join(command)}` exited with status "
            f"{result.returncode}; its output:\n{result.stdout}{result.stderr}"
        )
    match = _VERSION.search(result.stdout)
    if match is None:
        raise RuntimeError(
            f"Could not tell the version of the Vite in {directory} from "
            f"what `{' '.join(command)}` printed:\n{result.stdout}"
        )
    return match.group(1)


class ViteFrontend(Frontend):
    """A web app a Vite dev server serves from the given directory on
    a free port of the OS's choosing, for the backend's Envoy to
    route to; the app finds the backend at the page's own origin."""

    def __init__(self, directory: Path) -> None:
        self._directory = directory
        # Known once the server says which port it took.
        self._url: Optional[str] = None
        self._server: Optional[asyncio.subprocess.Process] = None
        # What the server writes: the port it took, and why when it
        # fails to serve.
        self._output: Optional[Path] = None

    @property
    def url(self) -> str:
        assert self._url is not None, 'not ready; `ready()` first'
        return self._url

    async def serve(self) -> None:
        assert self._server is None, 'already serving'
        self._output = Path(
            tempfile.NamedTemporaryFile(
                prefix='vite-',
                suffix='.log',
                delete=False,
            ).name
        )
        with self._output.open('wb') as log:
            self._server = await asyncio.create_subprocess_exec(
                'npx',
                'vite',
                # A free port of the OS's choosing, read back from
                # the output, so that a server starting beside other
                # dev servers, or two starting at once, never collide.
                '--port',
                '0',
                # Every IPv4 interface, which is where Envoy reaches
                # the dev server: as `localhost` from an Envoy
                # executable, which Node left to itself may bind as
                # `::1` alone, and as `host.docker.internal` from an
                # Envoy in Docker, which the loopback alone would not
                # reach.
                '--host',
                EVERY_LOCAL_NETWORK_ADDRESS,
                cwd=self._directory,
                stdout=log,
                stderr=subprocess.STDOUT,
                # Its own process group, so that stopping it also
                # stops the `node` it spawns.
                start_new_session=True,
            )

    async def ready(self) -> None:
        assert self._server is not None and self._output is not None, (
            'not serving; `serve()` first'
        )
        deadline = time.monotonic() + SERVING_DEADLINE_SECONDS
        # First the URL, which the server prints once it listens.
        while self._url is None:
            match = _LOCAL_URL.search(
                _ANSI_ESCAPE.sub(b'', self._output.read_bytes())
            )
            if match is not None:
                self._url = match.group(1).decode()
                break
            if self._server.returncode is not None:
                raise RuntimeError(
                    f"The Vite dev server exited with status "
                    f"{self._server.returncode} before saying which port "
                    f"it took; its output:\n{self._output.read_text()}"
                )
            if time.monotonic() > deadline:
                raise RuntimeError(
                    f"The Vite dev server did not say which port it took "
                    f"within {SERVING_DEADLINE_SECONDS} seconds; its "
                    f"output:\n{self._output.read_text()}"
                )
            await asyncio.sleep(0.2)
        # Then the app at the root; in a dual-surface layout the dev
        # server serves it there itself (see `serveWebAppAtRoot` in
        # Reboot's Vite plugin).
        url = f'{self._url}/'
        last: Optional[str] = None
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=1),
        ) as session:
            while True:
                try:
                    async with session.get(url) as response:
                        if response.status == 200:
                            return
                        last = f'{response.status} {response.reason}'
                except (aiohttp.ClientError, asyncio.TimeoutError) as error:
                    last = repr(error)
                if self._server.returncode is not None:
                    raise RuntimeError(
                        f"The Vite dev server exited with status "
                        f"{self._server.returncode} before serving {url}; "
                        f"its output:\n{self._output.read_text()}"
                    )
                if time.monotonic() > deadline:
                    raise RuntimeError(
                        f"The Vite dev server did not serve {url} within "
                        f"{SERVING_DEADLINE_SECONDS} seconds; the last "
                        f"answer was {last}; its output:\n"
                        f"{self._output.read_text()}"
                    )
                await asyncio.sleep(0.2)

    def stop(self) -> None:
        """Stops serving, if serving."""
        if self._server is not None:
            # A server that failed to start has already exited, and
            # its process group with it.
            if self._server.returncode is None:
                os.killpg(self._server.pid, signal.SIGTERM)
            run(self._server.wait())
            self._server = None
        if self._output is not None:
            self._output.unlink(missing_ok=True)
            self._output = None


@contextmanager
def vite(*, directory: Union[str, Path]) -> Iterator[Frontend]:
    """A web app to be served from the given directory, relative to
    the project root unless absolute, by a Vite dev server on a free
    port, stopped when the context ends. Fails when the directory's
    Vite does not run, which `npm install` there is what makes it do,
    and when it is older than `MINIMUM_VITE_MAJOR`."""
    path = Path(directory)
    if not path.is_absolute():
        path = find_project_root_from(Path.cwd()) / path
    if not path.is_dir():
        raise RuntimeError(f"No directory {path}")
    version = _vite_version(path)
    if int(version.split('.')[0]) < MINIMUM_VITE_MAJOR:
        raise RuntimeError(
            f"The frontend in {path} has Vite {version}, but serving it "
            f"needs Vite {MINIMUM_VITE_MAJOR} or later, whose `--port 0` "
            "takes a free port of the OS's choosing; upgrade it there, "
            "e.g. `npm install -D vite@latest @vitejs/plugin-react@latest`"
        )
    frontend = ViteFrontend(path)
    try:
        yield frontend
    finally:
        frontend.stop()
