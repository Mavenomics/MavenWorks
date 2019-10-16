"""Tornado handler for tracking Maven config (just UDPs for now)."""

import traceback
from notebook.base.handlers import IPythonHandler
from .config_object_tracker import ConfigObjectTracker


class LocalConfig(IPythonHandler):
    """Provides information on config objects via HTTP.

    Requestors can fetch all UDP definitions, and that's about it right now.

    Later passes might add:
      - Read from additional directories
      - Read paths only, and definitions later
      - Read and cache definitions
      - Notify on cache updates
      etc.
    """

    def __init__(self, *args, logger=None, **kwargs):
        """Initialize the HTTP router.

        Takes a logger object as a kwarg for recording errors.
        """
        super().__init__(*args, **kwargs)
        self.logger = logger

    def get(self):
        """Given a working directory, look for any UDPs in the filesystem.

        Parts may live in <Jupyter root>/parts and <workdir>. This means that
        parts can be defined alongside the notebooks that reference them, but
        not above (unless placed into that global /parts folder).
        """
        data = []
        path = self.get_argument("path", ".")
        self.logger.debug("Using path for config request: " + path)
        try:
            iterator = ConfigObjectTracker.get_objects_in_tree('.', path)
            for config_obj in iterator:
                data.append(config_obj)
            self.set_status(200)
            self.write({"objs": data})
        except Exception:
            self.logger.error("Searching config failed")
            self.logger.error(traceback.format_exc())
            self.write_error(500)
        return self.finish()
