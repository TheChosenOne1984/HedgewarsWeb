cmake_minimum_required(VERSION 3.22)

option(BUILD_OFFICIAL_SERVER "Build with official server features" OFF)
option(BUILD_SERVER_WEBSOCKETS "Accept WebSocket connections from the web client" OFF)

if(BUILD_OFFICIAL_SERVER)
    list(APPEND server_features "official-server")
endif()
if(BUILD_SERVER_WEBSOCKETS)
    list(APPEND server_features "ws-connections")
endif()

corrosion_import_crate(
    MANIFEST_PATH Cargo.toml
    CRATES hedgewars-server
    FLAGS ${CARGO_FLAGS}
    FEATURES ${server_features}
    NO_LINKER_OVERRIDE
)

corrosion_install(TARGETS hedgewars-server DESTINATION ${target_binary_install_dir})

