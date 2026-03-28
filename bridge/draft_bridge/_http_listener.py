"""Temporary localhost HTTP server that catches the OAuth-style callback from the web app.

Lifecycle:
  1. `CallbackServer.start()` binds port CALLBACK_PORT and starts a daemon thread.
  2. The web app redirects the browser to http://localhost:CALLBACK_PORT/auth/callback?token=<raw>
  3. Bridge captures the token, then redirects the browser to the web app success page
     (WEB_APP_BASE_URL/auth/bridge?status=success) — all success UI lives in React.
  4. `wait_for_token(timeout)` blocks until the token arrives or the timeout expires.
  5. `stop()` shuts down the server.

The request log is suppressed — the raw token must never appear in terminal output.
"""

import http.server
import queue
import threading
import urllib.parse

from draft_bridge.constants import CALLBACK_PATH, CALLBACK_PORT, WEB_APP_BASE_URL


def _make_handler(token_queue: queue.Queue):
    class _Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path == CALLBACK_PATH:
                params = urllib.parse.parse_qs(parsed.query)
                token = params.get("token", [None])[0]
                if token:
                    # Redirect browser before signalling main thread to stop the server
                    success_url = f"{WEB_APP_BASE_URL}/auth/bridge?status=success"
                    self.send_response(302)
                    self.send_header("Location", success_url)
                    self.end_headers()
                    token_queue.put(token)
                else:
                    # Redirect to the web app with an error state
                    error_url = f"{WEB_APP_BASE_URL}/auth/bridge?status=error"
                    self.send_response(302)
                    self.send_header("Location", error_url)
                    self.end_headers()
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, format, *args):  # noqa: A002
            pass  # suppress — raw token is in the request URL

    return _Handler


class CallbackServer:
    def __init__(self):
        self._token_queue: queue.Queue = queue.Queue(maxsize=1)
        self._server: http.server.HTTPServer | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        """Bind the port and start the daemon thread. Raises OSError if port is in use."""
        handler = _make_handler(self._token_queue)
        self._server = http.server.HTTPServer(("127.0.0.1", CALLBACK_PORT), handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def wait_for_token(self, timeout: float) -> str | None:
        """Block until a token arrives or timeout (seconds) expires. Returns None on timeout."""
        try:
            return self._token_queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def stop(self) -> None:
        if self._server:
            self._server.shutdown()
            self._server = None
