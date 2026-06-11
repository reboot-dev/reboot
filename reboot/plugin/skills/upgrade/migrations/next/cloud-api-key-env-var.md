## Prefer `REBOOT_CLOUD_API_KEY` over `--api-key`

`rbt cloud` subcommands now read the API key from the
`REBOOT_CLOUD_API_KEY` environment variable when `--api-key` is not
given. Prefer the environment variable: it keeps the secret out of
command lines, shell history, agent transcripts, and, most notably,
process listings like `ps`. If `.rbtrc` or
any scripts pass `--api-key=...` to `rbt cloud` commands, switch
them to setting `REBOOT_CLOUD_API_KEY` instead.
