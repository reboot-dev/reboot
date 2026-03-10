{
    "variables":
        {
            "python3":
                "<!(echo $RBT_PYTHON3_USE)",
            "REBOOT_BAZEL_TEST_FOR_BINDING":
                "<!(echo $REBOOT_BAZEL_TEST_FOR_BINDING)",
        },
    "conditions":
        [
            [
                "OS != 'win'",
                {
                    "conditions":
                        [
                            [
                                "OS=='mac' and REBOOT_BAZEL_TEST_FOR_BINDING==''",
                                {
                                    # NOTE: On macOS, the `rpath` is not respected, and the dependency name of the
                                    # downloaded Python is based on what it self-reports. We adjust what it will
                                    # self-report in order to ensure that it is located at runtime.
                                    #
                                    # In theory, `gyp` supports Actions and dependencies between Targets. But
                                    # in practice, `node-gyp` makes (undocumented) adjustments to both Actions and
                                    # Targets that make it very challenging to use it for either fetching or
                                    # updating the interpreter. We use private/dummy variables here to trigger
                                    # side-effects instead.
                                    "variables":
                                        {
                                            "_absolute_lib_path":
                                                "<!(echo $(pwd)/python/lib/libpython3.10.dylib)",
                                            "_dummy":
                                                "<!(install_name_tool -id <(_absolute_lib_path) <(_absolute_lib_path))"
                                        }
                                }
                            ]
                        ],
                    "targets":
                        [
                            {
                                "target_name":
                                    "reboot_native",
                                "sources": ["reboot_native.cc"],
                                "variables":
                                    {
                                        # We additionally determine the `lib`/`bin` dir using sysconfig, in order to
                                        # resolve through any shims that might be masking the true location of the
                                        # underlying binaries (`python3.10-config`, in particular).
                                        "python_lib_dir":
                                            "<!(dirname $(<(python3) -c \"import sysconfig; print(sysconfig.get_path('stdlib', scheme='posix_prefix'))\"))",
                                        "python_bin_dir":
                                            "<!(<(python3) -c \"import sysconfig; print(sysconfig.get_path('scripts', scheme='posix_prefix'))\")",
                                        "python3_config":
                                            "<(python_bin_dir)/python3.10-config"
                                    },
                                "include_dirs":
                                    [
                                        "<!@(node -p \"require('node-addon-api').include\")",
                                        "<!@(<(python3) -c \"import sysconfig; print(sysconfig.get_path('include'))\")",
                                        "include"
                                    ],
                                "dependencies":
                                    [
                                        "<!@(node -p \"require('node-addon-api').gyp\")"
                                    ],
                                "libraries":
                                    [
                                        "-L<(python_lib_dir)",
                                        "<!@(<(python3_config) --libs --embed)",
                                        # Adding extra lib path for `npm install`, while using local Python.
                                        "<!@(<(python3_config) --ldflags --embed)",
                                        # Set the `python_lib_dir` as an rpath for our library, so that it will be
                                        # used as the runtime source of `libpython3.10`.
                                        # NOTE: Although this is applied on macOS it is not actually obeyed for some
                                        # reason: see the NOTE in the `conditions` above.
                                        "-Wl,-rpath,<(python_lib_dir)"
                                    ],
                                "cflags!": ["-fno-exceptions", "-fno-rtti"],
                                "cflags_cc!": ["-fno-exceptions", "-fno-rtti"],
                                "cflags_cc":
                                    [
                                        "<!@(<(python3_config) --cflags --embed)",
                                        "-std=c++17"
                                    ],
                                # For no reason 'node gyp' doesn't respect 'cflags' and 'cflags_cc'.
                                # For more information: https://github.com/nodejs/node-gyp/issues/152
                                "xcode_settings":
                                    {
                                        "OTHER_CFLAGS":
                                            [
                                                "<!@(<(python3_config) --cflags --embed)",
                                                "-std=c++17",
                                                "-fexceptions",
                                                "-frtti",
                                            ]
                                    },
                                "ldflags":
                                    [
                                        "<!@(<(python3_config) --ldflags --embed)"
                                    ],
                                "defines":
                                    [
                                        "NAPI_CPP_EXCEPTIONS",
                                        "RBT_PYTHON3_USE=\"<(python3)\""
                                    ]
                            }
                        ]
                }
            ],
            [
                # 'node-gyp' requires at least one target to be defined.
                # This is a workaround to avoid building the 'reboot_native'
                # target on Windows.
                "OS == 'win'",
                {
                    "targets":
                        [
                            {
                                "target_name": "empty",
                                "type": "none",
                                "sources": []
                            }
                        ]
                }
            ],
        ]
}
