Feature: Chat room

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Messages record in order
    When as "anonymous", the `ChatRoom` for "testing-chat-room" gets a `send` with `message="Hello, World"`
    Then as "anonymous", `messages` on the `ChatRoom` for "testing-chat-room" has `messages=["Hello, World"]`
    When as "anonymous", the `ChatRoom` for "testing-chat-room" gets a `send` with `message="Hello, Reboot!"`
    And as "anonymous", the `ChatRoom` for "testing-chat-room" gets a `send` with `message="Hello, Peace of Mind!"`
    Then as "anonymous", `messages` on the `ChatRoom` for "testing-chat-room" has `messages=["Hello, World", "Hello, Reboot!", "Hello, Peace of Mind!"]`
    And as "anonymous", `messages` on the `ChatRoom` for "testing-chat-room" has `messages` of length `3` and `messages` containing `"Hello, Reboot!"`
