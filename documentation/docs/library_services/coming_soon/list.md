# List

A larger-than-memory `List`.

To imitate a `List` for:
* smaller-than-memory collections: use Protobuf's support for
  [`repeated`](https://protobuf.dev/programming-guides/proto2/#field-labels) values in your
  state type.
* larger-than-memory collections: use the Reboot standard library [`SortedMap`](/library_services/sorted_map) type with
  time-ordered [UUIDv1](https://en.wikipedia.org/wiki/Universally_unique_identifier#Versions_1_and_6_(date-time_and_MAC_address)) keys.

----

_If you'd like us to prioritize this standard library feature or you want to work
with us on it, [reach out to us on Discord.](https://discord.gg/cRbdcS94Nr)_
