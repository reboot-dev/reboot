Feature: Wiki, page, and transcript CRUD

  Background:
    Given the application is up
    And the authenticated user is "alice"

  Scenario: A created wiki appears in the user's list
    When the `User` for "alice" gets a `create_wiki` with `name="my notes"` and `description="my personal notes"`
    And the resulting `wiki_id` is saved as `wiki_id`
    Then `list_wikis` on the `User` for "alice" has `wikis` of length `1` and `wikis[0].wiki_id=<wiki_id>` and `wikis[0].name="my notes"` and `wikis[0].description="my personal notes"`

  Scenario: A fresh wiki updates its markdown body
    Given the `User` for "alice" gets a `create_wiki` with `name="my notes"` and `description="my personal notes"`
    And the resulting `wiki_id` is saved as `wiki_id`
    Then `get` on the `Wiki` for "<wiki_id>" has `name="my notes"` and `description="my personal notes"` and `content=""`
    When the `Wiki` for "<wiki_id>" gets a `update` with `content="# Hello\n"`
    Then `get` on the `Wiki` for "<wiki_id>" has `content="# Hello\n"`

  Scenario: Pages round-trip their title and body
    Given a `Page` for "my-page" gets created via `create` with `title="My Page"` and `content="Initial body."` and `owner_id="alice"`
    Then `get` on the `Page` for "my-page" has `title="My Page"` and `content="Initial body."`
    When the `Page` for "my-page" gets a `update` with `title="Renamed Page"` and `content="New body."`
    Then `get` on the `Page` for "my-page" has `title="Renamed Page"` and `content="New body."`

  Scenario: Transcripts round-trip their messages
    Given a `Transcript` for "my-transcript" gets created via `create` with `messages=[{role: "user", content: "Hello"}, {role: "assistant", content: "Hi!"}]` and `owner_id="alice"`
    Then `get` on the `Transcript` for "my-transcript" has `messages` of length `2` and `messages[0].role="user"` and `messages[0].content="Hello"` and `messages[1].role="assistant"` and `messages[1].content="Hi!"`
    When the `Transcript` for "my-transcript" gets a `update` with `messages=[{role: "user", content: "Goodbye"}]`
    Then `get` on the `Transcript` for "my-transcript" has `messages` of length `1` and `messages[0].content="Goodbye"`
