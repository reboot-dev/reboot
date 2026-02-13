import asyncio
from chat.v1.channel_rbt import Channel
from chatbot.v1.chatbot_rbt import Chatbot
from reboot.aio.applications import Application
from reboot.std.collections.queue.v1.queue import QueueServicer
from reboot.std.index.v1 import index
from reboot.std.presence.v1 import presence
from reboot.std.pubsub.v1.pubsub import PubSubServicer
from servicers.channel import ChannelServicer
from servicers.chatbot import ChatbotServicer
from servicers.message import MessageServicer
from servicers.user import UserServicer, UsersServicer


async def initialize(context):
    await Channel.create(context, "channel")

    await Chatbot.create(
        context,
        name="Fact Checker",
        channel_id="channel",
        prompt="You are a chatbot who reads messages and if the messages "
        "appear to be making any factual claims then you fact check "
        "the claims and respond whether or not you believe the "
        "claims are true or false. If the messages are not making "
        "any factual claims, do nothing. Otherwise, explain why the claim is false "
        "first explaining which factual claim you are referring to, "
        "directly including the author and the text or at least "
        "a snippet of the text.",
        human_in_the_loop=False,
    )


async def main():

    await Application(
        servicers=[
            ChannelServicer,
            UserServicer,
            UsersServicer,
            MessageServicer,
            ChatbotServicer,
            QueueServicer,
            PubSubServicer,
        ] + index.servicers() + presence.servicers(),
        initialize=initialize,
    ).run()


if __name__ == '__main__':
    asyncio.run(main())
