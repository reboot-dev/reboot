import asyncio
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext
from store.v1.store_rbt import Store
from store_servicer import StoreServicer
from warehouse.v1.warehouse_rbt import Warehouse
from warehouse_servicer import WarehouseServicer

STORE_ID = 'store'
WAREHOUSE_ID = 'warehouse'


async def initialize(context: InitializeContext):
    await Store.create(context, STORE_ID)
    await Warehouse.create(context, WAREHOUSE_ID)


async def main():
    await Application(
        servicers=[StoreServicer, WarehouseServicer],
        initialize=initialize,
    ).run()


if __name__ == '__main__':
    asyncio.run(main())
