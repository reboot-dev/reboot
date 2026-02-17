import uuid
from rbt.std.collections.ordered_map.v1.ordered_map_rbt import (
    Entry,
    InvalidRangeError,
    Node,
    NodeCreateRequest,
    NodeCreateResponse,
    NodeEntry,
    NodeInsertRequest,
    NodeInsertResponse,
    NodeRangeRequest,
    NodeRangeResponse,
    NodeRemoveRequest,
    NodeRemoveResponse,
    NodeReverseRangeRequest,
    NodeReverseRangeResponse,
    NodeSearchRequest,
    NodeSearchResponse,
    NodeStringifyRequest,
    NodeStringifyResponse,
    OrderedMap,
    OrderedMapCreateRequest,
    OrderedMapCreateResponse,
    OrderedMapInsertRequest,
    OrderedMapInsertResponse,
    OrderedMapRangeRequest,
    OrderedMapRangeResponse,
    OrderedMapRemoveRequest,
    OrderedMapRemoveResponse,
    OrderedMapReverseRangeRequest,
    OrderedMapReverseRangeResponse,
    OrderedMapSearchRequest,
    OrderedMapSearchResponse,
    OrderedMapStringifyRequest,
    OrderedMapStringifyResponse,
    Value,
)
from rbt.v1alpha1.errors_pb2 import InvalidArgument, StateAlreadyConstructed
from reboot.aio.applications import Library
from reboot.aio.auth.authorizers import allow_if, is_app_internal
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from typing import Optional

DEFAULT_DEGREE = 128


