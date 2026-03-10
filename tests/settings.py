# Settings for names that `LocalKubernetes` uses to communicate with tests
# running in its clusters.

# The name of the environment variable containing the name of the kube-context
# to use when communicating with the test's cluster.
ENVVAR_LOCAL_KUBERNETES_CONTEXT = 'TESTONLY_KUBERNETES_CONTEXT'

# The name of the environment variable containing a JSON string with a map of
# image names, from what they're called in the test's code to what they're called
# inside the cluster's registry.
ENVVAR_LOCAL_KUBERNETES_INSIDE_CLUSTER_IMAGES = 'TESTONLY_INSIDE_CLUSTER_IMAGES'

# A placeholder string that can be used in YAML to be replaced by the JSON
# string with the above map of image names.
LOCAL_KUBERNETES_INSIDE_CLUSTER_IMAGES_JSON_PLACEHOLDER = 'INSIDE_CLUSTER_IMAGES_JSON_PLACEHOLDER'
