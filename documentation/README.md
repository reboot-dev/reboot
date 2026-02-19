# Tools

## Docusaurus
The documentation website is built using [Docusaurus 2](https://docusaurus.io/),
a modern static website generator.

## markdown-autodocs
We use
[markdown-autodocs](https://github.com/dineshsonachalam/markdown-autodocs#local-usage-without-github-action)
via CLI to pull code snippets from our examples directly into
our docs. That way, all of the code in our docs can be executed and tested and
is less likely to fall out of date or out of sync with the examples we expose.

See the markdown-autodocs README for more information on the tool syntax.

**Note: for proper syntax highlighting on any `.proto` snippets, make sure to add the `&syntax=protobuf` option.**

# Development commands

## Installation

```
$ npm install
```

Installs all site dependencies.

## Local Development

```
$ npm start
```

Starts a local development server and opens up the generated page in a browser window.
Most changes are reflected live without having to restart the server.

## Regenerate code snippets

```
$ npm run generate-code-snippets
```

Re-fetches code snippets after changes to the Markdown or source.

## Build

```
$ npm run build
```

Generates static content into the `build` directory that can be
served using any static contents hosting service.

Running a build will also check for broken internal links in the Docusaurus site.

# Style

This website follows the [Google developer documentation style
guide](https://developers.google.com/style), with the following amendments:



# Deployment

Updates to the docs will be automatically pushed to Github Pages on commits to
`main` (see `.github/workflows/build_and_publish_docs.yml`).

