Feature: Hello with a factory

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Messages record from creation onward
    Given as "anonymous", a `Hello` for "greetings" gets created via `create` with `initial_message="first message"`
    When as "anonymous", the `Hello` for "greetings" gets a `send` with `message="second message"`
    Then as "anonymous", `messages` on the `Hello` for "greetings" has `messages=["first message", "second message"]`
