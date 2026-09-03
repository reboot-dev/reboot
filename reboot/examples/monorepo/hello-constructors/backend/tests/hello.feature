Feature: Hello with a factory

  Background:
    Given the application is up
    And the user is unauthenticated

  Scenario: Messages record from creation onward
    Given a `Hello` for "greetings" gets created via `create` with `initial_message="first message"`
    When the `Hello` for "greetings" gets a `send` with `message="second message"`
    Then `messages` on the `Hello` for "greetings" has `messages=["first message", "second message"]`
