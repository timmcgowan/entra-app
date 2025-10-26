package authz

# default deny
default allow = false

# allow if resource is public
allow {
  input.path == "/api/public"
}

# admin role always allowed
allow {
  input.user != null
  some i
  input.user.roles[i] == "admin"
}

# readers can GET /api/resource
allow {
  input.method == "GET"
  input.path == "/api/resource"
  input.user != null
  some i
  input.user.roles[i] == "reader"
}

# Example of using resource metadata from PIP (data.resources)
allow {
  input.user != null
  resource := data.resources[input.path]
  resource != null
  resource.owner == input.user.sub
}
