# Emscripten ports of the engine's SDL2 dependencies (BUILD_ENGINE_JS).
#
# Emscripten provides SDL2 and its satellite libraries as "ports" that are
# enabled with -sUSE_* flags at compile and link time instead of being found
# on the system. This module defines one INTERFACE target per library and
# sets the variables that the find_package() calls would set elsewhere.
# SDL2_net is not used by the web engine (IPC goes through JavaScript).

add_library(emscripten_sdl2 INTERFACE)
target_compile_options(emscripten_sdl2 INTERFACE "-sUSE_SDL=2")
target_link_options(emscripten_sdl2 INTERFACE "-sUSE_SDL=2")

add_library(emscripten_sdl2_image INTERFACE)
target_compile_options(emscripten_sdl2_image INTERFACE "-sUSE_SDL_IMAGE=2")
target_link_options(emscripten_sdl2_image INTERFACE "-sUSE_SDL_IMAGE=2" "-sSDL2_IMAGE_FORMATS=[\"png\"]")

add_library(emscripten_sdl2_ttf INTERFACE)
target_compile_options(emscripten_sdl2_ttf INTERFACE "-sUSE_SDL_TTF=2")
target_link_options(emscripten_sdl2_ttf INTERFACE "-sUSE_SDL_TTF=2")

add_library(emscripten_sdl2_mixer INTERFACE)
target_compile_options(emscripten_sdl2_mixer INTERFACE "-sUSE_SDL_MIXER=2")
target_link_options(emscripten_sdl2_mixer INTERFACE "-sUSE_SDL_MIXER=2" "-sSDL2_MIXER_FORMATS=[\"ogg\"]")

set(SDL2_INCLUDE_DIRS "")
set(SDL2_LIBRARIES emscripten_sdl2)
set(SDL2_IMAGE_LIBRARIES emscripten_sdl2_image)
set(SDL2_TTF_LIBRARIES emscripten_sdl2_ttf)
set(SDL2_MIXER_LIBRARY emscripten_sdl2_mixer)
set(SDL2_NET_LIBRARIES "")
set(OPENGL_LIBRARY "")
