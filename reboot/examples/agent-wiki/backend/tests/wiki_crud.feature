Feature: Wiki, page, and transcript CRUD

  Background:
    Given the application is up
    And "alice" is an authenticated user

  Scenario: A created wiki appears in the user's list
    When "alice" does a `create_wiki` on `User` of "alice" with `name="my notes"` and `description="my personal notes"`
    And the resulting `wiki_id` is saved as "wiki_id"
    Then as "alice", `list_wikis` on the `User` for "alice" has `wikis` of length `1` and `wikis[0].wiki_id=<wiki_id>` and `wikis[0].name="my notes"` and `wikis[0].description="my personal notes"`

  Scenario: A fresh wiki updates its markdown body
    Given "alice" does a `create_wiki` on `User` of "alice" with `name="my notes"` and `description="my personal notes"`
    And the resulting `wiki_id` is saved as "wiki_id"
    Then as "alice", `get` on the `Wiki` for "<wiki_id>" has `name="my notes"` and `description="my personal notes"` and `content=""`
    When "alice" does a `update` on `Wiki` of "<wiki_id>" with `content="# Hello\n"`
    Then as "alice", `get` on the `Wiki` for "<wiki_id>" has `content="# Hello\n"`

  Scenario: Pages round-trip their title and body
    Given "alice" creates a `Page` via `create` with `title="My Page"` and `content="Initial body."` and `owner_id="alice"`
    And the resulting state id is saved as "page_id"
    Then as "alice", `get` on the `Page` for "<page_id>" has `title="My Page"` and `content="Initial body."`
    When "alice" does a `update` on `Page` of "<page_id>" with `title="Renamed Page"` and `content="New body."`
    Then as "alice", `get` on the `Page` for "<page_id>" has `title="Renamed Page"` and `content="New body."`

  Scenario: Transcripts round-trip their messages
    Given "alice" creates a `Transcript` via `create` with `messages=[{role: "user", content: "Hello"}, {role: "assistant", content: "Hi!"}]` and `owner_id="alice"`
    And the resulting state id is saved as "transcript_id"
    Then as "alice", `get` on the `Transcript` for "<transcript_id>" has `messages` of length `2` and `messages[0].role="user"` and `messages[0].content="Hello"` and `messages[1].role="assistant"` and `messages[1].content="Hi!"`
    When "alice" does a `update` on `Transcript` of "<transcript_id>" with `messages=[{role: "user", content: "Goodbye"}]`
    Then as "alice", `get` on the `Transcript` for "<transcript_id>" has `messages` of length `1` and `messages[0].content="Goodbye"`
