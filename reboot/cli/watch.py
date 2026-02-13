import asyncio
import os
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass
from pathlib import Path
from pathspec import PathSpec
from typing import AsyncIterator, Iterator, Optional
from watchdog.events import (
    EVENT_TYPE_CLOSED,
    EVENT_TYPE_CLOSED_NO_WRITE,
    EVENT_TYPE_OPENED,
    FileSystemEvent,
    FileSystemEventHandler,
)
from watchdog.observers import Observer


@contextmanager
def file_watcher() -> Iterator[Observer]:
    """Creates an `Observer` to be shared across multiple watch calls.

    TODO: This is necessary due to
    https://github.com/gorakhargosh/watchdog/issues/919, which will be
    challenging to fix with the current architecture of `watchdog`. If it is
    fixed, we could move (back) to having unique Observers per `watch` call.
    """
    observer = Observer()
    observer.start()
    try:
        yield FileWatcher(observer)
    finally:
        observer.stop()
        observer.join()


@dataclass(frozen=True)
class FileWatcher:
    observer: Observer

    @asynccontextmanager
    async def watch(
        self,
        globs: list[str],
        *,
        root_dir: Optional[str] = None,
    ) -> AsyncIterator[asyncio.Task[FileSystemEvent]]:
        """Helper for watching the provided globs on the file system. Implemented
        as a context manager to ensure proper cleanup of the watches."""
        loop = asyncio.get_running_loop()

        root_path = Path(root_dir or os.getcwd()).resolve()
        globs = [_resolve_glob(root_path, g) for g in globs]
        # Use the `gitwildmatch` pattern factory, which has roughly `.gitignore` syntax.
        # see https://github.com/cpburnz/python-pathspec/blob/8634368a07bd3bf13c30b67ae394b43ba33e2197/pathspec/patterns/gitwildmatch.py#L385
        spec = PathSpec.from_lines('gitwildmatch', globs)

        class EventHandler(FileSystemEventHandler):

            def __init__(self, events: asyncio.Queue[FileSystemEvent]):
                super().__init__()
                self._events = events

            def on_any_event(self, event):
                if event.event_type in (
                    EVENT_TYPE_OPENED,
                    EVENT_TYPE_CLOSED,
                    EVENT_TYPE_CLOSED_NO_WRITE,
                ):
                    return
                if spec.match_file(event.src_path
                                  ) or spec.match_file(event.dest_path):
                    loop.call_soon_threadsafe(
                        lambda: self._events.put_nowait(event)
                    )

        events: asyncio.Queue[FileSystemEvent] = asyncio.Queue()

        handler = EventHandler(events)
        watches = []
        try:
            # Recursively watch all unique path prefixes to ensure that any newly created
            # files and directories are discovered.
            path_prefixes = {
                _existing_containing_path_for_glob(root_path, glob)
                for glob in globs
            }
            for path_prefix in path_prefixes:
                watches.append(
                    self.observer.schedule(
                        handler, path=path_prefix, recursive=True
                    )
                )

            events_get = asyncio.create_task(
                events.get(),
                name=f'events.get() in {__name__}',
            )

            try:
                yield events_get
            finally:
                events_get.cancel()

        except OSError as e:
            # The following condition signals error: 'inotify instance limit
            # reached', which happens when too many files are watched.
            if e.errno == 24:
                print('Too many files watched.')
            raise e
        finally:
            # Remove any watches created for this handler.
            for watch in watches:
                self.observer.remove_handler_for_watch(handler, watch)

        # ISSUE(https://github.com/reboot-dev/mono/issues/2752): Yield event loop
        # to avoid the watch loop firing twice.
        await asyncio.sleep(0.0)


def _resolve_glob(root_dir: Path, glob: str) -> str:
    """Absolutize and resolve the glob.

    `Path(..).resolve()` will normalize the path, while doing the right thing
    in case of:
      * `.` and `..` components (strip them)
      * symlinks (walk them)
      * missing directories (leave them in the path)
      * `*` and `**` globs (ignore them)
    """
    # Remove possible '!' prefix indicating a negative match but also
    # add it back after we've resolved the path.
    maybe_bang = ""
    if glob.startswith("!"):
        maybe_bang = "!"
        glob = glob[1:]
    if Path(glob).is_absolute():
        return maybe_bang + str(Path(glob).resolve())
    else:
        return maybe_bang + str(Path(root_dir / glob).resolve())


def _existing_containing_path_for_glob(root_dir: Path, glob_path: str) -> str:
    """Given a `glob`/`iglob` style glob, return an existing containing directory prefix."""
    parts = []
    for part in Path(glob_path).parts:
        if "*" in part:
            break
        parts.append(part)
    candidate = Path(*parts)

    if candidate.is_absolute():
        root = Path(candidate.root)
        candidate = candidate.relative_to(root)
    else:
        root = Path(root_dir)

    while not (root / candidate).exists():
        if candidate == candidate.parent:
            break
        candidate = candidate.parent
    return str(root / candidate)
