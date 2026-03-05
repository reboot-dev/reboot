import os
import sys
import unittest

os.environ["REBOOT_LOCAL_ENVOY_MODE"] = "docker"

if __name__ == '__main__':
    unittest.main(module='local_envoy_test', argv=sys.argv[:1])
