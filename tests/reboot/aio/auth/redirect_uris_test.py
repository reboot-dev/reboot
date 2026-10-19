import os
import unittest
from reboot.aio.auth.redirect_uris import skips_consent
from reboot.settings import ENVVAR_RBT_DEV


class SkipsConsentTest(unittest.TestCase):
    """Which redirect URIs sign users in without a consent screen."""

    def setUp(self) -> None:
        os.environ.pop(ENVVAR_RBT_DEV, None)

    def test_exact_match_on_the_allow_list(self):
        self.assertTrue(
            skips_consent(
                "myapp://redirect",
                skip_consent_for_redirect_uris=["myapp://redirect"],
            )
        )
        self.assertFalse(
            skips_consent(
                "myapp://redirect/other",
                skip_consent_for_redirect_uris=["myapp://redirect"],
            )
        )

    def test_same_origin_as_the_requested_resource(self):
        resource = "https://ben--counter--acme.dev.rbt.cloud"
        for redirect_uri in [
            "https://ben--counter--acme.dev.rbt.cloud/__/access/callback",
            "HTTPS://Ben--Counter--Acme.dev.rbt.cloud:443/cb",
        ]:
            self.assertTrue(
                skips_consent(
                    redirect_uri,
                    skip_consent_for_redirect_uris=[],
                    resource=resource,
                ),
                redirect_uri,
            )

    def test_another_origin_than_the_requested_resource(self):
        resource = "https://ben--counter--acme.dev.rbt.cloud"
        for redirect_uri in [
            # Another host.
            "https://attacker.example/cb",
            # Same host, other scheme.
            "http://ben--counter--acme.dev.rbt.cloud/cb",
            # Same host, other port.
            "https://ben--counter--acme.dev.rbt.cloud:8443/cb",
            # A suffix of the host.
            "https://dev.rbt.cloud/cb",
            # Not an `http(s)` URI at all.
            "myapp://ben--counter--acme.dev.rbt.cloud/cb",
        ]:
            self.assertFalse(
                skips_consent(
                    redirect_uri,
                    skip_consent_for_redirect_uris=[],
                    resource=resource,
                ),
                redirect_uri,
            )

    def test_without_a_resource_the_origin_does_not_matter(self):
        self.assertFalse(
            skips_consent(
                "http://localhost:1234/callback",
                skip_consent_for_redirect_uris=[],
            )
        )

    def test_expo_redirect_uri_only_under_rbt_dev(self):
        redirect_uri = "exp://192.168.1.2:8081/--/oauth"
        self.assertFalse(
            skips_consent(redirect_uri, skip_consent_for_redirect_uris=[])
        )
        os.environ[ENVVAR_RBT_DEV] = "true"
        self.assertTrue(
            skips_consent(redirect_uri, skip_consent_for_redirect_uris=[])
        )


if __name__ == "__main__":
    unittest.main()
