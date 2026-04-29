FROM ghcr.io/reboot-dev/reboot-base:1.0.3

WORKDIR /app

# Copy the Reboot nodejs packages.
COPY package.json package.json
COPY tsconfig.json tsconfig.json

# Install the Reboot nodejs packages.
RUN npm install

# Next, copy the API definition and generate Reboot code. This step is
# separate so it is only repeated if the `api/` code changes.
COPY api/ api/
COPY .rbtrc .rbtrc

# Run the Reboot code generators. We did copy all of `api/`, possibly
# including generated code, but it's not certain that `rbt generate` was run in
# that folder before this build was started.
RUN npx rbt generate

# Now copy the rest of the source code.
COPY backend/src/ backend/src/

RUN npx tsc

CMD ["npx", "rbt", "serve", "run"]
