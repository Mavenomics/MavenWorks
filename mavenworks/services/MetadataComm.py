"""Metadata Comm - MavenWorks internal module.

The metadata comm syncs info on metadata about the current MavenWorks install,
such as available kernel parts.

Consumers of this module can update this metadata, so that the client UI can
leverage the updated metadata (for example, third-party parts will appear in
the drag-n-drop dashboard editor).
"""

from ..parts.DisplayHandle import _get_known_names, _set_name_hook
from ..parts.KernelPart import _get_all_parts, _set_new_part_hook
from ..serialization import serialize
from ipykernel.comm import Comm, CommManager
from IPython.core.getipython import get_ipython
from IPython.core.interactiveshell import InteractiveShell


def _send_part(comm: Comm, name, metadata):
    comm.send({
        "msg_type": "new_part",
        "payload": {
            "name": name,
            "options": [
                {
                    "name": opt.name,
                    "type": opt.type,
                    "value": serialize(opt.value, opt.type)
                } for opt in metadata.options_bag
            ]
        }
    })


def _send_new_display_handle(comm: Comm, display_name: str, display_id: str):
    comm.send({
        "msg_type": "named_display_handle",
        "handle_id": display_id,
        "handle_name": display_name
    })


def _send_all_parts(comm: Comm):
    for part_name, part_cls in _get_all_parts():
        _send_part(comm, part_name, part_cls.get_metadata())
    for display_name, display_id in _get_known_names().items():
        _send_new_display_handle(comm, display_name, display_id)
    comm.send({
        "msg_type": "kernel_parts_sent"
    })


def _on_msg(comm: Comm, msg):
    data = msg["content"]["data"]
    msg_type = data["msg_type"]
    if msg_type == "send_parts":
        _send_all_parts(comm)


def _close_comm():
    _set_new_part_hook(None)
    _set_name_hook(None)


def _open_comm(comm: Comm, msg):
    _set_name_hook(
        lambda display_name, display_id: _send_new_display_handle(
            comm,
            display_name,
            display_id
        )
    )
    _set_new_part_hook(
        lambda part_name, part_cls: _send_part(
            comm,
            part_name,
            part_cls.get_metadata()
        )
    )
    comm.on_msg(lambda msg: _on_msg(comm, msg))
    comm.on_close(_close_comm)


ip: InteractiveShell = get_ipython()

if ip is not None:
    manager: CommManager = ip.kernel.comm_manager
    manager.register_target("maven_metadata", _open_comm)
