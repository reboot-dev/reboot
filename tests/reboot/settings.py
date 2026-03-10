from reboot.controller.settings import REBOOT_SHARDED_DATABASE_MIN_VERSION

# A version from before sharded databases were introduced. That change
# introduced a number of behavior changes that tests want to be able to
# opt out of to keep testing the old behavior.
REBOOT_VERSION_BEFORE_SHARDED_DATABASE = "0.37.0"
assert REBOOT_VERSION_BEFORE_SHARDED_DATABASE < REBOOT_SHARDED_DATABASE_MIN_VERSION
