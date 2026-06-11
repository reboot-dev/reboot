import os
import shutil
from pathlib import Path
from reboot.aio.servicers import Routable
from reboot.aio.types import ApplicationId
from reboot.helpers import generate_proto_descriptor_set
from reboot.server.docker_local_envoy import DockerLocalEnvoy
from reboot.server.executable_local_envoy import ExecutableLocalEnvoy
from reboot.server.local_envoy import LocalEnvoy
from reboot.settings import (
    ENVOY_VERSION,
    ENVVAR_LOCAL_ENVOY_DEBUG,
    ENVVAR_LOCAL_ENVOY_MODE,
    ENVVAR_LOCAL_ENVOY_TLS_CERTIFICATE_PATH,
    ENVVAR_LOCAL_ENVOY_TLS_KEY_PATH,
    LocalEnvoyMode,
)

REBOOT_LOCAL_ENVOY_DEBUG: bool = os.environ.get(
    ENVVAR_LOCAL_ENVOY_DEBUG,
    'false',
).lower() == 'true'


class LocalEnvoyFactory:

    @staticmethod
    def pick_mode() -> LocalEnvoyMode:
        """Picks the mode in which a local Envoy proxy will run.

        An explicitly set `ENVVAR_LOCAL_ENVOY_MODE` is respected;
        otherwise we prefer a locally-installed Envoy, primarily so we
        don't depend on Docker when we can avoid it, and fall back to
        Docker if no `envoy` executable is found.
        """
        mode = os.environ.get(ENVVAR_LOCAL_ENVOY_MODE)
        if mode is None:
            if shutil.which('envoy') is not None:
                return LocalEnvoyMode.EXECUTABLE
            if shutil.which('docker') is not None:
                return LocalEnvoyMode.DOCKER
            raise ValueError(
                "To run a local Envoy proxy you must have either "
                f"`envoy` (version {ENVOY_VERSION}) or `docker` on "
                "your `PATH`; neither was found."
            )
        try:
            picked_mode = LocalEnvoyMode(mode)
        except ValueError:
            raise ValueError(
                f"Invalid value '{mode}' for '{ENVVAR_LOCAL_ENVOY_MODE}'; "
                "expected 'executable' or 'docker'."
            ) from None

        executable = (
            'envoy' if picked_mode is LocalEnvoyMode.EXECUTABLE else 'docker'
        )
        if shutil.which(executable) is None:
            raise ValueError(
                f"'{ENVVAR_LOCAL_ENVOY_MODE}' is set to '{mode}', but "
                f"`{executable}` was not found on your `PATH`."
            )

        return picked_mode

    @staticmethod
    def create(
        *,
        public_port: int,
        use_tls: bool,
        application_id: ApplicationId,
        routables: list[Routable],
    ) -> LocalEnvoy:
        file_descriptor_set = generate_proto_descriptor_set(routables)

        certificate_path = os.environ.get(
            ENVVAR_LOCAL_ENVOY_TLS_CERTIFICATE_PATH, None
        )
        certificate = (
            Path(certificate_path) if certificate_path is not None else None
        )

        key_path = os.environ.get(ENVVAR_LOCAL_ENVOY_TLS_KEY_PATH, None)
        key = Path(key_path) if key_path is not None else None

        assert certificate is None or key is not None

        mode = LocalEnvoyFactory.pick_mode()

        if mode is LocalEnvoyMode.DOCKER:
            return DockerLocalEnvoy(
                public_port=public_port,
                application_id=application_id,
                file_descriptor_set=file_descriptor_set,
                use_tls=use_tls,
                certificate=certificate,
                key=key,
                debug_mode=REBOOT_LOCAL_ENVOY_DEBUG,
            )

        assert mode is LocalEnvoyMode.EXECUTABLE
        return ExecutableLocalEnvoy(
            public_port=public_port,
            application_id=application_id,
            file_descriptor_set=file_descriptor_set,
            use_tls=use_tls,
            certificate=certificate,
            key=key,
            debug_mode=REBOOT_LOCAL_ENVOY_DEBUG,
        )
