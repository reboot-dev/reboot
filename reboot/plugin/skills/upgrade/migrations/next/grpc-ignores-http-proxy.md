## Reboot's own gRPC channels no longer go through `http_proxy`

With `http_proxy`, `HTTPS_PROXY` or `grpc_proxy` set and no
`no_proxy` covering loopback, `Reboot().start()`, `reboot.bdd`
scenarios and `rbt dev run` used to hang, because Reboot dialed its
own processes through the proxy (reboot-dev/reboot#288). Reboot now
never sends those channels through a proxy, so workarounds for that
hang can go.

1. Find workarounds: grep the project, excluding `node_modules/`
   and `.venv/`, for `no_proxy`, `NO_PROXY`, `http_proxy`,
   `https_proxy`, `grpc_proxy` and `enable_http_proxy`. Look first in
   `conftest.py` files, `pytest.ini` / `pyproject.toml` (a
   `pytest-env` `env =` list), `.envrc`, `Makefile`s and scripts. The
   usual shape, from the issue, is a block at the top of a
   `conftest.py`:

   ```python
   _LOOPBACK = "localhost,127.0.0.1,::1,[::1],host.docker.internal"
   for _name in ("no_proxy", "NO_PROXY"):
       os.environ[_name] = ",".join(x for x in (os.environ.get(_name, ""), _LOOPBACK) if x)
   ```

   Other shapes: `env -u http_proxy -u https_proxy ...` or
   `no_proxy=localhost,...` in front of `pytest` or `rbt`, `del
   os.environ["http_proxy"]` / `os.environ.pop("HTTPS_PROXY", ...)`,
   and `("grpc.enable_http_proxy", 0)` passed to a channel.

2. Keep a workaround if anything else in the project still needs
   it. Python HTTP clients send even `localhost` through the proxy
   unless `no_proxy` names it, so check whether code that runs under
   it calls the app over HTTP: `requests`, `httpx`, `urllib`, or
   `aiohttp` with `trust_env=True`, aimed at `localhost`,
   `127.0.0.1` or a URL from `Reboot.url()`. If such calls exist,
   leave the workaround in place and reword any comment that blames
   Reboot's channels or #288 to name those calls instead. If you
   cannot tell, ask the developer.

3. Otherwise, remove the workaround: the block or line, any import
   (`os`, for one) left unused by its removal, and any comment, README
   or `AGENTS.md` / `CLAUDE.md` advice that says to set `no_proxy` or
   unset the proxy variables before running the tests or `rbt dev
   run`. Delete a `conftest.py` that the removal leaves empty.
