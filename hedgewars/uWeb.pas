(*
 * Hedgewars, a free turn based strategy game
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; version 2 of the License
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *)

{$INCLUDE "options.inc"}

// Browser glue for the web engine (WEBGL). Implemented in C in
// project_files/hwc/rtl/web.c.
unit uWeb;
interface

// IPC with the JavaScript frontend: same wire format as the TCP socket
function  hw_ipc_recv(buf: pointer; maxlen: LongInt): LongInt; cdecl; external;
procedure hw_ipc_send(buf: pointer; len: LongInt); cdecl; external;

// the browser drives the main loop, one iteration per animation frame
procedure hw_web_start_main_loop(step: pointer); cdecl; external;
procedure hw_web_stop_main_loop; cdecl; external;

// tell the JavaScript host that the engine has finished
procedure hw_web_engine_exit(code: LongInt); cdecl; external;

// The AI thinks in a fiber instead of a thread: the main loop gives it a time
// slice per frame, the AI yields at check points when the slice is used up.
procedure hw_ai_start(entry: pointer; arg: pointer); cdecl; external;
function  hw_ai_is_running: LongInt; cdecl; external;
procedure hw_ai_cancel; cdecl; external;
procedure hw_ai_run_slice(budget_ms: LongInt); cdecl; external;
procedure hw_ai_yield; cdecl; external;
procedure hw_ai_sleep(ms: LongInt); cdecl; external;

implementation

end.
