import asyncio
import unittest
from contextlib import asynccontextmanager
from pathlib import Path
from reboot.cli import watch
from tempfile import TemporaryDirectory
from typing import AsyncIterator


class WatchTestCase(unittest.IsolatedAsyncioTestCase):

    @asynccontextmanager
    async def assert_watch(
        self,
        patterns: list[str],
        existing_paths: dict[str, str | None],
        *,
        expect_notified: bool = True,
        parent_directory: Path | None = None,
    ) -> AsyncIterator[Path]:
        with TemporaryDirectory(dir=parent_directory) as d:
            root = Path(d)
            for existing_path, content in existing_paths.items():
                path = root / existing_path
                if content is None:
                    path.mkdir(parents=True, exist_ok=True)
                else:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(content)
            with watch.file_watcher() as watcher:
                async with watcher.watch(
                    patterns, root_dir=str(root)
                ) as event_task:
                    yield root
                    if expect_notified:
                        # TODO: Increase to reduce unnecessary flakiness.
                        await asyncio.wait_for(event_task, 2)
                    else:
                        with self.assertRaises(asyncio.TimeoutError):
                            await asyncio.wait_for(event_task, 1)

    async def test_globs(self) -> None:
        for globs in (["new.py"], ["*.py"], ["**/*.py"]):
            async with self.assert_watch(globs, {}) as root:
                (root / "new.py").write_text("content")

    async def test_modify(self) -> None:
        async with self.assert_watch(
            ['**/*.py'], {"existing.py": "something"}
        ) as root:
            (root / "existing.py").write_text("else")

    async def test_create(self) -> None:
        async with self.assert_watch(['**/*.py'], {}) as root:
            (root / "new.py").write_text("content")

    async def test_delete(self) -> None:
        async with self.assert_watch(
            ['**/*.py'], {"existing.py": "something"}
        ) as root:
            (root / "existing.py").unlink()

    async def test_non_matching(self) -> None:
        async with self.assert_watch(
            ['**/*.py', 'src/**/*.py'], {}, expect_notified=False
        ) as root:
            (root / "new.ts").write_text("{}")
            (root / "src").mkdir()
            (root / "src/other.ts").write_text("{}")
        async with self.assert_watch(
            ['*.py'], {}, expect_notified=False
        ) as root:
            (root / "src").mkdir()
            (root / "src/new.py").write_text("content")

    async def test_create_nested(self) -> None:
        async with self.assert_watch(['**/*.py'], {}) as root:
            (root / "src/example").mkdir(parents=True)
            (root / "src/example/new.py").write_text("content")
        async with self.assert_watch(['src/**/*.py'], {}) as root:
            (root / "src/example").mkdir(parents=True)
            (root / "src/example/new.py").write_text("content")

    async def test_absolute_create(self) -> None:
        with TemporaryDirectory() as d:
            new = Path(d).resolve() / "new.py"
            async with self.assert_watch([str(new)], {}) as _:
                new.write_text("content")

    async def test_absolute_modify(self) -> None:
        with TemporaryDirectory() as d:
            existing = Path(d).resolve() / "existing.py"
            existing.write_text("something")
            async with self.assert_watch([str(existing)], {}) as _:
                existing.write_text("else")

    async def test_non_normalized(self) -> None:
        # A directory component which does not already exist should be normalized out.
        async with self.assert_watch(['something/../else/*.py'], {}) as root:
            (root / "else").mkdir()
            (root / "else" / "new.py").write_text("content")
        # A directory component which _does_ already exist should also be normalized out.
        with TemporaryDirectory() as d:
            parent = Path(d)
            (parent / "neighbor").mkdir()
            async with self.assert_watch(
                ['../neighbor/**/*.py'], {}, parent_directory=parent
            ) as root:
                (parent / "neighbor" / "new.py").write_text("content")

    async def test_concurrent(self) -> None:
        # Test that two watches can watch the same path.
        with TemporaryDirectory() as d:
            root = Path(d)
            with watch.file_watcher() as watcher:
                async with watcher.watch([
                    '**/*.txt'
                ], root_dir=str(root)) as watch_task_1, watcher.watch(
                    ['**/*.txt'], root_dir=str(root)
                ) as watch_task_2:
                    (root / "new.txt").write_text("content")

                    await asyncio.wait_for(watch_task_1, 2)
                    await asyncio.wait_for(watch_task_2, 2)


if __name__ == '__main__':
    unittest.main()
