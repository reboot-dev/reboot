"""Owned canonical PlacementPlanner stream for the fixed two-host proof."""
import concurrent.futures, signal, sys, threading
from pathlib import Path
import grpc
from rbt.v1alpha1 import placement_planner_pb2 as p, placement_planner_pb2_grpc as g
stopped = threading.Event()
class Planner(g.PlacementPlannerServicer):
    def ListenForPlan(self, request, context):
        yield p.ListenForPlanResponse.FromString(Path(sys.argv[2]).read_bytes())
        while context.is_active() and not stopped.wait(.05):
            pass
server = grpc.server(concurrent.futures.ThreadPoolExecutor(max_workers=4))
g.add_PlacementPlannerServicer_to_server(Planner(), server)
assert server.add_insecure_port(sys.argv[1])
for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]:
    signal.signal(sig, lambda *_: stopped.set())
server.start()
stopped.wait()
server.stop(2).wait(3)
