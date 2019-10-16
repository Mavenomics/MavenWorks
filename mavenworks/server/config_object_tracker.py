"""Helper for loading config objects."""

import os
import json
import warnings
from ..settings import get_setting

parts_dir = get_setting("global_parts_folder")


class ConfigObjectTracker:
    """Class to sniff all the config objects in a directory.

    For the first cut, there's no file watching or update msgs. We could add
    it, but for now YAGNI applies as there's no need for any editors to be
    aware of config staleness (as they just use file i/o directly).

    The use case for update msgs would be for updating a downstream cache,
    which is a likely future optimization (especially if we needed to use
    this in large-scale deployments- the current approach of checking on every
    query works is just fine for small-scale and individual deployments).
    """

    @staticmethod
    def get_objects_in_tree(root_dir, cwd):
        """Search for config objects, given a root directory and a scoped path.

        Scoping allows config objects to not 'poison' unrelated work in other
        directories. The scoping is rather primitive, and based on the folder
        tree. If anything appears in the global parts directory, it will appear
        to all dashboards. If a config object appears in the scoped directory,
        it will appear to all dashboards under that scope.

        If a config object in local scope has the same name as a config object
        in global scope, the local object will be ordered after the global
        object in the response. Clients should therefore "shadow" the global
        object, replacing it with the local object.
        """
        root_dir = os.path.abspath(root_dir)
        # strip any leading slash
        cwd = cwd[1:] if cwd.startswith("/") else cwd
        work_dir = os.path.abspath(cwd)
        if not work_dir.startswith(root_dir):
            msg = "Working directory must be under Jupyter root! Got: "
            msg += work_dir
            raise Exception(msg)
        if (work_dir != root_dir):
            yield from ConfigObjectTracker.get_objects_in_subtree(
                root_dir,
                parts_dir
            )
        yield from ConfigObjectTracker.get_objects_in_subtree(root_dir, cwd)

    @staticmethod
    def get_objects_in_subtree(root_dir, subtree_dir):
        """Get all config objects in a given subtree, correcting for path."""
        actual_path = os.path.join(root_dir, subtree_dir)
        with os.scandir(actual_path) as child_iter:
            for entry in child_iter:
                if entry.name.startswith("."):  # Ignore hidden files+dirs
                    continue
                success, obj = ConfigObjectTracker.__try_read_file(
                    entry,
                    actual_path,
                    root_dir
                )
                if not success:
                    if entry.is_dir():
                        yield from ConfigObjectTracker.get_objects_in_subtree(
                            root_dir,
                            entry.path
                        )
                    continue
                yield obj

    @staticmethod
    def __try_read_file(dir_entry: os.DirEntry, scan_dir: str, base_path: str):
        """Attempt to read a file. Internal.

        If the file given by ``dir_entry`` is a Maven config object, return
        a tuple of (True, JSON dict) representing that object. If the object
        could be read but wasn't a part, return (False, None). If the object
        couldn't be read, raise an exception.

        :param dir_entry: A DirEntry object, as returned by os.scandir
        :param scan_dir: The directory on which os.scandir was called. May be
                         an empty string.
        :param base_path: The base path of the config, where "/" is the root of
        the config.
        """
        name, ext = os.path.splitext(dir_entry.path)
        if dir_entry.is_dir() or ext != ".part":
            return (False, None)
        file_path = os.path.join(base_path, scan_dir, dir_entry.path)
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                path = ConfigObjectTracker.__norm_path(file_path, base_path)
                # return a corrected dict
                obj = {
                    # todo: Should we generate a uuid1 from the file's inode?
                    # Technically IDs should be unique to a config and
                    # immutable across a given object's lifetime, however
                    # inodes are only unique to a block device and may change
                    # with renames/moves. This means a config with a symlink to
                    # a network drive or another disk might have duplicate
                    # inodes, and with uuid1s, they will have duplicate IDs.
                    "id": data["id"],
                    "typeName": data["typeName"],
                    # Because this is a directory store, we can safely ignore
                    # whatever the file says is true, because the filesystem
                    # is more accurate in these regards
                    "lastModified": os.path.getmtime(file_path),
                    "name": os.path.basename(name),
                    "path": path,
                }
                if "data" in data:
                    # this is a FileConfigObject, attach the data
                    obj["data"] = data["data"]
                if "functionType" in data and "arguments" in data:
                    # this is a UDF or UDP, attach those args
                    obj["functionType"] = data["functionType"]
                    obj["arguments"] = data["arguments"]
                return (True, obj)
        except (json.JSONDecodeError, KeyError):
            # Not a part, or a malformed part
            return (False, None)
        except UnicodeDecodeError as e:
            # Corrupted file, could not read
            warnings.warn("Failed to read file" + file_path)
            warnings.warn(e)
            return (False, None)
        # Other exception classes are raised to the parent, like decoding
        # errors or permission errors. These indicate that the file can't
        # be read, not that the file isn't a part.

    @staticmethod
    def __norm_path(old_path, config_base_path):
        r"""Normalize the path to the canonical form of a Maven config path.

        This means that Windows-style slashes ('\') are replaced with UNIX-
        style slashes, trailing slashes are removed, and a leading slash is
        added. The path given is relative to ``config_base_bath``, which is the
        root directory of the config.
        """
        fixed_path = os.path.relpath(old_path, config_base_path)
        fixed_path = fixed_path.replace("\\", "/")
        if not fixed_path.startswith("/"):
            fixed_path = "/" + fixed_path
        if fixed_path.endswith("/") and len(fixed_path) > 1:
            fixed_path = fixed_path[1:]
        return fixed_path
