/*
 * Browser glue for the web engine (BUILD_ENGINE_JS). Declared in Pascal in
 * hedgewars/uWeb.pas.
 *
 * IPC: the desktop engine talks to the frontend over a local TCP socket. In
 * the browser the frontend is JavaScript in the same page, so the wire
 * format stays the same but the transport is an in-memory queue:
 *   JS -> engine: Module._hw_ipc_push(ptr, len) appends to the inbound queue,
 *                 the engine drains it with hw_ipc_recv() every frame.
 *   engine -> JS: hw_ipc_send() calls Module.onIpcMessage(Uint8Array).
 *
 * AI: the desktop engine thinks in a separate thread. The web engine has no
 * threads, so the unchanged AI code runs in a fiber instead: the main loop
 * gives it a time slice every frame (hw_ai_run_slice), and the AI yields back
 * at a few check points once the slice is used up (hw_ai_yield, hw_ai_sleep).
 * Fibers need Asyncify; only the functions on the fiber paths are
 * instrumented (see ASYNCIFY_ONLY in project_files/hwc/CMakeLists.txt).
 */

#ifdef __EMSCRIPTEN__

#include <emscripten.h>
#include <emscripten/fiber.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* Asyncify is linked in for the AI fiber. SDL would then yield to the browser
 * in SDL_GL_SwapWindow (emscripten_sleep), which must not happen outside the
 * instrumented functions; the engine returns to the browser every frame
 * anyway. */
__attribute__((constructor)) static void hw_web_init(void)
{
    setenv("SDL_EMSCRIPTEN_ASYNCIFY", "0", 1);
}

static uint8_t *ipc_in = NULL;
static size_t ipc_cap = 0, ipc_head = 0, ipc_tail = 0;

EMSCRIPTEN_KEEPALIVE void hw_ipc_push(const uint8_t *data, int len)
{
    if (len <= 0)
        return;
    if (ipc_head > 0 && ipc_tail + (size_t)len > ipc_cap)
    {
        /* drop the consumed part before growing */
        memmove(ipc_in, ipc_in + ipc_head, ipc_tail - ipc_head);
        ipc_tail -= ipc_head;
        ipc_head = 0;
    }
    if (ipc_tail + (size_t)len > ipc_cap)
    {
        size_t cap = ipc_cap ? ipc_cap : 65536;
        while (cap < ipc_tail + (size_t)len)
            cap *= 2;
        uint8_t *p = realloc(ipc_in, cap);
        if (!p)
            abort();
        ipc_in = p;
        ipc_cap = cap;
    }
    memcpy(ipc_in + ipc_tail, data, len);
    ipc_tail += len;
}

/* copy up to maxlen queued bytes to buf; returns the number of bytes, 0 if empty */
int hw_ipc_recv(uint8_t *buf, int maxlen)
{
    size_t n = ipc_tail - ipc_head;
    if (maxlen <= 0 || n == 0)
        return 0;
    if (n > (size_t)maxlen)
        n = maxlen;
    memcpy(buf, ipc_in + ipc_head, n);
    ipc_head += n;
    if (ipc_head == ipc_tail)
        ipc_head = ipc_tail = 0;
    return (int)n;
}

EM_JS(void, hw_ipc_send, (const uint8_t *buf, int len), {
    if (Module.onIpcMessage)
        Module.onIpcMessage(HEAPU8.slice(buf, buf + len));
});

void hw_web_start_main_loop(void (*step)(void))
{
    emscripten_set_main_loop(step, 0, 0);
}

void hw_web_stop_main_loop(void)
{
    emscripten_cancel_main_loop();
}

EM_JS(void, hw_web_engine_exit, (int code), {
    if (Module.onEngineExit)
        Module.onEngineExit(code);
});

/* Campaign ('V') and mission ('v') variables: the frontend keeps them (it
 * receives the "V!"/"v!" save messages over IPC) and answers synchronously
 * through Module.getEngineVar(kind, name). The value is written to a Pascal
 * shortstring (length byte + up to 255 bytes). */
