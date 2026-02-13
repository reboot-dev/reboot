import asyncio
import logging
from account_servicer import AccountServicer
from bank.v1.bank_rbt import Bank
from bank_servicer import BankServicer
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext

logging.basicConfig(level=logging.INFO)

SINGLETON_BANK_ID = 'reboot-bank'


async def initialize(context: InitializeContext):
    bank = Bank.ref(SINGLETON_BANK_ID)

    await bank.sign_up(context, customer_name="Initial User")


async def main():
    application = Application(
        servicers=[AccountServicer, BankServicer],
        initialize=initialize,
    )

    logging.info('The Reboot Bank is open for business! 🏦')

    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
