"""Asks pyright what the developer's code means.

Pyright is a type checker built to answer questions about code as it
is being written, which is exactly the dashboard's situation: it
infers types through unannotated helpers, containers, and branches,
and it degrades to `Unknown` rather than guessing when generated
code does not exist yet.

Spoken to over the Language Server Protocol on stdio. Whoever reads
a file syncs its text, and answers are about each file's text as
last synced. Files nobody syncs, such as generated code, the server
reads from disk once, so a change to one of those takes a fresh
server to be seen.
"""
import asyncio
import hashlib
import itertools
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence


@dataclass(frozen=True, kw_only=True)
class Location:
    """Where a name is defined."""

    # The file the definition is in, spelled absolutely, which is how
    # the server spells every file.
    filename: Path

    # The line the definition starts on, counting from one, which is
    # how `ast` counts.
    line: int

    @property
    def standard_library(self) -> bool:
        """Whether the definition is in the standard library, builtins
        included.

        Pyright answers for those out of the typeshed stubs bundled
        with it, under `typeshed-fallback/stdlib`, so that is where a
        definition of `print` or `asyncio.sleep` lands.
        """
        parts = self.filename.parts
        return 'typeshed-fallback' in parts and parts[
            parts.index('typeshed-fallback') +
            1:parts.index('typeshed-fallback') + 2] == ('stdlib',)


@dataclass(frozen=True, kw_only=True)
class _Synced:
    """What was last synced for one file."""

    # The version number the protocol wants counted up per file.
    version: int

    # A digest of the text synced, to skip syncing the file again if
    # its text has not changed.
    digest: bytes

    # The lines needing position translation, by zero-based line
    # number: only lines containing a character outside ASCII, since
    # an ASCII line's columns count the same in UTF-8 bytes and
    # UTF-16 code units. Empty for a typical file.
    lines: Mapping[int, str]


