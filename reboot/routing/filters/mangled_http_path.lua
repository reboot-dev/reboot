function startswith(s, prefix)
  return s:sub(1, #prefix) == prefix
end

function split(s, separator)
  local t = {}
  for found in string.gmatch(s, "([^" .. separator .. "]+)") do
    t[#t + 1] = found
  end
  return t
end

-- The following code is valid (and used) as a standalone Envoy filter, but is
-- not wrapped in a `envoy_on_request` function because it is also used inside
-- the routing filter's `envoy_on_request` function.
local path = request_handle:headers():get(":path")

local reboot_prefix = "/__/reboot/rpc/"

if startswith(path, reboot_prefix) then
  local values = split(path, "/")

  local state_ref = values[4]
  if state_ref == nil then
    request_handle:respond(
      {[":status"] = "400"},
      "ERROR: Missing 'state_ref' path parameter")
  end

  -- The state ref may contain URL-encoded colons and slashes; those shouldn't
  -- be URL-encoded in the header. Note that '%%' is Lua-escaped '%'.
  state_ref = string.gsub(state_ref, "%%3A", ":")
  state_ref = string.gsub(state_ref, "%%2F", "/")
  state_ref = string.gsub(state_ref, "%%5C", "\\")

  request_handle:headers():replace("x-reboot-state-ref", state_ref)

  request_handle:headers():replace(":path", "/" .. table.concat({ table.unpack(values, 5) }, "/"))
end
