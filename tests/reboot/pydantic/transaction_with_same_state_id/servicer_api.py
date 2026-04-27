from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Reader,
    Transaction,
    Type,
    Writer,
)
from typing import Optional


class MainTestState(Model):
    data: Optional[str] = Field(tag=1, default=None)


class SecondaryTestState(Model):
    data: Optional[list[str]] = Field(tag=1, default=None)


class TransactionRequest(Model):
    main_test_data: str = Field(tag=1)
    secondary_test_data: list[str] = Field(tag=2)


class GetDataResponse(Model):
    main_test_data: str = Field(tag=1)
    secondary_test_data: list[str] = Field(tag=2)


class WriterRequest(Model):
    data: list[str] = Field(tag=1)


class GetSecondaryDataResponse(Model):
    data: list[str] = Field(tag=1)


api = API(
    MainTest=Type(
        state=MainTestState,
        methods=Methods(
            transaction=Transaction(
                request=TransactionRequest,
                response=None,
                mcp=None,
            ),
            get_data=Reader(
                request=None,
                response=GetDataResponse,
                mcp=None,
            ),
        ),
    ),
    SecondaryTest=Type(
        state=SecondaryTestState,
        methods=Methods(
            writer=Writer(
                request=WriterRequest,
                response=None,
                mcp=None,
            ),
            get_data=Reader(
                request=None,
                response=GetSecondaryDataResponse,
                mcp=None,
            ),
        ),
    ),
)
