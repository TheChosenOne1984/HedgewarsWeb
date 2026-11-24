cmake_minimum_required(VERSION 3.22)

# The desktop engine links the shared library; the web (Emscripten) engine
# links everything statically into one module.
if(BUILD_ENGINE_JS)
    set(hwengine_future_crate_type staticlib)
else()
    set(hwengine_future_crate_type cdylib)
endif()

corrosion_import_crate(
    MANIFEST_PATH Cargo.toml
    CRATES lib-hwengine-future
    CRATE_TYPES ${hwengine_future_crate_type}
    FLAGS ${CARGO_FLAGS}
    NO_LINKER_OVERRIDE
)

if(NOT BUILD_ENGINE_JS)
    corrosion_install(TARGETS hwengine_future DESTINATION ${target_library_install_dir})
endif()
