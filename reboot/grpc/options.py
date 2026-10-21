import ipaddress
import json
import urllib.parse
from typing import Any, Optional, Tuple

# gRPC sends a channel's connection through the proxy named by the
# `grpc_proxy`, `https_proxy` or `http_proxy` environment variable,
# unless `no_grpc_proxy` or `no_proxy` names the channel's target. A
# channel from Reboot to one of its own processes (the placement
# planner, the database, a server, the local Envoy) must never take
# that detour: such a proxy does not answer for a loopback or
# in-cluster address, so the channel waits for it forever. Shells
# behind a corporate proxy, and sandboxes that route all egress
# through a local one, set those variables without a `no_proxy`.
# See https://github.com/reboot-dev/reboot/issues/288.
NO_HTTP_PROXY_OPTIONS: list[tuple[str, Any]] = [
    ('grpc.enable_http_proxy', 0),
]


def is_loopback_target(target: str) -> bool:
    """Whether the gRPC `target`, a `host:port` optionally prefixed by
    `http://`, `https://` or `dns:///`, names this machine."""
    target = target.removeprefix('dns:///')
    if '://' not in target:
        target = '//' + target
    try:
        host = urllib.parse.urlsplit(target).hostname
    except ValueError:
        return False
    if host is None:
        return False
    if (
        host == 'localhost' or host.endswith('.localhost') or
        # `localhost.direct` and its subdomains resolve to 127.0.0.1;
        # `rbt dev` serves TLS on `dev.localhost.direct`.
        host == 'localhost.direct' or host.endswith('.localhost.direct')
    ):
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return address.is_loopback or address.is_unspecified


def http_proxy_options(target: str) -> list[tuple[str, Any]]:
    """Channel options for a channel to `target`, which may be outside
    Reboot: it honors the proxy environment variables unless `target` is
    on this machine, where no proxy can help."""
    return NO_HTTP_PROXY_OPTIONS if is_loopback_target(target) else []


def make_channel_options(
    *,
    service_config: Optional[str] = None,
    authority: Optional[str] = None,
    max_send_message_length: Optional[int] = None,
    max_receive_message_length: Optional[int] = None,
) -> list[tuple[str, Any]]:
    grpc_options: list[Tuple[str, Any]] = []

    if max_receive_message_length is not None:
        grpc_options.append(
            ('grpc.max_receive_message_length', max_receive_message_length)
        )
    if max_send_message_length is not None:
        grpc_options.append(
            ('grpc.max_send_message_length', max_send_message_length)
        )

    if service_config is not None:
        grpc_options.append(('grpc.service_config', service_config))

    if authority is not None:
        # The `authority` tells a gateway (if `server_address` is a gateway)
        # what the final destination of this RPC is intended to be.
        grpc_options.append(('grpc.default_authority', authority))

    return grpc_options


def make_retry_service_config(
    *,
    service: str = '',
    method: str = '',
    wait_for_ready: bool = True,
    max_attempts: int = 5,
    initial_backoff: str = '0.1s',
    max_backoff: str = '10s',
    backoff_multiplier: int = 2,
) -> str:
    """Returns a JSON representation of a ServiceConfig
    (https://github.com/grpc/grpc/blob/master/doc/service_config.md)
    that has been configured to retry on 'UNAVAILABLE'.

    If you don't specify a 'service' or a 'method' it will apply to
    all services and methods.

    By default we also set 'wait_for_ready' to 'True' since the point
    of these channel options are to ensure we can make a request, but
    you can change that by setting 'wait_for_ready' yourself.

    'max_attempts' must be between 1 and 5. Values greater than 5 are
    treated as 5 without being considered a validation error, see:
    https://github.com/grpc/proposal/blob/master/A6-client-retries.md#validation-of-retrypolicy

    """
    return json.dumps(
        {
            'methodConfig':
                [
                    {
                        'name': [{
                            'service': service,
                            'method': method,
                        }],
                        'wait_for_ready': wait_for_ready,
                        'retryPolicy':
                            {
                                'maxAttempts': max_attempts,
                                'initialBackoff': initial_backoff,
                                'maxBackoff': max_backoff,
                                'backoffMultiplier': backoff_multiplier,
                                'retryableStatusCodes': ['UNAVAILABLE'],
                            },
                    }
                ]
        }
    )


def make_retry_channel_options(
    *,
    service: str = '',
    method: str = '',
    wait_for_ready: bool = True,
    max_attempts: int = 5,
    initial_backoff: str = '0.1s',
    max_backoff: str = '10s',
    # TODO: Improve performance by decreasing backoff_multiplier to 2.
    # This change must be accompanied by refactoring respect Client to take
    # a backoff_multiplier otherwise a decrease will increase flakiness.
    backoff_multiplier: int = 4,
    authority: Optional[str] = None,
    max_send_message_length: Optional[int] = None,
    max_receive_message_length: Optional[int] = None
) -> list[tuple[str, Any]]:
    """Helper that wraps `make_channel_options` and `make_retry_service_config`.
    NOTE: on K8s you probably want to use this to handle scheduling delays!
    """
    return make_channel_options(
        service_config=make_retry_service_config(
            service=service,
            method=method,
            wait_for_ready=wait_for_ready,
            max_attempts=max_attempts,
            initial_backoff=initial_backoff,
            max_backoff=max_backoff,
            backoff_multiplier=backoff_multiplier,
        ),
        max_send_message_length=max_send_message_length,
        max_receive_message_length=max_receive_message_length,
        authority=authority,
    )
