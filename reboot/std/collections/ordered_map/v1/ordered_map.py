"""B-tree implementation backing `OrderedMap`.

`NodeServicer` implements an individual tree node and
`OrderedMapServicer` owns the root pointer and exposes the public
operations.

==========

- A node with `n` keys has `n` values (leaf) or `n + 1` children
  (inner). Inner-node key `i` is the separator between `children[i]`
  and `children[i + 1]`.

- For an inner node, all keys in `children[i]` are < `keys[i]`, and
  all keys in `children[i + 1]` are >= `keys[i]`. The leftmost child
  (`children[0]`) has no associated lower-bound separator -- its
  parent (or, for a leftmost-ancestor chain, the first non-leftmost
  ancestor) provides one. This is why `_insert_leaf` / `_insert_inner`
  only promote `merged_keys[1:]` (i.e., the first key of every sibling
  *after* the leftmost) when they split: the original leftmost piece
  keeps its slot in the parent and needs no new separator.

- Leaves are linked via `next_id` / `prev_id` to support forward /
  reverse range scans.

"""
import bisect
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
from rbt.std.item.v1.item_pb2 import Item
from rbt.v1alpha1.errors_pb2 import InvalidArgument, StateAlreadyConstructed
from reboot.aio.applications import Library
from reboot.aio.auth.authorizers import allow_if, is_app_internal
from reboot.aio.concurrently import concurrently
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from typing import AsyncGenerator, Awaitable, Optional

DEFAULT_DEGREE = 128


