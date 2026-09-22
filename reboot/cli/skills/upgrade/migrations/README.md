# Migration fragments, by release

Each `<version>/` directory here holds the migration fragments for
that Reboot release: the code changes an application must make when
upgrading past that version, one `.md` file per change. A version
without a directory needs no code migrations — bumping the version
pins and regenerating (which the `upgrade` skill always does) is
enough.

`next/` collects the fragments for the not-yet-released next version;
see its `README.md` for how to write one. At release time
`make versions` moves them into a new `<version>/` directory.
