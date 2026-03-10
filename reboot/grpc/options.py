import json
from typing import Any, Optional, Tuple


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
