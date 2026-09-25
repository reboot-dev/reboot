Feature: Preferences
  What the developer has said about their dashboard, which is about
  this machine's dashboard rather than about the application.

  Background:
    Given the application is up
    And "developer" is an unauthenticated user

  Scenario: Starting writes a default that can be read
    The application's `initialize` constructed `Preferences` when it
    came up; a reader would otherwise abort with `StateNotConstructed`,
    and a page that loaded first would have nothing to render its
    banner from. False, so that somebody who has never clicked the
    banner gets a dashboard opened for them.

    Then as "developer", `get` on the `Preferences` for "preferences" has `suppress_open_on_restart=false`

  Scenario: What is expanded is a sorted set
    Two tabs can each send the same click, a page that reconnects can
    send one it already sent, and a close can arrive for something
    that was never open. Sorted, so that the reactive read does not
    push a change to every open page when the only difference is the
    order two clicks happened to arrive in.

    When "developer" does a `set_methods_expanded` with `state_type="bank.v1.Account"` and `methods=["open", "deposit"]` and `expanded=true` on `Preferences` of "preferences"
    And "developer" does a `set_methods_expanded` with `state_type="bank.v1.Account"` and `methods=["deposit"]` and `expanded=true` on `Preferences` of "preferences"
    And "developer" does a `set_methods_expanded` with `state_type="bank.v1.Bank"` and `methods=["transfer"]` and `expanded=true` on `Preferences` of "preferences"
    And "developer" does a `set_methods_expanded` with `state_type="bank.v1.Bank"` and `methods=["transfer"]` and `expanded=false` on `Preferences` of "preferences"
    And "developer" does a `set_methods_expanded` with `state_type="bank.v1.Never"` and `methods=["gone"]` and `expanded=false` on `Preferences` of "preferences"
    Then as "developer", `get` on the `Preferences` for "preferences" has `expanded_methods=["bank.v1.Account.deposit", "bank.v1.Account.open"]`
