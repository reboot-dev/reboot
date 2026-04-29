FROM ghcr.io/reboot-dev/reboot-base:1.0.3

WORKDIR /app

# Copy the Reboot nodejs packages.
COPY package.json package.json
COPY tsconfig.json tsconfig.json

# Install yarn
RUN corepack enable
RUN corepack prepare yarn@4.5.1 --activate

# Next, copy the API definition and 'package.json's to generate Reboot code.
# This step is separate so it is only repeated if the `api/` or 'package.json'
# code changes.
COPY api/ api/
COPY backend/.rbtrc backend/.rbtrc
COPY backend/package.json backend/package.json
COPY common/package.json common/package.json
COPY .yarnrc.yml .yarnrc.yml

RUN yarn install

# Run the Reboot code generators. We did copy all of `api/`, possibly
# including generated code, but it's not certain that `rbt generate` was run in
# that folder before this build was started.
RUN cd backend && yarn run rbt generate

COPY common/constants.ts common/constants.ts
COPY backend/src/main.ts backend/src/main.ts

WORKDIR /app/backend

COPY entrypoint.sh entrypoint.sh

CMD ["./entrypoint.sh"]
