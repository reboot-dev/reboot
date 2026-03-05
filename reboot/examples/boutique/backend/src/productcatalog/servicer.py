import json
import os
from boutique.v1 import demo_pb2
from boutique.v1.demo_rbt import ProductCatalog
from google.protobuf.json_format import ParseDict
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext


class ProductCatalogServicer(ProductCatalog.Servicer):

    def authorizer(self):
        return allow()

    async def load_products(
        self,
        context: WriterContext,
        request: demo_pb2.Empty,
    ) -> demo_pb2.Empty:
        with open(
            os.path.join(os.path.dirname(__file__), 'products.json'), 'r'
        ) as file:
            self.state.CopyFrom(
                ParseDict(json.load(file), ProductCatalog.State())
            )

        return demo_pb2.Empty()

    async def list_products(
        self,
        context: ReaderContext,
        request: demo_pb2.Empty,
    ) -> demo_pb2.ListProductsResponse:
        return demo_pb2.ListProductsResponse(products=self.state.products)

    async def get_product(
        self,
        context: ReaderContext,
        request: demo_pb2.GetProductRequest,
    ) -> demo_pb2.Product:
        for product in self.state.products:
            if request.id == product.id:
                return product
        # TODO: get parity with original implementation by returning a
        # status code NOT_FOUND + message instead of raising a
        # ValueError.
        raise ValueError(f"No product found with ID '{request.id}'")

    async def search_products(
        self,
        context: ReaderContext,
        request: demo_pb2.SearchProductsRequest,
    ) -> demo_pb2.SearchProductsResponse:
        raise NotImplementedError
