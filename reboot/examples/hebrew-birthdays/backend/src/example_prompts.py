from reboot.application import ExamplePrompt

example_prompts = [
    ExamplePrompt(
        title="Add the family",
        prompts=[
            "Track my grandmother Rivka's Hebrew birthday: she was "
            "born on March 10, 1950, in the afternoon.",
            "My son Eli was born on November 30, 2016, after sunset. "
            "Add him too, and tell me his Hebrew birthday.",
            "Show me everyone's upcoming Hebrew birthdays.",
        ],
    ),
    ExamplePrompt(
        title="When is it this year?",
        prompts=[
            "My father only knows his Hebrew birthday: 30 Cheshvan "
            "5720. Add him as Abba.",
            "When does Abba's Hebrew birthday fall over the next few "
            "years? Show me his birthday card.",
        ],
    ),
    ExamplePrompt(
        title="Plan the month",
        prompts=[
            "Whose Hebrew birthdays are coming up in the next 30 days?",
            "What's today's Hebrew date?",
            "Open my Hebrew birthdays list so I can add someone.",
        ],
    ),
]
