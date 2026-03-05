local argparse = require "argparse"
local socket = require "socket"

local function bench_fn(label, fn)
   local start_time = socket.gettime()
   fn()
   local finish_time = socket.gettime()
   print(("%s: %f seconds"):format(label, finish_time - start_time))
end

local input_strings = {}

local function gen_input_strings(string_length, num_strings)
   for _ = 1, num_strings do
      local chars = {}

      for _ = 1, string_length do
         table.insert(chars, string.char(math.random(0, 255)))
      end

      table.insert(input_strings, table.concat(chars))
   end
end

local cli = argparse("bench.lua", "sha1 benchmarking script.")
cli:option("-c --count", "Number of strings to run sha1.sha1 on.", "1000", tonumber)
cli:option("-l --length", "Length of each string.", "1000", tonumber)
cli:option("-m --module", "Module to use on Lua 5.1 (bit or bit32).", nil, {bit = "bit", bit32 = "bit32"})

local args = cli:parse()

if _VERSION:find("5%.[12]") and not _G.jit then
   if args.module then
      if not pcall(require, args.module) then
         cli:error(("%s module is not available"):format(args.module))
      end

      if not _VERSION:find("5%.2") and args.module == "bit32" then
         package.loaded[args.module] = nil
      end
   end

   if args.module ~= "bit" then
      package.preload.bit = error
   end

   if args.module ~= "bit32" then
      package.preload.bit32 = error
   end
end

local sha1

bench_fn("Start up", function()
   sha1 = require "sha1"
end)

gen_input_strings(args.length, args.count)

bench_fn(("SHA-1(%d characters) %d times"):format(args.length, args.count), function()
   for _, input_string in ipairs(input_strings) do
      sha1.sha1(input_string)
   end
end)
