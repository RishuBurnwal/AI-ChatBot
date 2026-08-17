"""Start the Nexus Support API and web app with one command."""

from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from collections.abc import MutableMapping, Sequence
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
API_PORT = 8787
DEFAULT_WEB_PORT = 5173


class LauncherError(RuntimeError):
    """Raised when the local development environment cannot be started."""


def load_env_file(path: Path, environment: MutableMapping[str, str]) -> None:
    """Load simple KEY=VALUE entries without overwriting process variables."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            environment.setdefault(key, value)


def port_is_available(port: int) -> bool:
    """Return whether a TCP port can be bound on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            server.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


def find_available_port(start: int, attempts: int = 20) -> int:
    """Find a free localhost port, starting at the preferred port."""
    for port in range(start, start + attempts):
        if port_is_available(port):
            return port
    raise LauncherError(f"No free web port found between {start} and {start + attempts - 1}.")


def local_ip_address() -> str:
    """Return the LAN address used for outbound traffic without sending data."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
            connection.connect(("8.8.8.8", 80))
            return str(connection.getsockname()[0])
    except OSError:
        return "127.0.0.1"


def local_ip_addresses() -> list[str]:
    """List usable LAN adapters, preferring the standard Windows hotspot address."""
    try:
        addresses = socket.gethostbyname_ex(socket.gethostname())[2]
    except OSError:
        addresses = []
    outbound = local_ip_address()
    candidates = {address for address in [*addresses, outbound] if not address.startswith("127.")}

    def priority(address: str) -> tuple[int, str]:
        if address == "192.168.137.1":
            return (0, address)
        if address.startswith("192.168."):
            return (1, address)
        if address.startswith("172."):
            return (2, address)
        if address.startswith("10."):
            return (3, address)
        return (4, address)

    return sorted(candidates, key=priority)


def npm_executable() -> str:
    """Return the npm executable path for the current operating system."""
    executable = shutil.which("npm.cmd" if os.name == "nt" else "npm") or shutil.which("npm")
    if executable is None:
        raise LauncherError("npm was not found. Install Node.js 22+ and run this file again.")
    return executable


def build_commands(web_port: int) -> tuple[list[str], list[str]]:
    """Build API and web commands without invoking a shell."""
    npm = npm_executable()
    return (
        [npm, "run", "start:api"],
        [npm, "run", "dev", "--", "--host", "0.0.0.0", "--port", str(web_port)],
    )


def url_ready(url: str, timeout: float = 1.0) -> bool:
    """Return whether an HTTP endpoint responds successfully."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return 200 <= response.status < 400
    except (OSError, urllib.error.URLError):
        return False


def wait_until_ready(
    url: str,
    processes: Sequence[subprocess.Popen[bytes]],
    timeout: float = 45.0,
) -> None:
    """Wait for a URL while also detecting processes that exit early."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if url_ready(url):
            return
        failed = next((process for process in processes if process.poll() is not None), None)
        if failed is not None:
            raise LauncherError(f"A project process stopped early with exit code {failed.returncode}.")
        time.sleep(0.25)
    raise LauncherError(f"Timed out waiting for {url}")


def install_dependencies(environment: MutableMapping[str, str]) -> None:
    """Install JavaScript dependencies only when they are missing."""
    if (PROJECT_ROOT / "node_modules").is_dir():
        return
    print("Installing JavaScript dependencies (first run only)...")
    subprocess.run(
        [npm_executable(), "install", "--no-audit", "--no-fund"],
        cwd=PROJECT_ROOT,
        env=dict(environment),
        check=True,
    )


def start_process(command: Sequence[str], environment: MutableMapping[str, str]) -> subprocess.Popen[bytes]:
    """Start a child in its own process group so it can be stopped cleanly."""
    options: dict[str, object] = {
        "cwd": PROJECT_ROOT,
        "env": dict(environment),
    }
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        options["start_new_session"] = True
    return subprocess.Popen(list(command), **options)  # type: ignore[arg-type]


def stop_process(process: subprocess.Popen[bytes]) -> None:
    """Stop a launcher-owned process group, escalating only if necessary."""
    if process.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            process.wait(timeout=5)
        else:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()


def main() -> int:
    """Run the complete local project until the user presses Ctrl+C."""
    environment = os.environ.copy()
    load_env_file(PROJECT_ROOT / ".env.local", environment)
    environment["API_PORT"] = str(API_PORT)

    try:
        install_dependencies(environment)
        if not port_is_available(API_PORT):
            raise LauncherError(
                f"Port {API_PORT} is already in use. Close the other API process and try again."
            )
        web_port = find_available_port(DEFAULT_WEB_PORT)
        api_command, web_command = build_commands(web_port)
        processes = [
            start_process(api_command, environment),
            start_process(web_command, environment),
        ]
        api_url = f"http://127.0.0.1:{API_PORT}/api/health"
        web_url = f"http://127.0.0.1:{web_port}"
        wait_until_ready(api_url, processes)
        wait_until_ready(web_url, processes)
        print(f"\nNexus Support is running: {web_url}")
        for index, lan_ip in enumerate(local_ip_addresses()):
            label = "Android hotspot URL" if lan_ip == "192.168.137.1" else "LAN URL"
            suffix = " (try this first for Windows Mobile Hotspot)" if index == 0 and lan_ip == "192.168.137.1" else ""
            print(f"{label}: http://{lan_ip}:{web_port}/widget{suffix}")
        print("Press Ctrl+C to stop both servers.\n")
        if environment.get("NEXUS_NO_BROWSER") != "1":
            webbrowser.open(f"{web_url}/widget")
        if environment.get("NEXUS_SMOKE_EXIT") == "1":
            return 0
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
        raise LauncherError("A project process stopped unexpectedly.")
    except KeyboardInterrupt:
        print("\nStopping Nexus Support...")
        return 0
    except (LauncherError, subprocess.CalledProcessError) as error:
        print(f"\nCould not start Nexus Support: {error}", file=sys.stderr)
        return 1
    finally:
        for process in locals().get("processes", []):
            stop_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
