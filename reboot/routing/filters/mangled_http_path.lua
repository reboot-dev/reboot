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

  -- The state ref arrives percent-encoded in the path (the browser
  -- encodes reserved characters like ':', '/', '\\', and '|'), but the
  -- 'x-reboot-state-ref' header must carry the raw state id so it matches
  -- the id seen on non-URL paths (e.g. the MCP tool path, where the id
  -- flows straight from 'context.auth.user_id'). Decode every '%XX'
  -- escape rather than an incomplete hardcoded list, so ids such as an
  -- Auth0 'sub' ('google-oauth2|123', whose '|' the browser sends as
  -- '%7C') resolve to the same actor on both paths. Note: '%%' is
  -- Lua-escaped '%', and '%x' matches a hex digit.
  state_ref = string.gsub(state_ref, "%%(%x%x)", function(hex)
    return string.char(tonumber(hex, 16))
  end)

  request_handle:headers():replace("x-reboot-state-ref", state_ref)

  request_handle:headers():replace(":path", "/" .. table.concat({ table.unpack(values, 5) }, "/"))
end
