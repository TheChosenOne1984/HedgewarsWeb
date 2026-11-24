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
 */

#ifdef __EMSCRIPTEN__

#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

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

#endif
