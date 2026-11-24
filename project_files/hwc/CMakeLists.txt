#the usual set of dependencies
if(NOT BUILD_ENGINE_JS)
    find_package(OpenGL REQUIRED)
    find_package(SDL2 REQUIRED CONFIG)
    find_package(SDL2_mixer 2 REQUIRED)
    find_package(SDL2_net 2 REQUIRED)
    find_package(SDL2_image 2 REQUIRED)
    find_package(SDL2_ttf 2 REQUIRED)
endif()

#compile our rtl implementation
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/rtl)
include_directories(${PHYSFS_INCLUDE_DIR})
include_directories(${PHYSLAYER_INCLUDE_DIR})
include_directories(${LUA_INCLUDE_DIR})
include_directories(${SDL2_INCLUDE_DIRS})
add_subdirectory(rtl)

# convert list into pascal array
if(FONTS_DIRS)
  list(LENGTH FONTS_DIRS ndirs)
  set(FONTS_DIRS_ARRAY "array [0..${ndirs}] of PChar = (")
  foreach(fontdir ${FONTS_DIRS})
      set(FONTS_DIRS_ARRAY "${FONTS_DIRS_ARRAY}\n_P'${fontdir}',")
  endforeach(fontdir)
  set(FONTS_DIRS_ARRAY "${FONTS_DIRS_ARRAY}\nnil);\n")
else(FONTS_DIRS)
  set(FONTS_DIRS_ARRAY "array [0..1] of PChar = (nil, nil);")
endif(FONTS_DIRS)

configure_file(${CMAKE_SOURCE_DIR}/hedgewars/config.inc.in ${CMAKE_CURRENT_BINARY_DIR}/config.inc)

#get the list of pas files that are going to be converted and compiled
file(GLOB engine_sources_pas "${CMAKE_SOURCE_DIR}/hedgewars/*.pas")
list(REMOVE_ITEM engine_sources_pas "${CMAKE_SOURCE_DIR}/hedgewars/uTouch.pas")
list(REMOVE_ITEM engine_sources_pas "${CMAKE_SOURCE_DIR}/hedgewars/PNGh.pas")
list(REMOVE_ITEM engine_sources_pas "${CMAKE_SOURCE_DIR}/hedgewars/pas2cSystem.pas")
list(REMOVE_ITEM engine_sources_pas "${CMAKE_SOURCE_DIR}/hedgewars/pas2cRedo.pas")
list(REMOVE_ITEM engine_sources_pas "${CMAKE_SOURCE_DIR}/hedgewars/hwLibrary.pas")
if(NOVIDEOREC)
	list(REMOVE_ITEM engine_sources_pas "${CMAKE_SOURCE_DIR}/hedgewars/uVideoRec.pas")
endif()
if(NOT GL2)
    list(REMOVE_ITEM engine_sources_pas "${CMAKE_SOURCE_DIR}/hedgewars/uMatrix.pas")
endif()
if(NOT BUILD_ENGINE_JS)
    list(REMOVE_ITEM engine_sources_pas "${CMAKE_SOURCE_DIR}/hedgewars/uWeb.pas")
endif()

#remove and readd hwengine so that it is compiled first, compiling every other file in the process
list(REMOVE_ITEM engine_sources_pas ${CMAKE_SOURCE_DIR}/hedgewars/hwengine.pas)
list(APPEND engine_sources_pas ${CMAKE_SOURCE_DIR}/hedgewars/hwengine.pas)

#process files .pas -> .c
foreach(sourcefile ${engine_sources_pas})
    get_filename_component(sourcename ${sourcefile} NAME_WE) #drops .pas
    list(APPEND engine_sources "${CMAKE_CURRENT_BINARY_DIR}/${sourcename}.c")
endforeach()

#add again files for external functions and for fpcrtl_ functions
list(APPEND engine_sources_pas ${CMAKE_SOURCE_DIR}/hedgewars/pas2cSystem.pas)
list(APPEND engine_sources_pas ${CMAKE_SOURCE_DIR}/hedgewars/pas2cRedo.pas)


set(pas2c_args -n hwengine
               -i ${CMAKE_SOURCE_DIR}/hedgewars
               -o ${CMAKE_CURRENT_BINARY_DIR}
               -a ${CMAKE_CURRENT_BINARY_DIR}
               -d ENDIAN_LITTLE
               -d DEBUGFILE)
if(BUILD_ENGINE_JS)
    set(pas2c_args ${pas2c_args} -d WEBGL)
endif()
if(BUILD_ENGINE_LIBRARY)
    set(pas2c_args ${pas2c_args} -d HWLIBRARY)
endif()
if(GL2)
    set(pas2c_args ${pas2c_args} -d GL2)
endif()
if(APPLE)
    set(pas2c_args ${pas2c_args} -d DARWIN)
endif()

