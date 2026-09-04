Feature: Chat room

  Background:
    Given the application is up
    And the user is unauthenticated

  Scenario: Messages record in order
    When the `ChatRoom` for "testing-chat-room" gets a `send` with `message="Hello, World"`
    Then `messages` on the `ChatRoom` for "testing-chat-room" has `messages=["Hello, World"]`
    When the `ChatRoom` for "testing-chat-room" gets a `send` with `message="Hello, Reboot!"`
    And the `ChatRoom` for "testing-chat-room" gets a `send` with `message="Hello, Peace of Mind!"`
    Then `messages` on the `ChatRoom` for "testing-chat-room" has `messages=["Hello, World", "Hello, Reboot!", "Hello, Peace of Mind!"]`
    And `messages` on the `ChatRoom` for "testing-chat-room" has `messages` of length `3` and `messages` containing `"Hello, Reboot!"`
