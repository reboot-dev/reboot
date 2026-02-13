# Re-export `public/` code (in the `rebootdev` package to avoid Python import
# issues) under the `reboot` namespace that developers use.
#
# NOTE: this file is here to allow code, especially public code (e.g.
#       reboot/examples) and publicly documented code (e.g. tests/reboot) to
#       use natural import statement, like `import reboot.aio.types` instead
#       of `import rebootdev.aio.types`.
#       TODO(rjh): remove that constraint by upgrading to `rules-mypy` instead
#                  of `bazel-mypy-integration`, once we're using Bzlmod.
from rebootdev.protobuf import as_bool as as_bool
from rebootdev.protobuf import as_dict as as_dict
from rebootdev.protobuf import as_float as as_float
from rebootdev.protobuf import as_int as as_int
from rebootdev.protobuf import as_list as as_list
from rebootdev.protobuf import as_message as as_message
from rebootdev.protobuf import as_model as as_model
from rebootdev.protobuf import as_str as as_str
from rebootdev.protobuf import from_bool as from_bool
from rebootdev.protobuf import from_dict as from_dict
from rebootdev.protobuf import from_float as from_float
from rebootdev.protobuf import from_int as from_int
from rebootdev.protobuf import from_list as from_list
from rebootdev.protobuf import from_message as from_message
from rebootdev.protobuf import from_model as from_model
from rebootdev.protobuf import from_str as from_str
from rebootdev.protobuf import pack as pack
from rebootdev.protobuf import to_json as to_json
from rebootdev.protobuf import unpack as unpack
