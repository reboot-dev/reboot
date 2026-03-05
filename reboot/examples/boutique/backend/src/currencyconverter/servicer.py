import grpc
import json
import os
from boutique.v1 import demo_pb2, demo_pb2_grpc
from reboot.aio.auth.authorizers import allow

NANOS_CONVERSION = 1000000000


class CurrencyConverterServicer(demo_pb2_grpc.CurrencyConverterServicer):

    def __init__(self):
        self.conversions_from_euro: dict[str, float] = {}
        with open(
            os.path.join(
                os.path.dirname(__file__), 'currency_conversions.json'
            ), 'r'
        ) as file:
            for key, value in json.load(file).items():
                self.conversions_from_euro[key] = float(value)

    def authorizer(self):
        return allow()

    async def GetSupportedCurrencies(
        self, request: demo_pb2.Empty, context: grpc.ServicerContext
    ) -> demo_pb2.GetSupportedCurrenciesResponse:
        return demo_pb2.GetSupportedCurrenciesResponse(
            currency_codes=self.conversions_from_euro.keys()
        )

    async def Convert(
        self, request: demo_pb2.CurrencyConversionRequest,
        context: grpc.ServicerContext
    ) -> demo_pb2.CurrencyConversionResponse:
        response_products = []
        for product in request.products:
            original_amount_total_nanos = (
                product.price.units * NANOS_CONVERSION
            ) + product.price.nanos

            from_conversion = self.conversions_from_euro[
                product.price.currency_code]
            to_conversion = self.conversions_from_euro[request.to_code]

            total_nanos_converted = (
                original_amount_total_nanos * to_conversion / from_conversion
            )

            response_products.append(
                demo_pb2.Product(
                    id=product.id,
                    name=product.name,
                    description=product.description,
                    picture=product.picture,
                    price=demo_pb2.Money(
                        currency_code=request.to_code,
                        units=int(total_nanos_converted / NANOS_CONVERSION),
                        nanos=int(total_nanos_converted % NANOS_CONVERSION)
                    ),
                )
            )

        return demo_pb2.CurrencyConversionResponse(products=response_products)
