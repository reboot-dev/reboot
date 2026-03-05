import grpc
import os
from google.api.httpbody_pb2 import HttpBody
from log.log import get_logger
from pathlib import Path
from rbt.v1alpha1.rootpage import rootpage_pb2_grpc
from rbt.v1alpha1.rootpage.rootpage_pb2 import RootPageRequest

logger = get_logger(__name__)


class RootPageServicer(rootpage_pb2_grpc.RootPageServicer):

    def add_to_server(self, server: grpc.aio.Server) -> None:
        rootpage_pb2_grpc.add_RootPageServicer_to_server(self, server)

    async def RootPage(
        self,
        request: RootPageRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> HttpBody:
        file = 'index.html'
        path = Path(os.path.join(os.path.dirname(__file__), file))
        return HttpBody(
            content_type='text/html; charset=utf-8',
            data=path.read_text().encode('utf-8'),
        )
