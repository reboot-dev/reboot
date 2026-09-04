Feature: Hello with tasks

  Background:
    Given the application is up
    And the user is unauthenticated

  Scenario: Sent messages get a warning and then erase
    When the `Hello` for "testing-hello" gets a `send` with `message="Hello, World!"`
    And the resulting `task_id` is saved as `warning_task_id`
    # A completed task's response is the result, so the erase task's
    # ID saves from it the way any response property does.
    When the `warning` task with id "${warning_task_id}" of the `Hello` completes within 30 seconds
    And the resulting `task_id` is saved as `erase_task_id`
    And the `erase` task with id "${erase_task_id}" of the `Hello` completes within 30 seconds
    Then `messages` on the `Hello` for "testing-hello" has `messages` of length `1` and `messages[0]="Number of messages erased so far: 1"`
