Feature: Hello with a factory

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Messages record from creation onward
    Given "anonymous" creates a `Hello` of "greetings" via `create` with `initial_message="first message"`
    When "anonymous" does a `send` on `Hello` of "greetings" with `message="second message"`
    Then as "anonymous", `messages` on the `Hello` for "greetings" has `messages=["first message", "second message"]`
