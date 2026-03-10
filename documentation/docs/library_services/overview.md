import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

# Overview

## Standard library

The standard library uses Reboot's capabilities to build powerful data structures and APIs for common tasks.

The current libraries are:
* [PubSub](./pubsub) - A pub/sub implementation that enables you to subscribe and broadcast to topics.
* [Queue](./queue) - A durable queue implementation that allows you to enqueue and dequeue items.
* [OrderedMap](./ordered_map) - A newer implementation of a collection / dictionary / map that may be larger than memory. We recommend using this.
* [SortedMap](./sorted_map) - A older implementation of a collection / dictionary / map that may be larger than memory, and
  which is efficiently mapped to Reboot's underlying storage.

## Integrations

Reboot's integrations add clean, surefire APIs to interact with third party services. Because interactions with external services are [isolated as side-effects](/learn_more/side_effects), you can confidently use an integration's API -- knowing that it will safely compose, and without worrying about whether it might partially fail or retry unsafely.

The currently supported integrations are:
* [Mailgun](./mailgun) - Integration that supports sending email messages using the Mailgun API.


## Usage

To use a library service, you must update the list of servicers when starting
your `Application` to include each library service your code uses. For example:

<Tabs groupId="language">
  <TabItem value="python" label="Python" default>
```py
from reboot.std.collections.v1.sorted_map import sorted_map_library

async def main():
    application = Application(
        servicers=[ChatRoomServicer],
        libraries=[sorted_map_library()],
    )

    await application.run()
```
  </TabItem>
  <TabItem value="typescript" label="TypeScript">
```ts
import sortedMap, {
  SortedMap,
} from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";

new Application({
  servicers: [ChatRoomServicer, ...sortedMap.servicers()],
  initialize,
}).run();
```
  </TabItem>
</Tabs>

## Future libraries and integrations

[Reach out to us](https://discord.gg/cRbdcS94Nr) if there are any integrations or standard library features you want us to prioritize. Or we can help you build them, if that's more your speed!
