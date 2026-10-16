## Stdlib libraries take `authorizer` by keyword only

`ordered_map_library`, `sorted_map_library`, `queue_library`,
`pubsub_library` and `presence_library`, and the `Library` classes
behind them, no longer accept `authorizer` positionally. Find calls
passing one:

    grep -rn '_library(' --include=*.py backend/ | grep -v '_library()' | grep -v 'authorizer='

For each, name the argument:

```python
# Before
libraries=[ordered_map_library(OrderedMap.Authorizer(...))],

# After
libraries=[ordered_map_library(authorizer=OrderedMap.Authorizer(...))],
```