class NodeServicer(Node.singleton.Servicer):

    def authorizer(self):
        return allow_if(all=[is_app_internal])

    def _create(
        self,
        context: WriterContext | TransactionContext,
        state: Node.State,
        request: NodeCreateRequest,
    ) -> None:
        state.degree = request.degree
        state.is_leaf = request.is_leaf
        state.keys.extend(request.keys)
        state.children_ids.extend(request.children_ids)
        state.values.extend(request.values)
        state.next_id = request.next_id
        state.prev_id = request.prev_id

    async def Create(
        self,
        context: WriterContext,
        state: Node.State,
        request: NodeCreateRequest,
    ) -> NodeCreateResponse:
        if not context.constructor:
            raise Node.CreateAborted(
                StateAlreadyConstructed(),
                message=(
                    "Cannot call `Create` after `Create` or `Insert` "
                    "has been called."
                ),
            )

        self._create(context, state, request)
        return NodeCreateResponse()

    async def Search(
        self,
        context: ReaderContext,
        state: Node.State,
        request: NodeSearchRequest,
    ) -> NodeSearchResponse:
        found = False
        value = None
        if state.is_leaf:
            for i, k in enumerate(state.keys):
                if request.key == k:
                    found = True
                    value = state.values[i]
                    break
        else:
            child, _ = self._find_child(state, key=request.key)
            response = await child.Search(context, key=request.key)
            found = response.found
            value = response.value
        return NodeSearchResponse(found=found, value=value)

    async def Insert(
        self,
        context: TransactionContext,
        state: Node.State,
        request: NodeInsertRequest,
    ) -> NodeInsertResponse:
        # Implicit construction of root. This should only happen on
        # implicit construction of the `OrderedMap`.
        if context.constructor:
            self._create(
                context, state,
                NodeCreateRequest(
                    degree=DEFAULT_DEGREE,
                    is_leaf=True,
                    keys=[],
                )
            )

        if state.is_leaf:
            inserted = False
            for i, k in enumerate(state.keys):
                if request.key == k:
                    state.values[i] = request.value
                elif request.key < k:
                    state.keys.insert(i, request.key)
                    state.values.insert(i, request.value)
                else:
                    continue
                inserted = True
                break
            if not inserted:
                state.keys.append(request.key)
                state.values.append(request.value)

            if len(state.keys) < state.degree:
                return NodeInsertResponse(split=False)
        else:
            child, ordered_map = self._find_child(state, key=request.key)
            response = await child.Insert(
                context,
                key=request.key,
                value=request.value,
            )

            if not response.split:
                return NodeInsertResponse(split=False)

            # Child split, we possibly need to split too.
            promoted_key = response.promoted_key
            new_child_id = response.new_child_id

            state.keys.insert(ordered_map, promoted_key)
            state.children_ids.insert(ordered_map + 1, new_child_id)

            if len(state.keys) < state.degree:
                return NodeInsertResponse(split=False)

        # Split.
        mid = state.degree // 2

        new_child_id = str(uuid.uuid4())
        await Node.ref(new_child_id).Create(
            context,
            degree=state.degree,
            is_leaf=state.is_leaf,
            keys=state.keys[mid:] if state.is_leaf else state.keys[mid + 1:],
            children_ids=[] if state.is_leaf else state.children_ids[mid + 1:],
            values=state.values[mid:] if state.is_leaf else [],
            next_id=state.next_id,
            prev_id=context.state_id if state.is_leaf else "",
        )
        promoted_key = state.keys[mid]
        state.keys[:] = state.keys[:mid]
        state.children_ids[:] = (
            [] if state.is_leaf else state.children_ids[:mid + 1]
        )
        state.values[:] = state.values[:mid] if state.is_leaf else []
        state.next_id = new_child_id if state.is_leaf else ""

        return NodeInsertResponse(
            split=True,
            promoted_key=promoted_key,
            new_child_id=new_child_id,
        )

    async def Remove(
        self,
        context: TransactionContext,
        state: Node.State,
        request: NodeRemoveRequest,
    ) -> NodeRemoveResponse:
        if state.is_leaf:
            for i, k in enumerate(state.keys):
                if request.key == k:
                    state.keys.pop(i)
                    state.values.pop(i)
                    return NodeRemoveResponse()
        else:
            child, _ = self._find_child(state, key=request.key)
            await child.Remove(context, key=request.key)
        return NodeRemoveResponse()

    async def Range(
        self,
        context: ReaderContext,
        state: Node.State,
        request: NodeRangeRequest,
    ) -> NodeRangeResponse:
        if request.limit == 0:
            raise Node.RangeAborted(
                InvalidRangeError(
                    message="Range requires a non-zero `limit` value."
                )
            )

        entries: list[NodeEntry] = []

        if state.is_leaf:
            start_ordered_map = 0
            if request.start_key:
                for i, k in enumerate(state.keys):
                    if request.start_key <= k:
                        start_ordered_map = i
                        break

            remaining = request.limit
            for i in range(
                start_ordered_map,
                min(len(state.keys), start_ordered_map + remaining)
            ):
                entries.append(
                    NodeEntry(key=state.keys[i], value=state.values[i])
                )
                remaining -= 1

            if remaining > 0 and state.next_id:
                next_node = Node.ref(state.next_id)
                response = await next_node.Range(
                    context,
                    start_key=request.start_key,
                    limit=remaining,
                )
                entries.extend(response.entries)
        else:
            if not request.start_key:
                # If no start key is provided, we start from the first
                # child.
                child = Node.ref(state.children_ids[0])
            else:
                child, _ = self._find_child(state, key=request.start_key)
            return await child.Range(
                context,
                start_key=request.start_key,
                limit=request.limit,
            )
        return NodeRangeResponse(entries=entries)

    async def ReverseRange(
        self,
        context: ReaderContext,
        state: Node.State,
        request: NodeReverseRangeRequest,
    ) -> NodeReverseRangeResponse:
        if request.limit == 0:
            raise Node.ReverseRangeAborted(
                InvalidRangeError(
                    message="Reverse range requires a non-zero `limit` value."
                )
            )

        entries: list[NodeEntry] = []

        if state.is_leaf:
            start_ordered_map = len(state.keys) - 1
            if request.start_key:
                for i in range(len(state.keys) - 1, -1, -1):
                    k = state.keys[i]
                    if request.start_key >= k:
                        start_ordered_map = i
                        break

            remaining = request.limit
            for i in range(
                start_ordered_map, max(-1, start_ordered_map - remaining), -1
            ):
                entries.append(
                    NodeEntry(key=state.keys[i], value=state.values[i])
                )
                remaining -= 1

            if remaining > 0 and state.prev_id:
                prev_node = Node.ref(state.prev_id)
                response = await prev_node.ReverseRange(
                    context,
                    start_key=request.start_key,
                    limit=remaining,
                )
                entries.extend(response.entries)
        else:
            if not request.start_key:
                # If no start key is provided, we start from the last
                # child.
                child = Node.ref(state.children_ids[-1])
            else:
                child, _ = self._find_child(state, key=request.start_key)
            return await child.ReverseRange(
                context,
                start_key=request.start_key,
                limit=request.limit,
            )
        return NodeReverseRangeResponse(entries=entries)

    def _find_child(
        self,
        state,
        *,
        key: str,
    ) -> tuple[Node.WeakReference, int]:
        assert not state.is_leaf
        for i, k in enumerate(state.keys):
            if key < k:
                return Node.ref(state.children_ids[i]), i
        return Node.ref(state.children_ids[len(state.keys)]), len(state.keys)

    async def Stringify(
        self,
        context: ReaderContext,
        state: Node.State,
        request: NodeStringifyRequest,
    ) -> NodeStringifyResponse:
        if state.is_leaf:
            value = "  " * request.level + f"Leaf: {state.keys}\n"
        else:
            value = "  " * request.level + f"Inner: {state.keys}\n"
            for child_id in state.children_ids:
                child = Node.ref(child_id)
                response = await child.Stringify(
                    context,
                    level=request.level + 1,
                )
                value += response.value
        return NodeStringifyResponse(value=value)


