import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path


class DevLauncherTest(unittest.TestCase):
    def test_child_exit_stops_other_process(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "started"
            peer = "import pathlib,sys,time; pathlib.Path(sys.argv[1]).touch(); time.sleep(60)"
            failure = "import pathlib,sys,time; p=pathlib.Path(sys.argv[1]); exec('while not p.exists():\\n time.sleep(.01)'); sys.exit(7)"
            code = (
                "from scripts.dev import run; import sys; "
                "sys.exit(run([[sys.executable, '-c', sys.argv[1], sys.argv[3]], "
                "[sys.executable, '-c', sys.argv[2], sys.argv[3]]]))"
            )
            result = subprocess.run(
                [sys.executable, "-c", code, peer, failure, str(marker)],
                timeout=10,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 7, result.stderr.decode())

    def test_termination_stops_child_process_group(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "pid"
            peer = "import os,pathlib,sys,time; pathlib.Path(sys.argv[1]).write_text(str(os.getpid())); time.sleep(60)"
            code = "from scripts.dev import run; import sys; sys.exit(run([[sys.executable, '-c', sys.argv[1], sys.argv[2]]]))"
            launcher = subprocess.Popen([sys.executable, "-c", code, peer, str(marker)])
            try:
                deadline = time.monotonic() + 5
                while not marker.exists() and time.monotonic() < deadline:
                    time.sleep(0.02)
                self.assertTrue(marker.exists())
                child = int(marker.read_text())
                launcher.send_signal(signal.SIGTERM)
                self.assertEqual(launcher.wait(timeout=10), 0)
                with self.assertRaises(ProcessLookupError):
                    os.kill(child, 0)
            finally:
                if launcher.poll() is None:
                    launcher.kill()
                    launcher.wait()


if __name__ == "__main__":
    unittest.main()
