Feature: Adding transcripts to a wiki

  Background:
    Given the application is up
    And the authenticated user is "alice"

  Scenario: Adding a transcript creates it
    Given the `User` for "alice" gets a `create_wiki` with `name="notes"` and `description=""`
    And the resulting `wiki_id` is saved as `wiki_id`
    When the `Wiki` for "${wiki_id}" gets a `add_transcript` with `messages=[{role: "user", content: "Hi."}, {role: "assistant", content: "Hello!"}]`
    And the resulting `transcript_id` is saved as `transcript_id`
    Then `get` on the `Transcript` for "${transcript_id}" has `messages` of length `2` and `messages[0].content="Hi."` and `messages[1].content="Hello!"`
