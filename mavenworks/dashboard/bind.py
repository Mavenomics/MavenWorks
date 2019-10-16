class Binding:
    def __init__(self, binding_type, expr):
        self.__type = binding_type
        self.__expr = expr

    def _as_json(self):
        return {
            "type": self.__type,
            "expr": self.__expr,
            "__detect_globals": True
        }


class Mql(Binding):
    def __init__(self, query):
        super().__init__("Mql", query)


class Js(Binding):
    def __init__(self, code):
        super().__init__("JavaScript", code)


class Py(Binding):
    def __init__(self, code):
        super().__init__("Eval", code)


class Global(Binding):
    def __init__(self, global_name):
        super().__init__("Global", global_name)