class OrderedMapServicer(OrderedMap.singleton.Servicer):

    # Singleton authorizer as class variable.
    # Discussion here for singleton authorizer vs subclassing the servicer:
    # https://github.com/reboot-dev/mono/pull/5140#issuecomment-3667592432
    _authorizer: Optional[OrderedMap.Authorizer] = None

    def authorizer(self):
        if self._authorizer:
            return self._authorizer
        else:
            return allow_if(all=[is_app_internal])

    async def Create(
        self,
        context: TransactionContext,
        state: OrderedMap.State,
        request: OrderedMapCreateRequest,
    ) -> OrderedMapCreateResponse:
        if not context.constructor:
            raise OrderedMap.CreateAborted(
                StateAlreadyConstructed(),
                message=(
                    "Cannot call `Create` after `Create` or `Insert` "
                    "has been called."
                ),
            )

        state.degree = request.degree
        state.root_id = str(uuid.uuid4)
        await Node.ref(state.root_id).Create(
            context,
            degree=request.degree,
            is_leaf=True,
            keys=[],
        )
        return OrderedMapCreateResponse()

    async def Search(
        self,
        context: ReaderContext,
        state: OrderedMap.State,
        request: OrderedMapSearchRequest,
    ) -> OrderedMapSearchResponse:
        root = Node.ref(state.root_id)
        response = await root.Search(context, key=request.key)
        if response.found:
            assert response.HasField("value")
            value = Value()
            value.ParseFromString(response.value)
            if value.HasField("value"):
                return OrderedMapSearchResponse(
                    found=response.found,
                    value=value.value,
                )
            elif value.HasField("bytes"):
                return OrderedMapSearchResponse(
                    found=response.found,
                    bytes=value.bytes,
                )
            else:
                assert value.HasField("any")
                return OrderedMapSearchResponse(
                    found=response.found,
                    any=value.any,
                )

        return OrderedMapSearchResponse(found=False)

    async def Insert(
        self,
        context: TransactionContext,
        state: OrderedMap.State,
        request: OrderedMapInsertRequest,
    ) -> OrderedMapInsertResponse:

        # Construct the map if not yet constructed.
        if context.constructor:
            state.degree = DEFAULT_DEGREE
            state.root_id = str(uuid.uuid4())
            # Must allow `Node.Insert` to perform the implicit construction
            # of the `Node` because it is a transaction, and nested transactions
            # cannot touch the data a parent touches. However, we do need
            # to give it an ID.

        value = Value()
        if request.HasField("value"):
            value.value.CopyFrom(request.value)
        elif request.HasField("bytes"):
            value.bytes = request.bytes
        elif request.HasField("any"):
            value.any.CopyFrom(request.any)
        else:
            raise OrderedMap.InsertAborted(InvalidArgument())

        root = Node.ref(state.root_id)

        response = await root.Insert(
            context,
            key=request.key,
            value=value.SerializeToString(),
        )

        if response.split:
            promoted_key = response.promoted_key
            new_child_id = response.new_child_id
            state.root_id = str(uuid.uuid4())
            await Node.ref(state.root_id).Create(
                context,
                degree=state.degree,
                is_leaf=False,
                keys=[promoted_key],
                children_ids=[root.state_id, new_child_id],
            )

        return OrderedMapInsertResponse()

    async def Remove(
        self,
        context: TransactionContext,
        state: OrderedMap.State,
        request: OrderedMapRemoveRequest,
    ) -> OrderedMapRemoveResponse:
        root = Node.ref(state.root_id)
        await root.Remove(context, key=request.key)
        return OrderedMapRemoveResponse()

    async def Range(
        self,
        context: ReaderContext,
        state: OrderedMap.State,
        request: OrderedMapRangeRequest,
    ) -> OrderedMapRangeResponse:
        root = Node.ref(state.root_id)
        node_response = await root.Range(
            context,
            start_key=request.start_key,
            limit=request.limit,
        )

        ordered_map_entries = await self._entry_from_node_entry(
            node_response.entries
        )

        return OrderedMapRangeResponse(entries=ordered_map_entries)

    async def ReverseRange(
        self,
        context: ReaderContext,
        state: OrderedMap.State,
        request: OrderedMapReverseRangeRequest,
    ) -> OrderedMapReverseRangeResponse:
        root = Node.ref(state.root_id)
        node_response = await root.ReverseRange(
            context,
            start_key=request.start_key,
            limit=request.limit,
        )

        ordered_map_entries = await self._entry_from_node_entry(
            node_response.entries
        )

        return OrderedMapReverseRangeResponse(entries=ordered_map_entries)

    async def _entry_from_node_entry(
        self,
        node_entries: list[NodeEntry],
    ) -> list[Entry]:
        ordered_map_entries: list[Entry] = []

        for node_entry in node_entries:
            ordered_map_entry = Entry(key=node_entry.key)
            value = Value()
            value.ParseFromString(node_entry.value)
            if value.HasField("value"):
                ordered_map_entry.value.CopyFrom(value.value)
            elif value.HasField("bytes"):
                ordered_map_entry.bytes = value.bytes
            else:
                assert value.HasField("any")
                ordered_map_entry.any.CopyFrom(value.any)
            ordered_map_entries.append(ordered_map_entry)

        return ordered_map_entries

    async def Stringify(
        self,
        context: ReaderContext,
        state: OrderedMap.State,
        request: OrderedMapStringifyRequest,
    ) -> OrderedMapStringifyResponse:
        root = Node.ref(state.root_id)
        response = await root.Stringify(context, level=0)
        return OrderedMapStringifyResponse(value=response.value)


ORDERED_MAP_LIBRARY_NAME = "reboot.std.collections.ordered_map.v1.ordered_map"


class OrderedMapLibrary(Library):
    name = ORDERED_MAP_LIBRARY_NAME

    def __init__(
        self,
        authorizer: Optional[OrderedMap.Authorizer] = None,
    ):
        OrderedMapServicer._authorizer = authorizer

    def servicers(self):
        return [OrderedMapServicer, NodeServicer]


def servicers():
    return [
        OrderedMapServicer,
        NodeServicer,
    ]


def ordered_map_library(authorizer: Optional[OrderedMap.Authorizer] = None):
    return OrderedMapLibrary(authorizer)
