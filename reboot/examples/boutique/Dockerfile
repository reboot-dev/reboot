FROM ghcr.io/reboot-dev/reboot-base:1.2.1

WORKDIR /app

# First ONLY copy and install the dependencies, so that changes to the
# application code don't force a re-install of all dependencies. `pip`
# can't read `uv.lock` directly, so use `uv` itself to export it to
# `requirements.txt` format.
#
# Note that this will install the Reboot library and CLI.
COPY --from=ghcr.io/astral-sh/uv:0.11.13 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv export --frozen --no-dev --no-emit-project \
    --format requirements-txt -o requirements.txt \
    && pip install -r requirements.txt

# Next, copy the API definition and generate Reboot code. This step is also
# separate so it is only repeated if the `api/` code changes.
COPY api/ api/
COPY .rbtrc .rbtrc

# Run the Reboot code generators. We did copy all of `api/`, possibly
# including generated code, but it's not certain that `rbt generate` was run in
# that folder before this build was started.
RUN rbt generate

# Now copy the rest of the source code.
COPY backend/src/ backend/src/

CMD ["rbt", "serve", "run"]
