from reboot.application import ExamplePrompt

example_prompts = [
    ExamplePrompt(
        title="Track your morning coffee",
        prompts=[
            "Create a new counter for tracking how many cups of "
            "coffee I drink today, and show me the counter.",
            "I just finished a cup — increment my coffee counter "
            "and show it to me again.",
        ],
    ),
    ExamplePrompt(
        title="Build a habit tracker",
        prompts=[
            "Create a counter for morning runs this month and one "
            "for evening walks.",
            "Show me the morning runs counter.",
            "I just finished a morning run — bump it and show me "
            "the counter again.",
        ],
    ),
    ExamplePrompt(
        title="Run a quick scoreboard",
        prompts=[
            "Create two counters, 'wins' and 'losses', for my "
            "board-game nights.",
            "I just won a game — show me the wins counter so I "
            "can bump it.",
            "List all my counters and their current values.",
        ],
    ),
]
