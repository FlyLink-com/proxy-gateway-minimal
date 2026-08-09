{
  "targets": [
    {
      "target_name": "control_plane_native",
      "sources": [
        "src/control-plane-native.c"
      ],
      "defines": [
        "NAPI_VERSION=9",
        "_GNU_SOURCE"
      ],
      "cflags": [
        "-std=c17",
        "-Wall",
        "-Wextra",
        "-Werror",
        "-fstack-protector-strong"
      ]
    }
  ]
}
