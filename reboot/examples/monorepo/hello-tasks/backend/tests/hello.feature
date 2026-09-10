Feature: Hello with tasks

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Sent messages get a warning and then erase
    When "anonymous" does a `send` with `message="Hello, World!"` on `Hello` of "testing-hello"
    And the resulting `task_id` is saved as "warning_task_id"
    # A completed task's response is the result, so the erase task's
    # ID saves from it the way any response property does.
    When "anonymous" awaits the `warning` task "<warning_task_id>" on `Hello` within 30 seconds
    And the resulting `task_id` is saved as "erase_task_id"
    And "anonymous" awaits the `erase` task "<erase_task_id>" on `Hello` within 30 seconds
    Then as "anonymous", `messages` on the `Hello` for "testing-hello" has `messages` of length `1` and `messages[0]="Number of messages erased so far: 1"`
