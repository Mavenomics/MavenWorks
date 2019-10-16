"""Handler for the Dashbook viewer."""

from notebook.base.handlers import IPythonHandler
import os


class ViewerApp(IPythonHandler):
    """Renders the viewer itself, with page config overrides."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def get(self, path=""):
        page_config = self.settings.get("page_config_data", {
            "wsUrl": self.ws_url
        })
        page_config.update({"baseUrl": self.base_url})
        return self.render(
            "viewer.html",
            baseUrl=self.base_url,
            page_config=page_config,
            # easter egg to use the cooler loading icon in place of the spinny
            not_boring=(os.getenv("COOLER_LOADING_ICON", None) is not None)
        )

    def get_template_path(self):
        return os.path.abspath(
            os.path.join(os.path.dirname(__file__), "./static/")
        )


class ViewerIndex(IPythonHandler):
    """Sends an index for conveniently navigating among the files."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def get(self, path=""):
        folder = self.contents_manager.get(path)
        if folder is None or folder['type'] != "directory":
            self.set_status(404)
            self.finish()
            return
        objs = folder['content']
        folders = list(filter(lambda i: i['type'] == "directory", objs))
        notebooks = list(filter(lambda i: i['type'] == "notebook", objs))
        self.render(
            "index.html",
            baseUrl=self.base_url,
            folders=folders,
            notebooks=notebooks
        )

    def get_template_path(self):
        return os.path.abspath(
            os.path.join(os.path.dirname(__file__), "./static/")
        )
