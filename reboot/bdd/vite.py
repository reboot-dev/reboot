"""Serving an application's web app with a Vite dev server.

A project with a Vite project in a directory under its root, the
directory holding `.rbtrc`, defines its `frontend` fixture with
`vite()` and that directory:

    @pytest.fixture
    def frontend() -> Iterator[Frontend]:
        with vite(directory='frontend') as frontend:
            yield frontend
"""
import aiohttp
import asyncio
import os
import signal
import socket
import subprocess
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from reboot.bdd.frontend import Frontend
from reboot.bdd.loop import run
from reboot.mcp.ui import find_project_root_from
from typing import Iterator, Optional, Union


# TODO: pass `--port 0` and read the port Vite prints, 'Local:
# http://localhost:PORT/', instead of reserving one here. That works
# from Vite 8: through 7, the CLI drops the 0 and binds its default,
# 5173, so two servers started at once collide.
def _reserve_port() -> socket.socket:
    """A socket bound to a free port on the loopback address, which
    keeps the port from anything else until the socket is closed.
    Bound with `SO_REUSEADDR` and never listening, so that a server
    that also sets `SO_REUSEADDR`, as Node does, can bind the port
    while the reservation still holds it: there is no moment at which
    the port is free for something else to take."""
    reservation = socket.socket()
    reservation.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    reservation.bind(('127.0.0.1', 0))
    return reservation


# How long a Vite dev server that has not exited gets to answer
# before serving is given up on: a cold start that pre-bundles
# dependencies can take tens of seconds on a slow machine.
SERVING_DEADLINE_SECONDS = 60


class ViteFrontend(Frontend):
    """A web app a Vite dev server serves from the given directory on
    a port reserved when the frontend is made, started with
    `VITE_REBOOT_URL` naming the backend so the app calls it the way
    it calls the one `.env.development` names under `rbt dev run`."""

    def __init__(self, directory: Path) -> None:
        # Holds the port until the server has bound it.
        self._reservation: Optional[socket.socket] = _reserve_port()
        port = self._reservation.getsockname()[1]
        super().__init__(f'http://localhost:{port}')
        self._directory = directory
        self._port = port
        self._server: Optional[asyncio.subprocess.Process] = None
        # What the server writes, to say why when it fails to serve.
        self._output: Optional[Path] = None

    async def serve(self, *, backend_url: str) -> None:
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
                '--port',
                str(self._port),
                '--strictPort',
                cwd=self._directory,
                env={
                    **os.environ, 'VITE_REBOOT_URL': backend_url
                },
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
        # The app is at the root, in a dual-surface layout by way of
        # the dev server's redirect to `/__/frontend/web/`.
        url = f'{self.origin}/'
        deadline = time.monotonic() + SERVING_DEADLINE_SECONDS
        last: Optional[str] = None
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=1),
        ) as session:
            while True:
                try:
                    async with session.get(url) as response:
                        if response.status == 200:
                            self._release()
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
        """Stops serving, if serving, and releases the port."""
        self._release()
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

    def _release(self) -> None:
        if self._reservation is not None:
            self._reservation.close()
            self._reservation = None


@contextmanager
def vite(*, directory: Union[str, Path]) -> Iterator[Frontend]:
    """A web app to be served from the given directory, relative to
    the project root unless absolute, by a Vite dev server on a free
    port, stopped when the context ends. Fails when the directory's
    dependencies are not installed, since `npm install` there is what
    makes Vite available."""
    path = Path(directory)
    if not path.is_absolute():
        path = find_project_root_from(Path.cwd()) / path
    if not path.is_dir():
        raise RuntimeError(f"No directory {path}")
    if not (path / 'node_modules' / '.bin' / 'vite').exists():
        raise RuntimeError(
            f"The frontend's dependencies are not installed in {path}; "
            "run `npm install` there"
        )
    frontend = ViteFrontend(path)
    try:
        yield frontend
    finally:
        frontend.stop()
