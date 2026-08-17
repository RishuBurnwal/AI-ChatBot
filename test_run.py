import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import run


class LauncherTests(unittest.TestCase):
    def test_load_env_file_ignores_comments_and_preserves_existing_values(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.local"
            path.write_text("# comment\nGROQ_API_KEY=from-file\nAI_PROVIDER=groq\n", encoding="utf-8")
            environment = {"GROQ_API_KEY": "already-set"}

            run.load_env_file(path, environment)

            self.assertEqual(environment["GROQ_API_KEY"], "already-set")
            self.assertEqual(environment["AI_PROVIDER"], "groq")

    def test_find_available_port_skips_busy_ports(self) -> None:
        with patch("run.port_is_available", side_effect=[False, False, True]):
            self.assertEqual(run.find_available_port(5173, attempts=3), 5175)

    def test_build_commands_uses_cross_platform_npm_executable(self) -> None:
        with patch("run.shutil.which", return_value="C:/Program Files/nodejs/npm.cmd"):
            api, web = run.build_commands(5173)

        self.assertEqual(api, ["C:/Program Files/nodejs/npm.cmd", "run", "start:api"])
        self.assertEqual(
            web,
            ["C:/Program Files/nodejs/npm.cmd", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"],
        )

    def test_local_ip_address_uses_the_outbound_network_interface(self) -> None:
        fake_socket = unittest.mock.MagicMock()
        fake_socket.getsockname.return_value = ("192.168.137.1", 12345)
        with patch("run.socket.socket") as socket_factory:
            socket_factory.return_value.__enter__.return_value = fake_socket
            self.assertEqual(run.local_ip_address(), "192.168.137.1")

    def test_local_ip_addresses_lists_hotspot_before_other_adapters(self) -> None:
        with patch(
            "run.socket.gethostbyname_ex",
            return_value=("laptop", [], ["192.168.31.55", "10.5.0.2", "192.168.137.1"]),
        ):
            self.assertEqual(
                run.local_ip_addresses(),
                ["192.168.137.1", "192.168.31.55", "10.5.0.2"],
            )

    def test_project_root_is_the_launcher_directory(self) -> None:
        self.assertEqual(run.PROJECT_ROOT, Path(run.__file__).resolve().parent)


if __name__ == "__main__":
    unittest.main()
