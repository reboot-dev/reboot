To install the HEAD version of `reboot` and activate a `venv`, run:

```console
bazel run //reboot:force_reinstall_dev_reboot
source .venv/bin/activate
```

NOTE: This will mutate the `pyproject.toml` file and the lockfiles.

---

Store the Mailgun API key secret with:

```console
mkdir -p backend/secrets
echo -n $MAILGUN_API_KEY > backend/secrets/mailgun-api-key
```

If you're using `rbt serve` and your certificate works for the name
`localhost` then you can use `web/.env.production` via in `web/` doing:

```console
npm run build
serve -s build
```