def _item_to_value(item: Item) -> Value:
    """Helper that converts an `Item` to a `Value`."""
    value = Value()
    if item.HasField("value"):
        value.value.CopyFrom(item.value)
    elif item.HasField("bytes"):
        value.bytes = item.bytes
    elif item.HasField("any"):
        value.any.CopyFrom(item.any)
    return value


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
                context,
                state,
                NodeCreateRequest(
                    degree=DEFAULT_DEGREE,
                    is_leaf=True,
                    keys=[],
                ),
            )

        if state.is_leaf:
            return await self._insert_leaf(
                context,
                state,
                request.entries,
            )
        else:
            return await self._insert_inner(
                context,
                state,
                request.entries,
            )

    async def _insert_leaf(
        self,
        context: TransactionContext,
        state: Node.State,
        entries: dict[str, bytes],
    ) -> NodeInsertResponse:
        # Sort incoming entries by key so we can do a sorted-merge
        # with the existing keys/values below.
        sorted_entries = sorted(entries.items())

        # Sorted-merge with existing keys/values.
        merged_keys: list[str] = []
        merged_values: list[bytes] = []
        inserted_count = 0

        i = 0  # Index into existing `state.keys`.
        j = 0  # Index into `sorted_entries`.
        existing_keys = state.keys
        existing_values = state.values

        while i < len(existing_keys) and j < len(sorted_entries):
            existing_key = existing_keys[i]
            new_key, new_value = sorted_entries[j]
            if existing_key < new_key:
                merged_keys.append(existing_key)
                merged_values.append(existing_values[i])
                i += 1
            elif existing_key == new_key:
                # Update existing key.
                merged_keys.append(new_key)
                merged_values.append(new_value)
                i += 1
                j += 1
            else:
                merged_keys.append(new_key)
                merged_values.append(new_value)
                inserted_count += 1
                j += 1

        # The above loop exhausted either the `existing_keys` or
        # `sorted_entries`, but we still need to add any of the
        # remaining from which ever is not exhausted.

        # Append remaining existing entries (if any).
        while i < len(existing_keys):
            merged_keys.append(existing_keys[i])
            merged_values.append(existing_values[i])
            i += 1

        # Append remaining new entries (if any).
        while j < len(sorted_entries):
            new_key, new_value = sorted_entries[j]
            merged_keys.append(new_key)
            merged_values.append(new_value)
            inserted_count += 1
            j += 1

        # Return now if no split is needed.
        if len(merged_keys) < state.degree:
            state.keys[:] = merged_keys
            state.values[:] = merged_values
            return NodeInsertResponse(
                inserted_count=inserted_count,
            )

        # Split into sibling nodes of `mid` keys each.
        mid = state.degree // 2
        old_next_id = state.next_id

        # Pre-compute all sibling IDs, keys, values, etc (excluding
        # the first `mid` keys which stay in this node) so we can
        # create them concurrently.
        siblings: list[tuple[str, list[str], list[bytes]]] = []
        position = mid
        len_merged_keys = len(merged_keys)
        while position < len_merged_keys:
            end = min(position + mid, len_merged_keys)
            sibling_keys = merged_keys[position:end]
            sibling_values = merged_values[position:end]

            # TODO: until we have colocation, can we create IDs for
            # leaf nodes that are located close to one another?
            # Ideally as we are higher up the tree we have more
            # separation of nodes but the lower down the tree we go
            # the more colocated we get.
            sibling_id = str(uuid.uuid4())

            siblings.append((sibling_id, sibling_keys, sibling_values))
            position = end

        # There should always be at least one sibling because
        # `len(merged_keys) >= degree > mid`.
        assert len(siblings) > 0

        # The first `mid` keys stay in this node.
        state.keys[:] = merged_keys[:mid]
        state.values[:] = merged_values[:mid]
        state.next_id = siblings[0][0]

        async def create_siblings():
            for i, (id, keys, values) in enumerate(siblings):
                # Last sibling chains to `old_next_id`; others chain
                # to the next sibling.
                if i + 1 < len(siblings):
                    next_id = siblings[i + 1][0]
                else:
                    next_id = old_next_id

                prev_id = siblings[i - 1][0] if i > 0 else context.state_id

                yield Node.ref(id).Create(
                    context,
                    degree=state.degree,
                    is_leaf=True,
                    keys=keys,
                    values=values,
                    next_id=next_id,
                    prev_id=prev_id,
                )

        # Each sibling is independent so we create them concurrently.
        await concurrently(create_siblings())

        # Each sibling's first key is the separator between it and the
        # preceding node/sibling. Return all promoted keys and child
        # IDs so the parent inner node can absorb them and split if
        # needed.
        return NodeInsertResponse(
            promoted_keys=[keys[0] for _, keys, _ in siblings],
            new_child_ids=[id for id, _, _ in siblings],
            inserted_count=inserted_count,
        )

    async def _insert_inner(
        self,
        context: TransactionContext,
        state: Node.State,
        entries: dict[str, bytes],
    ) -> NodeInsertResponse:
        # Grab references to existing state.
        existing_keys = state.keys
        existing_children_ids = state.children_ids
        total_children = len(state.children_ids)

        # Determine which entries we'll pass along recursively for
        # each child to insert.
        child_entries: list[dict[str,
                                 bytes]] = [{} for _ in range(total_children)]
        for key, value in entries.items():
            # We use `bisect` here as that is more efficient than
            # linearly scanning when we have sufficiently large
            # numbers of keys.
            #
            # Child `i` handles `key < existing_keys[i]`.
            i = bisect.bisect_right(existing_keys, key)
            child_entries[i][key] = value

        # Now recursively insert into each child that has entries.
        inserted_count = 0

        async def insert_children():
            for i in range(total_children):
                # If we don't have any entries for this child,
                # continue on to the next child.
                if len(child_entries[i]) == 0:
                    continue

                async def insert(j: int) -> tuple[int, NodeInsertResponse]:
                    child_id = existing_children_ids[j]
                    entries = child_entries[j]
                    response = await Node.ref(child_id).Insert(
                        context,
                        entries=entries,
                    )
                    return j, response

                yield insert(i)

        # Each child's insert is independent so run them concurrently!
        responses: dict[int, NodeInsertResponse] = {}
        async for i, response in concurrently(insert_children()):
            inserted_count += response.inserted_count
            # If this child split and is promoting any keys, we need
            # to incorporate them so store that here.
            if response.promoted_keys:
                responses[i] = response

        # Merge together existing keys and child IDs with any promoted
        # keys and child IDs from any splits caused by recursive
        # inserts.
        new_keys: list[str] = []
        new_children_ids: list[str] = []
        for i, child_id in enumerate(existing_children_ids):
            new_children_ids.append(child_id)
            if i in responses:
                # This child split and has promoted some keys.
                response = responses[i]
                for promoted_key, new_child_id in zip(
                    response.promoted_keys, response.new_child_ids
                ):
                    new_keys.append(promoted_key)
                    new_children_ids.append(new_child_id)
            if i < len(existing_keys):
                new_keys.append(existing_keys[i])

        # Return now if no split is needed.
        if len(new_keys) < state.degree:
            state.keys[:] = new_keys
            state.children_ids[:] = new_children_ids
            return NodeInsertResponse(
                inserted_count=inserted_count,
            )

        # Overflow: repeated binary splits. This node keeps the left
        # `mid` keys. The remaining keys are split into sibling inner
        # nodes of `mid` keys each, with separators promoted to the
        # parent — matching the tree shape that sequential single-key
        # inserts would produce.
        mid = state.degree // 2

        state.keys[:] = new_keys[:mid]
        state.children_ids[:] = new_children_ids[:mid + 1]

        promoted_keys: list[str] = []
        new_child_ids: list[str] = []

        # Pre-compute all sibling IDs, keys, child IDs, etc so we can
        # create them concurrently.
        siblings: list[tuple[str, list[str], list[str]]] = []
        position = mid
        len_new_keys = len(new_keys)
        while position < len_new_keys:
            # Key at `position` is the separator.
            promoted_keys.append(new_keys[position])
            position += 1

            # Next `mid` keys go into a new sibling.
            end = min(position + mid, len_new_keys)
            sibling_keys = new_keys[position:end]
            sibling_children_ids = (new_children_ids[position:end + 1])

            # TODO: similar to when creating leaf siblings, lets
            # consider whether we want to do our own version of
            # colocation by generating IDs that will be placed closer
            # together.
            sibling_id = str(uuid.uuid4())

            new_child_ids.append(sibling_id)

            siblings.append((sibling_id, sibling_keys, sibling_children_ids))
            position = end

        async def create_siblings():
            for id, keys, children_ids in siblings:
                yield Node.ref(id).Create(
                    context,
                    degree=state.degree,
                    is_leaf=False,
                    keys=keys,
                    children_ids=children_ids,
                )

        # Each sibling is independent so we create them concurrently.
        await concurrently(create_siblings())

        return NodeInsertResponse(
            promoted_keys=promoted_keys,
            new_child_ids=new_child_ids,
            inserted_count=inserted_count,
        )

    async def Remove(
        self,
        context: TransactionContext,
        state: Node.State,
        request: NodeRemoveRequest,
    ) -> NodeRemoveResponse:
        # Implicit construction so that removing from a
        # not-yet-created node is a no-op.
        if context.constructor:
            self._create(
                context,
                state,
                NodeCreateRequest(
                    degree=DEFAULT_DEGREE,
                    is_leaf=True,
                    keys=[],
                ),
            )

        if state.is_leaf:
            return self._remove_leaf(
                state,
                request.keys,
            )
        else:
            return await self._remove_inner(
                context,
                state,
                request.keys,
            )

    def _remove_leaf(
        self,
        state: Node.State,
        keys: list[str],
    ) -> NodeRemoveResponse:
        # TODO: currently empty/underfull leaves are left in place
        # rather than merged or rebalanced. Inserts still find them
        # via the parent's separator keys, so tree shape can degrade
        # from delete-heavy workloads.
        keys_to_remove = set(keys)
        removed_count = 0

        # Build new lists excluding removed keys.
        new_keys: list[str] = []
        new_values: list[bytes] = []
        for i, key in enumerate(state.keys):
            if key in keys_to_remove:
                removed_count += 1
            else:
                new_keys.append(key)
                new_values.append(state.values[i])

        state.keys[:] = new_keys
        state.values[:] = new_values
        return NodeRemoveResponse(removed_count=removed_count)

    async def _remove_inner(
        self,
        context: TransactionContext,
        state: Node.State,
        keys: list[str],
    ) -> NodeRemoveResponse:
        existing_keys = state.keys
        existing_children_ids = list(state.children_ids)
        total_children = len(state.children_ids)

        # Determine which keys we'll pass along recursively for each
        # child to remove.
        child_keys: list[list[str]] = [[] for _ in range(total_children)]
        for key in keys:
            # Child `i` handles `key < existing_keys[i]`.
            i = bisect.bisect_right(existing_keys, key)
            child_keys[i].append(key)

        removed_count = 0

        # Dispatch to each child concurrently.
        async def remove_children():
            for i in range(total_children):
                # If we don't have any keys for this child, continue
                # on to the next child.
                if len(child_keys[i]) == 0:
                    continue

                child_id = existing_children_ids[i]
                keys = child_keys[i]
                yield Node.ref(child_id).Remove(
                    context,
                    keys=keys,
                )

        async for response in concurrently(remove_children()):
            removed_count += response.removed_count

        return NodeRemoveResponse(
            removed_count=removed_count,
        )

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
        i = bisect.bisect_right(state.keys, key)
        return Node.ref(state.children_ids[i]), i

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

    def _check_construction_options(
        self,
        context,
        state: OrderedMap.State,
        degree: Optional[int],
        maintain_size: Optional[bool],
    ) -> Optional[str]:
        """
        Check that construction options match an already-constructed
        map. Returns an error message if they don't match, or `None`
        if they match (or were not specified).
        """
        errors: list[str] = []
        if degree is not None and degree != state.degree:
            errors.append(f"degree={state.degree}, requested degree={degree}")
        if maintain_size is not None and maintain_size != state.maintain_size:
            errors.append(
                f"maintain_size={state.maintain_size}, requested "
                f"maintain_size={maintain_size}"
            )
        if errors:
            return (
                f"OrderedMap with ID '{context.state_id}' already "
                f"created with {'; '.join(errors)}. `degree` and "
                "`maintain_size` are only required when implicitly "
                "constructing the map; if it already exists, omit "
                "them or pass values that match the existing map."
            )
        return None

    async def _build_root_levels(
        self,
        context: TransactionContext,
        degree: int,
        keys: list[str],
        children_ids: list[str],
    ) -> tuple[list[str], list[str]]:
        """
        Build up necessary levels above the given keys/children until they
        fit in a single root node, and return those keys/children.

        This is used by `OrderedMap.Insert` when the root `Node.Insert`
        returns multiple promoted keys — meaning the root itself
        overflowed and we need new root level(s).

        The tree is built bottom-up: each iteration groups the current
        level's keys/children into nodes of `mid` keys each, promoting
        separators between them to the next level.

        Example with degree=4, mid=2, 6 keys:

        Level 0 (input):
            keys:     [k1, k2, k3, k4, k5, k6]
            children: [C0, C1, C2, C3, C4, C5, C6]

        We group into nodes of `mid` keys each. The key between
        adjacent nodes is promoted to the next level:

            node A: keys=[k1, k2], children=[C0, C1, C2]
                    promoted separator: k3
            node B: keys=[k4, k5], children=[C3, C4, C5]
                    promoted separator: k6
            node C: keys=[],       children=[C6]
                    (last node; no separator after it)

        Level 1:
            keys:     [k3, k6]
            children: [A,  B,  C]

        Now 2 < degree, so we can return those keys=[k3, k6] and
        children=[A, B, C].
        """
        mid = degree // 2

        # Build levels bottom-up until all keys fit in a single node.
        while len(keys) >= degree:
            # `next_keys` and `next_children_ids` accumulate the level
            # above the one we are about to create. We cannot modify
            # `keys` / `children_ids` in place because we are reading
            # from them as we build nodes.
            next_keys: list[str] = []
            next_children_ids: list[str] = []

            # Pre-compute node IDs, keys, and children IDs, etc so we
            # can create them concurrently.
            nodes: list[tuple[str, list[str], list[str]]] = []
            position = 0
            len_keys = len(keys)
            while True:
                end = min(position + mid, len_keys)
                node_keys = keys[position:end]
                node_children = children_ids[position:end + 1]

                node_id = str(uuid.uuid4())
                nodes.append((node_id, node_keys, node_children))
                next_children_ids.append(node_id)

                if end < len_keys:
                    # The key at `end` is the separator
                    # between this node and the next — it
                    # gets promoted, not placed in either
                    # node.
                    next_keys.append(keys[end])
                    position = end + 1
                else:
                    break

            async def create_level(
                nodes: list[tuple[str, list[str], list[str]]],
            ) -> AsyncGenerator[Awaitable[NodeCreateResponse], None]:
                for id, keys, children_ids in nodes:
                    yield Node.ref(id).Create(
                        context,
                        degree=degree,
                        is_leaf=False,
                        keys=keys,
                        children_ids=children_ids,
                    )

            # Each level reduces the key count by a factor of ~mid, so
            # the number of nodes per level shrinks quickly. All
            # creates within a level are independent.
            await concurrently(create_level(nodes))

            # Advance to the next level up.
            keys = next_keys
            children_ids = next_children_ids

        # All remaining keys and children IDs fit in a single node.
        return keys, children_ids

    async def Create(
        self,
        context: TransactionContext,
        state: OrderedMap.State,
        request: OrderedMapCreateRequest,
    ) -> OrderedMapCreateResponse:
        if context.constructor:
            if request.HasField("degree") and request.degree < 2:
                raise OrderedMap.CreateAborted(
                    InvalidArgument(),
                    message="`degree` must be >= 2",
                )
        else:
            # Already constructed. Allow if the configuration matches;
            # reject if it differs.
            message = self._check_construction_options(
                context,
                state,
                degree=request.degree if request.HasField("degree") else None,
                maintain_size=request.maintain_size,
            )
            if message is not None:
                raise OrderedMap.CreateAborted(
                    StateAlreadyConstructed(),
                    message=message,
                )
            return OrderedMapCreateResponse()

        state.degree = (
            request.degree if request.HasField("degree") else DEFAULT_DEGREE
        )

        state.maintain_size = request.maintain_size
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
            if request.HasField("degree") and request.degree < 2:
                raise OrderedMap.InsertAborted(
                    InvalidArgument(),
                    message="`degree` must be >= 2",
                )

            state.degree = (
                request.degree
                if request.HasField("degree") else DEFAULT_DEGREE
            )
            state.maintain_size = (
                request.maintain_size
                if request.HasField("maintain_size") else False
            )
            state.root_id = str(uuid.uuid4())
            # Must allow `Node.Insert` to perform the implicit construction
            # of the `Node` because it is a transaction, and nested transactions
            # cannot touch the data a parent touches. However, we do need
            # to give it an ID.
        else:
            # Already constructed. Validate that any construction
            # options match.
            message = self._check_construction_options(
                context,
                state,
                degree=(
                    request.degree if request.HasField("degree") else None
                ),
                maintain_size=(
                    request.maintain_size
                    if request.HasField("maintain_size") else None
                ),
            )
            if message is not None:
                raise OrderedMap.InsertAborted(
                    InvalidArgument(),
                    message=message,
                )

        # Build node entries from either the bulk `entries` field or
        # the single-key fields.
        if len(request.entries) > 0:
            if (
                request.key or request.HasField("value") or
                request.HasField("bytes") or request.HasField("any")
            ):
                raise OrderedMap.InsertAborted(
                    InvalidArgument(),
                    message=(
                        "When using bulk `entries`, single-key fields "
                        "`key`, `value`, `bytes`, and `any` must all be unset"
                    ),
                )

            entries: dict[str, bytes] = {}
            for key, item in request.entries.items():
                entries[key] = _item_to_value(item).SerializeToString()
        else:
            value = Value()
            if request.HasField("value"):
                value.value.CopyFrom(request.value)
            elif request.HasField("bytes"):
                value.bytes = request.bytes
            elif request.HasField("any"):
                value.any.CopyFrom(request.any)
            else:
                raise OrderedMap.InsertAborted(
                    InvalidArgument(),
                )

            entries = {
                request.key: value.SerializeToString(),
            }

        root = Node.ref(state.root_id)

        response = await root.Insert(
            context,
            entries=entries,
        )

        if state.maintain_size:
            state.size += response.inserted_count

        # If the root split, build a new root, possibly building
        # multiple level(s) as necessary given `degree`.
        if len(response.promoted_keys) > 0:
            keys = response.promoted_keys
            children_ids = [root.state_id] + list(response.new_child_ids)

            if len(keys) >= state.degree:
                # Too many keys for one root, build out necessary
                # levels.
                keys, children_ids = await self._build_root_levels(
                    context,
                    state.degree,
                    keys,
                    children_ids,
                )

            # Keys fit in a single new root (or we built out the
            # necessary root levels so that they now fit in a single
            # new root), create it!
            state.root_id = str(uuid.uuid4())
            await Node.ref(state.root_id).Create(
                context,
                degree=state.degree,
                is_leaf=False,
                keys=keys,
                children_ids=children_ids,
            )

        return OrderedMapInsertResponse()

    async def Remove(
        self,
        context: TransactionContext,
        state: OrderedMap.State,
        request: OrderedMapRemoveRequest,
    ) -> OrderedMapRemoveResponse:
        # Implicit construction so that removing from a
        # not-yet-created map is a no-op rather than an
        # error.
        if context.constructor:
            state.degree = DEFAULT_DEGREE
            state.root_id = str(uuid.uuid4())

        # Build the keys list from either the bulk `keys`
        # field or the single-key `key` field.
        if request.keys:
            if request.key:
                raise OrderedMap.RemoveAborted(
                    InvalidArgument(),
                    message=(
                        "When using bulk `keys`, the "
                        "single-key `key` field must "
                        "be unset."
                    ),
                )
            keys = list(request.keys)
        else:
            keys = [request.key]

        root = Node.ref(state.root_id)
        response = await root.Remove(
            context,
            keys=keys,
        )

        if state.maintain_size:
            state.size -= response.removed_count

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

        return OrderedMapRangeResponse(
            entries=ordered_map_entries,
            total_size=state.size if state.maintain_size else None,
        )

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
