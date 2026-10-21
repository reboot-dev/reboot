Feature: Hello with a factory

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Messages record from creation onward
    Given "anonymous" creates a `Hello` via `create` with `initial_message="first message"`
    And the resulting state id is saved as "hello_id"
    When "anonymous" does a `send` with `message="second message"` on `Hello` of "<hello_id>"
    Then as "anonymous", `messages` on the `Hello` for "<hello_id>" has `messages=["first message", "second message"]`
