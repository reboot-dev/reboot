# Re-export `public/` code (in the `rebootdev` package to avoid Python import
# issues) under the `reboot` namespace that developers use.
#
# NOTE: this file is here to allow public code (like e.g. reboot/examples) to
#       use natural import statement, like `import reboot.aio.types` instead
#       of `import rebootdev.aio.types`. HOWEVER: internal code, type-checked
#       via Bazel, should use the `rebootdev` namespace to avoid
#       attribute-not-defined errors.
#       TODO(rjh): remove that constraint by upgrading to `rules-mypy` instead
#                  of `bazel-mypy-integration`, once we're using Bzlmod.
from rebootdev.aio.auth.authorizers import *  # noqa: F403
