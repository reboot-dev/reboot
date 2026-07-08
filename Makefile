# Makefile for maintenance tasks that live entirely within this
# repository (code generation, golden files, docs snippets, generated
# CI, and dependency lockfiles). Each target runs Bazel from this
# repository root.

########################################################################
# Regenerates the documentation code snippets.
.PHONY: snippets
snippets:
	npm run generate-code-snippets --prefix documentation

########################################################################
# Finds all targets that generate `README.md` files, and runs them.
# Keep this lazy (recursive `=`) so unrelated targets (e.g. `make
# snippets`) don't run Bazel query work at parse-time.
README_GENERATOR_TARGETS = $(shell bazel query 'attr(generator_function, write_templated_source_file, //...) intersect attr(name, ".*_md$$", //...)')
.PHONY: readmes
readmes:
	$(foreach target,$(README_GENERATOR_TARGETS),bazel run $(target);)

########################################################################
# Regenerates all of the golden files.
.PHONY: goldens
goldens:
	bazel build \
		//tests/reboot:echo_py_reboot \
		//tests/reboot:greeter_js_reboot \
		//tests/reboot:greeter_js_reboot_react \
		//tests/reboot:greeter_py_reboot \
		//tests/reboot:general_boilerplate_py_reboot \
		//tests/reboot:echo_boilerplate_py_reboot \
		//tests/reboot:general_boilerplate_ts_reboot \
		//tests/reboot/routing:sorted_envoy_yaml \
		//tests/reboot/routing_filter:envoy_config \
		//tests/reboot:greeter_web_ts_reboot \
		//reboot/ping:ping_py_reboot

	cp bazel-bin/tests/reboot/echo_rbt.py tests/reboot/echo_rbt.golden.py
	cp bazel-bin/tests/reboot/greeter_rbt_react.js tests/reboot/greeter_rbt_react.golden.js
	cp bazel-bin/tests/reboot/greeter_rbt.py tests/reboot/greeter_rbt.golden.py
	cp bazel-bin/tests/reboot/general_servicer.py tests/reboot/general_servicer.golden.py
	cp bazel-bin/tests/reboot/echo_servicer.py tests/reboot/echo_servicer.golden.py
	cp bazel-bin/tests/reboot/greeter_rbt.js tests/reboot/greeter_rbt.golden.js
	cp bazel-bin/tests/reboot/general_servicer.ts tests/reboot/general_servicer.golden.ts
	cp bazel-bin/tests/reboot/routing/envoy.sorted.yaml tests/reboot/routing/envoy.sorted.golden.yaml
	cp bazel-bin/tests/reboot/routing_filter/envoy.generated.yaml tests/reboot/routing_filter/envoy.golden.yaml
	cp bazel-bin/tests/reboot/greeter_rbt_web.js tests/reboot/greeter_rbt_web.golden.js
	cp bazel-bin/reboot/ping/ping_api_rbt.py tests/reboot/ping_api_rbt.golden.py

########################################################################
# Updates the `reboot`-pinned Python requirements lockfiles.
.PHONY: requirements
requirements:
	bazel run //reboot:requirements.update
	bazel run //tests:requirements.update
	bazel run //reboot/examples:requirements.update
	bazel run //bazel/pip_package_rule:requirements.update
