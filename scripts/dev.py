"""Run the development servers together and stop both on exit."""

import os
import signal
import subprocess
import sys
import time
from collections.abc import Sequence


def run(commands: Sequence[Sequence[str]]) -> int:
    processes: list[subprocess.Popen[bytes]] = []

    def stop(_signal: int, _frame: object) -> None:
        raise KeyboardInterrupt

    previous = signal.signal(signal.SIGTERM, stop)
    try:
        for command in commands:
            processes.append(subprocess.Popen(command, start_new_session=True))
        while True:
            for command, process in zip(commands, processes, strict=True):
                if (code := process.poll()) is not None:
                    print(
                        f"{command[0]} exited with status {code}; stopping development servers.",
                        file=sys.stderr,
                    )
                    return code if code > 0 else 1
            time.sleep(0.2)
    except KeyboardInterrupt:
        return 0
    finally:
        signal.signal(signal.SIGTERM, previous)
        for process in processes:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python scripts/dev.py DATABASE")
    sys.exit(
        run(
            [
                [
                    sys.executable,
                    "-m",
                    "miquest.runtime",
                    "serve",
                    "--database",
                    sys.argv[1],
                ],
                [
                    "npm",
                    "--prefix",
                    "frontend",
                    "run",
                    "dev",
                    "--",
                    "--host",
                    "127.0.0.1",
                    "--strictPort",
                ],
            ]
        )
    )
