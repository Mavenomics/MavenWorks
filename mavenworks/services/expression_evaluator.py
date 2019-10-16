"""
KernelExpressionEvaluator
=========================

MavenWorks utility for evaluating global expressions

_Note_: The "right" way to get globals referenced by an expression  is to have
this comm do it. But as things are right now, Python's AST module doesn't work
well with modified grammars. So for now the client handles this with a hacky
regex. Not ideal, but it works for now.

Expressions are kernel code that reference global values and form a reactive
calculation (like Excel formulas). Clients track globals, and when those
globals change, the client will re-evaluate the expression by sending a message
to this comm with the current values of the referenced globals.

The comm accepts the following messages:

 - ``evaluate_expr``: Given an expression and the values of a set of globals,
   evaluate the expression and return the result. If the expression failed to
   complete, trap the error and return it to the front-end

The comm sends the following messages:

 - ``expr_value``: Returns the value of an expression given by a previous
   ``evaluate_expr`` message. If there was an error in evaluation, this comm
   will instead send ``expr_error``.
 - ``expr_error``: If a expression evaluation failed, this will be sent instead
   of ``expr_value`` and will include a serialized form of error that clients
   must present to the user.
"""


import re
import sys
from typing import AnyStr, Dict, Any
from IPython import get_ipython
from IPython.core.ultratb import VerboseTB
from ipykernel.comm import Comm
from ..serialization import serialize, deserialize, guess_type

MESSAGE_TYPES = [
    "evaluate_expr"
]
tb_formatter = VerboseTB()
global_regex = re.compile(r"\@([A-Za-z][A-Za-z0-9_]*)")


def evaluate_expr(
        expr: AnyStr,
        globals_dict: Dict[AnyStr, Any],
        comm: Comm,
        parent: AnyStr):
    ip = get_ipython()
    locals_dict = {}
    locals_dict.update(ip.user_ns)
    locals_dict.update(globals_dict)
    expr = global_regex.sub(r"\1", expr)
    try:
        value = eval(expr, ip.user_global_ns, locals_dict)
    except:  # noqa: E722
        exc_info = sys.exc_info()
        exc = tb_formatter.text(*exc_info)
        comm.send({
            "msg_type": "expr_error",
            "payload": serialize(exc, "String"),
            "parent": parent
        })
        return
    comm.send({
        "msg_type": "expr_value",
        "payload": serialize(value, guess_type(value)),
        "parent": parent
    })


def dispatch_message(comm, msg):
    content = msg["content"]["data"]
    msg_type = content["msg_type"]
    if msg_type not in MESSAGE_TYPES:
        raise KeyError("Unrecognized message type " + msg_type)
    globals_dict = {
        g: deserialize(v) for g, v in content["globals"].items()
    }
    evaluate_expr(content.get("expr", ""), globals_dict, comm, content["uuid"])


def register_frontend(comm, _msg):
    comm.on_msg(lambda msg: dispatch_message(comm, msg))


ip = get_ipython()

if ip is not None:
    ip.kernel.comm_manager.register_target(
        "expression_evaluator",
        register_frontend
    )