class Pyright:
    """One running pyright language server, answering questions.

    `start` it and ask with `definition_at` and
    `type_definition_at`, handing each the text its position came
    from; `type_at` takes a `sync` of the file's text first.
    Positions are given the way `ast` gives them: lines from one,
    columns from zero.
    """

    def __init__(self) -> None:
        self._process: Optional[asyncio.subprocess.Process] = None
        self._ids = itertools.count(1)
        self._responses: dict[int, asyncio.Future[Any]] = {}
        self._reader: Optional[asyncio.Task[None]] = None
        # For each file that we `sync` to Pyright we keep around a
        # version number (required by Pyright) and a digest (to skip
        # syncing the file if its text has not changed). Keyed by the
        # file's resolved path, so that neither changing directories
        # between calls nor a symlink can confuse two spellings of
        # one file.
        self._synced: dict[Path, _Synced] = {}

    async def start(
        self,
        *,
        root: Path,
        extra_paths: Sequence[Path],
    ) -> None:
        """Starts the server over `root`, resolving imports through
        `extra_paths`, such as the directory `rbt generate` writes to."""
        # The `pyright` package's own language server entry point,
        # run with the interpreter `reboot` is installed into, so
        # that nothing depends on the `PATH`; the package, a
        # dependency of `reboot`, brings the server and, through its
        # `[nodejs]` extra, the Node it runs on.
        self._process = await asyncio.create_subprocess_exec(
            sys.executable,
            '-m',
            'pyright.langserver',
            '--stdio',
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )

        self._reader = asyncio.create_task(self._read())

        response = await self._request(
            'initialize',
            {
                'processId': os.getpid(),
                'rootUri': root.resolve().as_uri(),
                'capabilities': {},
                'initializationOptions': {},
            },
        )

        # The protocol counts positions in UTF-16 code units unless a
        # client offers other encodings, which this one does not:
        # `_position` translates every column into UTF-16 code units.
        # A server answering with anything else is not following the
        # protocol.
        encoding = response.get('capabilities',
                                {}).get('positionEncoding', 'utf-16')
        if encoding != 'utf-16':
            raise ValueError(
                'Expected pyright to count positions in UTF-16 code '
                f"units, the protocol's default, but it answered "
                f"'{encoding}'"
            )

        await self._notify('initialized', {})
        await self._notify(
            'workspace/didChangeConfiguration',
            {
                'settings':
                    {
                        'python':
                            {
                                'analysis':
                                    {
                                        'extraPaths':
                                            [
                                                str(path)
                                                for path in extra_paths
                                            ],
                                        'typeCheckingMode': 'basic',
                                        'useLibraryCodeForTypes': True,
                                    }
                            }
                    }
            },
        )

    async def stop(self) -> None:
        """Stops the server. Questions after this raise."""
        if self._reader is not None:
            self._reader.cancel()
        if self._process is not None:
            self._process.terminate()
            await self._process.wait()

    async def sync(
        self,
        *,
        filename: Path,
        text: str,
    ) -> None:
        """Sync the specified `text` with Pyright so it uses that
        text to resolve any subsequent queries. If the `text` for
        `filename` has not changed then nothing is sent to
        Pyright."""
        filename = filename.resolve()
        digest = hashlib.sha256(text.encode()).digest()

        file = self._synced.get(filename)
        if file is None:
            await self._notify(
                'textDocument/didOpen',
                {
                    'textDocument':
                        {
                            'uri': filename.as_uri(),
                            'languageId': 'python',
                            'version': 1,
                            'text': text,
                        }
                },
            )
            self._synced[filename] = _Synced(
                version=1,
                digest=digest,
                lines=(
                    {
                        index: line
                        for index, line in enumerate(text.splitlines())
                        if not line.isascii()
                    } if not text.isascii() else {}
                ),
            )
            return

        if file.digest == digest:
            return

        version = file.version + 1
        await self._notify(
            'textDocument/didChange',
            {
                'textDocument': {
                    'uri': filename.as_uri(),
                    'version': version,
                },
                'contentChanges': [{
                    'text': text
                }],
            },
        )
        self._synced[filename] = _Synced(
            version=version,
            digest=digest,
            lines=(
                {
                    index: line
                    for index, line in enumerate(text.splitlines())
                    if not line.isascii()
                } if not text.isascii() else {}
            ),
        )

    def synced(self) -> list[Path]:
        """Returns every file whose text is synced, each in the
        resolved spelling `sync` keys files by."""
        return list(self._synced)

    async def discard(self, *, filename: Path) -> None:
        """Tells Pyright to discard previously synced text at
        `filename`. If the file has since been deleted Pyright should
        properly detect that because it is no longer on disk."""
        filename = filename.resolve()
        if filename not in self._synced:
            return

        await self._notify(
            'textDocument/didClose',
            {'textDocument': {
                'uri': filename.as_uri(),
            }},
        )
        del self._synced[filename]

    async def type_at(
        self,
        *,
        filename: Path,
        line: int,
        character: int,
    ) -> Optional[str]:
        """Returns the type of the expression at a position in the
        text of the specified `filename`, which must have been synced
        with Pyright already or a `ValueError` is raised. Note
        that the type returned is not always a fully qualified name,
        and as such may not be entirely useful without more context.
        If the type is `Unknown`, or if Pyright doesn't know for some
        other reason (e.g., it is missing files it needs to infer the
        type, such as files that might need to be generated by the
        build system), then `None` is returned.
        """
        filename = self._synced_filename(filename)
        response = await self._request(
            'textDocument/hover',
            self._position(
                filename=filename,
                line=line,
                character=character,
            ),
        )

        if response is None:
            return None

        contents = response.get('contents')
        if isinstance(contents, dict):
            contents = contents.get('value', '')
        if not isinstance(contents, str):
            return None

        # Pyright writes hovers like `(variable) shop: Shop` or
        # `(class) Shop`; the type is what follows the last `: ` on
        # the first line that has one.
        for line_of in contents.splitlines():
            if ': ' in line_of:
                result = line_of.rsplit(': ', 1)[1].strip('` ')
                if result and 'Unknown' not in result:
                    return result
                return None

        return None

    async def definition_at(
        self,
        *,
        filename: Path,
        line: int,
        character: int,
        text: str,
    ) -> Optional[Location]:
        """Returns the definition for the name at the position in
        `text`, or `None` when Pyright can not determine the
        definition (e.g., it is missing files it needs to find the
        definition, such as files that might need to be generated by
        the build system).

        `text` must be the text of `filename` the position came
        from, so that the answer cannot be about a file that changed
        underneath the asking; it is synced first, which `sync`
        deduplicates by digest."""
        return await self._location_at(
            'textDocument/definition',
            filename=filename,
            line=line,
            character=character,
            text=text,
        )

    async def type_definition_at(
        self,
        *,
        filename: Path,
        line: int,
        character: int,
        text: str,
    ) -> Optional[Location]:
        """Returns where the type of the expression at the position
        in `text` is defined: e.g. the `class ShopServicer` that a
        base spelled `Shop.Servicer` refers to, resolved through
        however the expression gets there, an alias like the
        generator's `Servicer: TypeAlias = ShopServicer`, a chain
        of assignments, a name imported from anywhere, or a
        function's return type. `None` when Pyright can not
        determine the type, such as when generated code has not
        been written yet.

        `text` must be the text of `filename` the position came
        from, so that the answer cannot be about a file that changed
        underneath the asking; it is synced first, which `sync`
        deduplicates by digest."""
        return await self._location_at(
            'textDocument/typeDefinition',
            filename=filename,
            line=line,
            character=character,
            text=text,
        )

    async def _location_at(
        self,
        method: str,
        *,
        filename: Path,
        line: int,
        character: int,
        text: str,
    ) -> Optional[Location]:
        """Returns the first location a request answering with
        locations answers, as a `Location`, and `None` for an
        empty answer."""
        await self.sync(filename=filename, text=text)
        filename = self._synced_filename(filename)
        response = await self._request(
            method,
            self._position(
                filename=filename,
                line=line,
                character=character,
            ),
        )

        match response:
            case [
                {
                    'uri': str(uri),
                    'range': {
                        'start': {
                            'line': int(line_at),
                        }
                    },
                }, *_
            ] if uri.startswith('file://'):
                return Location(
                    filename=Path(uri[len('file://'):]),
                    line=line_at + 1,
                )

        return None

    def _synced_filename(self, filename: Path) -> Path:
        """Returns the file's resolved spelling, the way `_synced`
        keys it, refusing a file whose text was never synced."""
        filename = filename.resolve()
        if filename not in self._synced:
            raise ValueError(
                f'`{filename}` has not been synced; call `sync` with '
                'its text before asking about it'
            )
        return filename

    def _utf16_character(
        self,
        *,
        filename: Path,
        line: int,
        character: int,
    ) -> int:
        """Returns a column counted in UTF-16 code units, the way
        the protocol counts, from one counted in UTF-8 bytes, the
        way `ast` counts."""
        line_text = self._synced[filename].lines.get(line - 1)
        if line_text is None:
            return character

        prefix = line_text.encode()[:character].decode()
        return len(prefix.encode('utf-16-le')) // 2

    def _position(
        self,
        *,
        filename: Path,
        line: int,
        character: int,
    ) -> dict[str, Any]:
        character = self._utf16_character(
            filename=filename,
            line=line,
            character=character,
        )
        return {
            'textDocument': {
                'uri': filename.as_uri()
            },
            'position': {
                'line': line - 1,
                'character': character,
            },
        }

    async def _request(
        self,
        method: str,
        params: dict[str, Any],
    ) -> Any:
        assert self._process is not None and self._process.stdin is not None
        id = next(self._ids)
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future(
        )
        self._responses[id] = future
        self._write(
            {
                'jsonrpc': '2.0',
                'id': id,
                'method': method,
                'params': params,
            }
        )
        await self._process.stdin.drain()
        return await future

    async def _notify(
        self,
        method: str,
        params: dict[str, Any],
    ) -> None:
        assert self._process is not None and self._process.stdin is not None
        self._write({'jsonrpc': '2.0', 'method': method, 'params': params})
        await self._process.stdin.drain()

    def _write(self, message: dict[str, Any]) -> None:
        assert self._process is not None and self._process.stdin is not None
        body = json.dumps(message).encode()
        self._process.stdin.write(
            b'Content-Length: %d\r\n\r\n%s' % (len(body), body)
        )

    async def _read(self) -> None:
        assert self._process is not None and self._process.stdout is not None
        while True:
            length = 0
            ended = False
            while True:
                header = await self._process.stdout.readline()
                if not header:
                    ended = True
                    break
                if header.startswith(b'Content-Length:'):
                    length = int(header.split(b':')[1])
                if header == b'\r\n':
                    break
            if ended:
                # The server died. Whoever is waiting on it finds
                # out now rather than waiting forever.
                for future in self._responses.values():
                    if not future.done():
                        future.set_exception(RuntimeError('pyright exited'))
                self._responses.clear()
                return
            body = json.loads(await self._process.stdout.readexactly(length))
            # A body with both an `id` and a `method` is a
            # server-to-client request, which must be answered or the
            # server waits on us the way we wait on it.
            if 'id' in body and 'method' in body:
                self._write(
                    {
                        'jsonrpc': '2.0',
                        'id': body['id'],
                        'result': None,
                    }
                )
                continue
            if 'id' in body:
                waiting = self._responses.pop(body['id'], None)
                if waiting is not None and not waiting.done():
                    waiting.set_result(body.get('result'))