EM_JS(int, hw_web_get_var_js, (int kind, const char *name, char *buf, int bufsize), {
    var v = Module.getEngineVar ? Module.getEngineVar(String.fromCharCode(kind), UTF8ToString(name)) : null;
    if (v === null || v === undefined)
        v = '';
    return stringToUTF8(String(v), buf, bufsize);
});

void hw_web_get_var(int kind, const char *name, unsigned char *shortstr)
{
    char buf[256];
    int n = hw_web_get_var_js(kind, name, buf, sizeof(buf));
    if (n < 0)
        n = 0;
    if (n > 255)
        n = 255;
    shortstr[0] = (unsigned char)n;
    memcpy(shortstr + 1, buf, n);
}

#define HW_AI_C_STACK_SIZE (2 * 1024 * 1024)
#define HW_ASYNCIFY_STACK_SIZE (64 * 1024)

static emscripten_fiber_t hw_main_fiber, hw_ai_fiber;
static int hw_main_fiber_ready = 0;
static char hw_main_asyncify_stack[HW_ASYNCIFY_STACK_SIZE];
static char hw_ai_asyncify_stack[HW_ASYNCIFY_STACK_SIZE];
static char *hw_ai_c_stack = NULL;
static int (*hw_ai_entry)(void *) = NULL;
static void *hw_ai_arg = NULL;
static int hw_ai_running = 0;   /* a think job exists and has not finished */
static int hw_in_ai_fiber = 0;  /* currently executing on the AI fiber */
static double hw_ai_deadline = 0;

static void hw_ai_fiber_main(void *unused)
{
    (void)unused;
    hw_ai_entry(hw_ai_arg);
    hw_ai_running = 0;
    hw_in_ai_fiber = 0;
    emscripten_fiber_swap(&hw_ai_fiber, &hw_main_fiber);
}

/* start a think job; it runs in the slices given by hw_ai_run_slice() */
void hw_ai_start(int (*entry)(void *), void *arg)
{
    if (!hw_main_fiber_ready)
    {
        emscripten_fiber_init_from_current_context(&hw_main_fiber,
            hw_main_asyncify_stack, sizeof(hw_main_asyncify_stack));
        hw_main_fiber_ready = 1;
    }
    if (!hw_ai_c_stack && !(hw_ai_c_stack = malloc(HW_AI_C_STACK_SIZE)))
        abort();
    hw_ai_entry = entry;
    hw_ai_arg = arg;
    emscripten_fiber_init(&hw_ai_fiber, hw_ai_fiber_main, NULL,
        hw_ai_c_stack, HW_AI_C_STACK_SIZE, hw_ai_asyncify_stack, sizeof(hw_ai_asyncify_stack));
    hw_ai_running = 1;
}

int hw_ai_is_running(void)
{
    return hw_ai_running;
}

/* abandon the current think job; it is never resumed */
void hw_ai_cancel(void)
{
    hw_ai_running = 0;
}

/* let the AI think for up to budget_ms (until its next check point) */
void hw_ai_run_slice(int budget_ms)
{
    if (!hw_ai_running || hw_in_ai_fiber)
        return;
    hw_ai_deadline = emscripten_get_now() + budget_ms;
    hw_in_ai_fiber = 1;
    emscripten_fiber_swap(&hw_main_fiber, &hw_ai_fiber);
    hw_in_ai_fiber = 0;
}

/* AI check point: return to the main loop if the slice is used up */
void hw_ai_yield(void)
{
    if (hw_in_ai_fiber && emscripten_get_now() >= hw_ai_deadline)
    {
        emscripten_fiber_swap(&hw_ai_fiber, &hw_main_fiber);
    }
}

/* the AI waits on purpose (SDL_Delay on desktop): give the frames back meanwhile */
void hw_ai_sleep(int ms)
{
    double until = emscripten_get_now() + ms;
    while (hw_in_ai_fiber && emscripten_get_now() < until)
        emscripten_fiber_swap(&hw_ai_fiber, &hw_main_fiber);
}

#endif
