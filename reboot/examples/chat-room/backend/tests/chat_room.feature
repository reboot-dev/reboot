Feature: Chat room

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Messages record in order
    When "anonymous" does a `send` with `message="Hello, World"` on `ChatRoom` of "testing-chat-room"
    Then as "anonymous", `messages` on the `ChatRoom` for "testing-chat-room" has `messages=["Hello, World"]`
    When "anonymous" does a `send` with `message="Hello, Reboot!"` on `ChatRoom` of "testing-chat-room"
    And "anonymous" does a `send` with `message="Hello, Peace of Mind!"` on `ChatRoom` of "testing-chat-room"
    Then as "anonymous", `messages` on the `ChatRoom` for "testing-chat-room" has `messages=["Hello, World", "Hello, Reboot!", "Hello, Peace of Mind!"]`
    And as "anonymous", `messages` on the `ChatRoom` for "testing-chat-room" has `messages` of length `3` and `messages` containing `"Hello, Reboot!"`
