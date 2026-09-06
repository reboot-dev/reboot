Feature: Ingesting transcripts through the librarian

  Background:
    Given the application is up
    And "alice" is an authenticated user

  Scenario: Adding a transcript wakes the librarian
    Given as "alice", the `User` for "alice" gets a `create_wiki` with `name="notes"` and `description="knowledge base"`
    And the resulting `wiki_id` is saved as `wiki_id`
    When as "alice", the `Wiki` for "<wiki_id>" gets a `add_transcript` with `messages=[{role: "user", content: "Tell me about X."}, {role: "assistant", content: "X is a thing that does Y."}]`
    Then as "alice", `get` on the `Wiki` for "<wiki_id>" eventually has `content` containing `"[Test Page](Page:"` within 30 seconds
    # The scripted librarian saves <page_id> the moment its
    # `create_page` tool returns, which is before the wiki's content
    # updates, so once the line above passes the save exists.
    And as "alice", `get` on the `Wiki` for "<wiki_id>" has `content` containing `<page_id>`
    And as "alice", `get` on the `Page` for "<page_id>" has `title="Test Page"` and `content="Distilled transcript content."`
