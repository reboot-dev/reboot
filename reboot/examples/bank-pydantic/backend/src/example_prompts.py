from reboot.application import ExamplePrompt

example_prompts = [
    ExamplePrompt(
        title="Open your first account",
        prompts=[
            "Open a bank account for me with an initial deposit "
            "of $500.",
            "Show me my accounts and balances.",
        ],
    ),
    ExamplePrompt(
        title="Move money around",
        prompts=[
            "Open a second account for me with $100 and then "
            "transfer $50 into it from my first account.",
            "Withdraw $25 from my first account and show me my "
            "balances again.",
        ],
    ),
    ExamplePrompt(
        title="Look around the bank",
        prompts=[
            "Show me every customer of the bank and their "
            "account balances.",
            "Open the live accounts table so I can watch the "
            "balances change.",
        ],
    ),
]
