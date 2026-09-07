Feature: Adding transcripts to a wiki

  Background:
    Given the application is up
    And "alice" is an authenticated user

  Scenario: Adding a transcript creates it
    Given "alice" does a `create_wiki` on `User` of "alice" with `name="notes"` and `description=""`
    And the resulting `wiki_id` is saved as "wiki_id"
    When "alice" does a `add_transcript` on `Wiki` of "<wiki_id>" with `messages=[{role: "user", content: "Hi."}, {role: "assistant", content: "Hello!"}]`
    And the resulting `transcript_id` is saved as "transcript_id"
    Then as "alice", `get` on the `Transcript` for "<transcript_id>" has `messages` of length `2` and `messages[0].content="Hi."` and `messages[1].content="Hello!"`
