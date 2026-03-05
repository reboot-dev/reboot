# sha1

[![Build status](https://travis-ci.org/mpeterv/sha1.png?branch=master)](https://travis-ci.org/mpeterv/sha1)
[![Test coverage](https://codecov.io/gh/mpeterv/sha1/branch/master/graph/badge.svg)](https://codecov.io/gh/mpeterv/sha1)
[![License](https://img.shields.io/badge/License-MIT-brightgreen.svg)](LICENSE)

This module implements SHA-1 and HMAC-SHA-1 in pure Lua. For better performance it uses different bitwise operation implementations depending on environment:

* On Lua 5.1:
  - Uses `bit` module provided by [luabitop](https://luarocks.org/modules/luarocks/luabitop) rock if it is available.
  - Otherwise, uses `bit32` module provided by [bit32](https://luarocks.org/modules/siffiejoe/bit32) rock if it is available.
  - Otherwise, uses an implementation written in Lua.
* On Lua 5.2:
  - Uses `bit` module if it is available.
  - Otherwise, built-in `bit32` module.
* On Lua 5.3: uses built-in bitwise operators.
* On LuaJIT 2.x: uses built-in `bit` module.

## Installation

For installation using [LuaRocks](https://luarocks.org/) run `luarocks install sha1`.

For manual installation copy `src/sha1` into a directory within `package.path`.

## Usage

```lua
local sha1 = require "sha1"

-- Prints module version in MAJOR.MINOR.PATCH format.
print(sha1.version)

-- Returns a hex string of length 40. sha1(message) also works.
local hash_as_hex = sha1.sha1(message)

-- Returns raw bytes as a string of length 20.
local hash_as_data = sha1.binary(message)

-- Returns a hex string of length 40.
local hmac_as_hex = sha1.hmac(key, message)

-- Returns raw bytes as a string of length 20.
local hmac_as_data = sha1.hmac_binary(key, message)
```

## Benchmarking

Run `lua bench.lua` to benchmark `sha` (requires [argparse](https://github.com/mpeterv/argparse) and [luasocket](http://w3.impa.br/~diego/software/luasocket/)). See `lua bench.lua -h` for more options.

Example results, running on a machine with Intel Core i7-7700HQ and DDR4 SDRAM:

```
Lua 5.1.5:
Start up: 0.021782 seconds
SHA-1(1000 characters) 1000 times: 2.138502 seconds

Lua 5.1.5 with luabitop installed:
Start up: 0.000331 seconds
SHA-1(1000 characters) 1000 times: 0.456484 seconds

Lua 5.1.5 with bit32 installed:
Start up: 0.000374 seconds
SHA-1(1000 characters) 1000 times: 0.494986 seconds

Lua 5.2.4:
Start up: 0.000378 seconds
SHA-1(1000 characters) 1000 times: 0.534550 seconds

Lua 5.2.4 with luabitop installed:
Start up: 0.000375 seconds
SHA-1(1000 characters) 1000 times: 0.495986 seconds

Lua 5.3.5:
Start up: 0.000311 seconds
SHA-1(1000 characters) 1000 times: 0.443598 seconds

LuaJIT 2.0.5:
Start up: 0.000248 seconds
SHA-1(1000 characters) 1000 times: 0.029523 seconds

LuaJIT 2.1.0-beta3:
Start up: 0.000274 seconds
SHA-1(1000 characters) 1000 times: 0.029297 seconds
```

## Testing

To run the test suite ensure that [busted](http://olivinelabs.com/busted/) testing framework is installed and run `busted`.

## Credits

`sha1` module is built upon an implementation by Eike Decker, based on original work by Jeffrey Friedl and cleaned up by [Enrique García Cota](https://github.com/kikito).

## License

This version of the module, as well as all the previous ones on which it is based, are implemented under the MIT license (see LICENSE file for details).