if(LIBAV_FOUND)
    add_subdirectory(${CMAKE_SOURCE_DIR}/hedgewars/avwrapper ${CMAKE_CURRENT_BINARY_DIR}/avwrapper)
    list(APPEND HW_LINK_LIBS avwrapper)
    set(pas2c_args ${pas2c_args} -d USE_VIDEO_RECORDING)
endif()

#invoke pas2c on main module, it will call all the others
add_custom_command(OUTPUT ${engine_sources}
                   COMMAND "${EXECUTABLE_OUTPUT_PATH}/pas2c${CMAKE_EXECUTABLE_SUFFIX}"
                   ARGS ${pas2c_args}
                   DEPENDS pas2c                     #converter tool
                           "${EXECUTABLE_OUTPUT_PATH}/pas2c${CMAKE_EXECUTABLE_SUFFIX}"
                           ${engine_sources_pas}     #original pascal file
                  )

#wrap conversion for all source in this command
add_custom_target(engine_c DEPENDS ${engine_sources})



#compile the c files
add_definitions(-DPAS2C)
add_definitions(-Werror=incompatible-pointer-types)
# Pascal semantics: signed overflow wraps, pointer casts alias freely
add_compile_options(-fwrapv -fno-strict-aliasing)
# the operator macros in rtl/fpcops.h type-check casts in _Generic branches
# that are never selected, e.g. pointer to integer for pointer comparisons
add_compile_options(-Wno-pointer-to-int-cast -Wno-void-pointer-to-int-cast)

add_executable(hwengine WIN32 ${engine_sources})

if(BUILD_ENGINE_JS)
    # ES6 module (hwengine.mjs + hwengine.wasm) used by the web frontend and,
    # headless, by node for tests. See project_files/web/engine/.
    set_target_properties(hwengine PROPERTIES SUFFIX ".mjs")
    set(HW_WEB_EXPORTS "_hwengine_RunEngine,_hw_ipc_push,_malloc,_free")
    target_link_options(hwengine PRIVATE
        "-sMODULARIZE=1"
        "-sEXPORT_ES6=1"
        "-sEXPORT_NAME=createHwEngine"
        "-sENVIRONMENT=web,node"
        "-sALLOW_MEMORY_GROWTH=1"
        # Pascal code keeps many shortstrings (256 bytes each) on the stack; same as the native default
        "-sSTACK_SIZE=8388608"
        "-sMIN_WEBGL_VERSION=1"
        "-sMAX_WEBGL_VERSION=1"
        "-sFULL_ES2=1"
        "-sEXPORTED_FUNCTIONS=[${HW_WEB_EXPORTS}]"
        "-sEXPORTED_RUNTIME_METHODS=[FS,GL,ccall,cwrap,UTF8ToString,stringToNewUTF8,HEAPU8]"
        "-sEXIT_RUNTIME=0"
        "-sINVOKE_RUN=0"
        "-lidbfs.js"
        "-lnodefs.js"
        # The AI runs in a fiber (rtl/web.c), which needs Asyncify. Only the
        # functions that can be on the stack when fibers switch are instrumented
        # (dynCall_vi is the trampoline that enters a fiber).
        "-sASYNCIFY=1"
        "-sASYNCIFY_IGNORE_INDIRECT=1"
        "-sASYNCIFY_ONLY=[dynCall_vi,hw_ai_fiber_main,hw_ai_run_slice,hw_ai_yield,hw_ai_sleep,uai_Think,uai_Walk,uai_TestAmmos,hwengine_MainLoopIteration,hwengine_MainLoop,hwengine_WebMainLoopStep,hwengine_WebMainLoop,hwengine_GameRoutine,hwengine_Game,hwengine_RunEngine]"
        )
    # keep function names in the wasm module: readable stack traces, small cost
    target_link_options(hwengine PRIVATE "--profiling-funcs")
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        target_link_options(hwengine PRIVATE "-sASSERTIONS=2" "-sSAFE_HEAP=1" "-gsource-map")
    endif()
endif()

if(BUILD_ENGINE_JS)
    # the ports must also be on the compile line of the engine sources
    target_link_libraries(hwengine emscripten_sdl2 emscripten_sdl2_image emscripten_sdl2_ttf emscripten_sdl2_mixer)
    target_link_libraries(fpcrtl emscripten_sdl2)
endif()

target_link_libraries(hwengine  fpcrtl
                                ${LUA_LIBRARY}
                                ${OPENGL_LIBRARY}
                                ${SDL2_LIBRARIES}
                                ${SDL2_MIXER_LIBRARY}
                                ${SDL2_NET_LIBRARIES}
                                ${SDL2_IMAGE_LIBRARIES}
                                ${SDL2_TTF_LIBRARIES}
                                physfs
                                physlayer
                                m
                                hwengine_future
                                ${HW_LINK_LIBS}
                                #TODO: add other libraries
                            )
install(PROGRAMS "${EXECUTABLE_OUTPUT_PATH}/hwengine${CMAKE_EXECUTABLE_SUFFIX}" DESTINATION ${target_binary_install_dir})

