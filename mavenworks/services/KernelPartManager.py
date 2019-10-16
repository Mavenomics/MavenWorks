from ..parts import KernelPart, OptionsBag
from IPython.utils.capture import capture_output
from IPython.core.ultratb import VerboseTB
from ipykernel.comm import Comm, CommManager
from IPython.core.getipython import get_ipython
from IPython.core.formatters import format_display_data
from ..serialization import serialize, guess_type, deserialize
import sys


class KernelPartManager:
    instance = None

    @classmethod
    def Create(cls):
        if cls.instance is not None:
            return cls.instance
        return KernelPartManager()

    def __init__(self):
        if self.instance is not None:
            raise RuntimeError(
                "Only one instance of KernelPartManager is allowed"
            )
        self.parts = {}
        self.options_bags = {}
        self.error_formatter = VerboseTB()
        # Connect to a comm

    def create_part(self, type_name, uuid):
        part = KernelPart.Create(type_name)
        part.uuid = uuid
        self.parts[uuid] = part
        self.options_bags[uuid] = OptionsBag(part.get_metadata())

    def destroy_part(self, uuid):
        self.parts[uuid].dispose()
        del self.parts[uuid]
        del self.options_bags[uuid]

    def initialize_part(self, uuid):
        self.parts[uuid].initialize()

    def render_part(self, uuid, options):
        bag: OptionsBag = self.options_bags[uuid]
        bag.is_stale = True
        for opt in options.keys():
            bag[opt] = options[opt]
        bag.set_fresh()
        with capture_output() as capture:
            ret = self.parts[uuid].render(bag)
        if ret is not None:
            return ret
        elif len(capture.outputs) > 0:
            return capture.outputs[0]
        else:
            return capture.stdout + capture.stderr

    def dispatch_msg(self, msg, comm: Comm):
        data = msg['content']['data']
        msg_type = data['msg_type']
        uuid = data['uuid']
        payload = data['payload']
        if msg_type == "create":
            self.create_part(payload, uuid)
            bag: OptionsBag = self.options_bags[uuid]
            bag.OnStale.subscribe(lambda args: comm.send({
                "msg_type": "stale",
                "uuid": uuid,
                "payload": {
                    "name": args[0],
                    "value": serialize(args[1], guess_type(args[1]))
                }
            }))
        if msg_type == "initialize":
            error = None
            try:
                self.initialize_part(uuid)
            except:  # noqa: E722
                exc_info = sys.exc_info()
                error = self.error_formatter.text(*exc_info)
            comm.send({
                "msg_type": "initialize_done",
                "uuid": uuid,
                "payload": None,
                "error": error
            })
        if msg_type == "render":
            options = {
                name: deserialize(value) for name, value in payload.items()
            }
            error = None
            value = None
            try:
                display_data, display_metadata = format_display_data(
                    self.render_part(uuid, options)
                )
                value = {
                    "data": display_data,
                    "metadata": display_metadata
                }
            except:  # noqa: E722
                exc_info = sys.exc_info()
                error = self.error_formatter.text(*exc_info)
            comm.send({
                "msg_type": "render_done",
                "uuid": uuid,
                "payload": value,
                "error": error
            })
        if msg_type == "dispose":
            return self.destroy_part(uuid)


manager = KernelPartManager.Create()
ip = get_ipython()


def _register_new_client(comm, msg):
    comm.on_msg(lambda msg: manager.dispatch_msg(msg, comm))
    # TODO: Track what parts were created by a comm and make sure all those
    # parts are destroyed when the channel dies


if ip is not None:
    comm_manager: CommManager = ip.kernel.comm_manager
    comm_manager.register_target("kernel_proxy_part", _register_new_client)
