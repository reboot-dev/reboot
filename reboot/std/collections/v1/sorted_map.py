from __future__ import annotations

import log.log
from google.protobuf.empty_pb2 import Empty
from rbt.std.collections.v1.sorted_map_rbt import (
    Entry,
    GetRequest,
    GetResponse,
    InsertRequest,
    InsertResponse,
    InvalidRangeError,
    RangeRequest,
    RangeResponse,
    RemoveRequest,
    RemoveResponse,
    ReverseRangeRequest,
    ReverseRangeResponse,
    SortedMap,
)
from reboot.aio.applications import Library
from reboot.aio.auth.authorizers import allow_if, is_app_internal
from reboot.aio.contexts import ReaderContext, WriterContext
from typing import Optional

logger = log.log.get_logger(__name__)


class SortedMapServicer(SortedMap.singleton.Servicer):

    # Singleton authorizer as class variable.
    # Discussion here for singleton authorizer vs subclassing the servicer:
    # https://github.com/reboot-dev/mono/pull/5140#issuecomment-3667592432
    _authorizer: Optional[SortedMap.Authorizer] = None

    def authorizer(self):
        if self._authorizer:
            return self._authorizer
        else:
            return allow_if(all=[is_app_internal])

    async def Insert(
        self,
        context: WriterContext,
        state: SortedMap.State,
        request: InsertRequest,
    ) -> InsertResponse:
        context._colocated_upserts = list(request.entries.items())

        return InsertResponse()

    async def Remove(
        self,
        context: WriterContext,
        state: SortedMap.State,
        request: RemoveRequest,
    ) -> RemoveResponse:
        context._colocated_upserts = list((k, None) for k in request.keys)

        return RemoveResponse()

    async def Range(
        self,
        context: ReaderContext,
        state: Empty,
        request: RangeRequest,
    ) -> RangeResponse:
        if request.limit == 0:
            raise SortedMap.RangeAborted(
                InvalidRangeError(
                    message="Range requires a non-zero `limit` value."
                )
            )
        if request.HasField('start_key') and request.HasField('end_key'):
            if request.start_key >= request.end_key:
                raise SortedMap.RangeAborted(
                    InvalidRangeError(
                        message=(
                            "Range requires `end_key` to be larger than "
                            f"`start_key`; got start_key='{request.start_key}' "
                            f"and end_key='{request.end_key}'"
                        )
                    )
                )

        assert self._middleware is not None

        page = await self._middleware._state_manager.colocated_range(
            context,
            start=(
                request.start_key if request.HasField('start_key') else None
            ),
            end=(request.end_key if request.HasField('end_key') else None),
            limit=request.limit,
        )

        return RangeResponse(entries=[Entry(key=k, value=v) for k, v in page])

    async def ReverseRange(
        self,
        context: ReaderContext,
        state: Empty,
        request: ReverseRangeRequest,
    ) -> ReverseRangeResponse:
        if request.limit == 0:
            raise SortedMap.ReverseRangeAborted(
                InvalidRangeError(
                    message="ReverseRange requires a non-zero `limit` value."
                )
            )
        if request.HasField('start_key') and request.HasField('end_key'):
            if request.start_key <= request.end_key:
                raise SortedMap.ReverseRangeAborted(
                    InvalidRangeError(
                        message=(
                            "ReverseRange requires `end_key` to be smaller than "
                            f"`start_key`; got start_key='{request.start_key}' "
                            f"and end_key='{request.end_key}'"
                        )
                    )
                )

        assert self._middleware is not None

        page = await self._middleware._state_manager.colocated_reverse_range(
            context,
            start=(
                request.start_key if request.HasField('start_key') else None
            ),
            end=(request.end_key if request.HasField('end_key') else None),
            limit=request.limit,
        )

        return ReverseRangeResponse(
            entries=[Entry(key=k, value=v) for k, v in page]
        )

    async def Get(
        self,
        context: ReaderContext,
        state: Empty,
        request: GetRequest,
    ) -> GetResponse:
        # Implemented essentially the same as `Range`, but with the `end_key`
        # set to the smallest possible value after `start_key`.
        #
        # TODO: optimize this by using a point-lookup all the way down to the
        #       storage sidecar?
        assert self._middleware is not None

        page = await self._middleware._state_manager.colocated_range(
            context,
            start=request.key,
            # Add a one-byte to the end of the key to create the smallest
            # possible key after `start_key`. The one-byte is the correct answer
            # here because the zero-byte is forbidden in keys (see
            # `StateRef.from_id`). Since `end` is exclusive, this ensures that
            # we will only ever get exactly `start_key` in our result set.
            end=request.key + b'\x01'.decode('ascii'),
            limit=1,
        )

        assert len(page) <= 1

        if len(page) == 0:
            return GetResponse()  # Leaving 'value' unset means "not found".

        _, value = page[0]
        return GetResponse(value=value)


SORTED_MAP_LIBRARY_NAME = "reboot.std.collections.v1.sorted_map"


class SortedMapLibrary(Library):
    name = SORTED_MAP_LIBRARY_NAME

    def __init__(
        self,
        authorizer: Optional[SortedMap.Authorizer] = None,
    ):
        SortedMapServicer._authorizer = authorizer

    def servicers(self):
        return [SortedMapServicer]


def servicers():
    return [SortedMapServicer]


def sorted_map_library(authorizer: Optional[SortedMap.Authorizer] = None):
    return SortedMapLibrary(authorizer)
