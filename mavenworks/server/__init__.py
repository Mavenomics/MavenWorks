"""Server utilities for MavenWorks. Provides the Config handler and Viewer."""

from tornado.web import StaticFileHandler
from notebook.utils import url_path_join
from .local_config import LocalConfig
from .viewer import ViewerApp, ViewerIndex
import os


def load_jupyter_server_extension(nb_app):
    """Register the MavenWorks server extensions."""
    host_pattern = '.*$'
    web_app = nb_app.web_app
    base_url = web_app.settings["base_url"]
    web_app.add_handlers(host_pattern, [
        (
            url_path_join(base_url, r"/serverconfig/?$"),
            LocalConfig,
            {"logger": nb_app.log}
        ), (
            url_path_join(base_url, "/view/", r".*$"),
            ViewerApp
        ), (
            url_path_join(base_url, r"/viewindex/?(.*)$"),
            ViewerIndex
        ), (
            url_path_join(base_url, "/viewer/static", r"(.*)$"),
            StaticFileHandler,
            {
                "path": os.path.abspath(
                    os.path.join(os.path.dirname(__file__), "./static/")
                )
            }
        )
    ])


def _jupyter_server_extension_paths():
    return [{
        "module": "mavenworks.server"
    }]
