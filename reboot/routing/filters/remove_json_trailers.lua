-- A filter that removes gRPC trailers from HTTP/2 JSON responses; this
-- is a mitigation for a libsoup/Envoy interoperability issue, see
-- https://gitlab.gnome.org/GNOME/libsoup/-/issues/457, where
-- libsoup hangs on gRPC/JSON transcoded responses that have trailers.
-- The trailers are unimportant to our protocol.
function envoy_on_response(response_handle)

  -- Act only on HTTP2 requests with content type `application/json`;
  -- anything else may be customer-managed traffic (they can decide for
  -- themselves if they want to set trailers), or gRPC traffic (which
  -- needs trailers).
  local content_type = response_handle:headers():get("content-type")
  if content_type ~= "application/json" then
    return
  end

  -- Customer-managed traffic can also be HTTP2 `application/json`, so
  -- we'll be very selective in the trailers we remove: we selectively
  -- remove only those that we know the gRPC/JSON transcoder adds,
  -- namely "grpc-status" and "grpc-message".
  local trailers = response_handle:trailers()
  if trailers == nil then
    return
  end
  if trailers:get("grpc-status") ~= nil then
    trailers:remove("grpc-status")
  end
  if trailers:get("grpc-message") ~= nil then
    trailers:remove("grpc-message")
  end

end
