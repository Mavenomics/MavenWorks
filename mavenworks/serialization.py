"""
Serialization utilities
=======================

These are quick and dirty, and lack the flexibility of the serialization system in MavenWorks
All they do is convert between Python and JSON representations of objects.
If you need conversions or pluggable serialization, reimplement this
"""
import json
from itertools import chain
from datetime import date, datetime
from pandas import DataFrame
from numbers import Real
import math
__supports_pyarrow = False
try:
    import pyarrow as pa
    from io import BytesIO
    __supports_pyarrow = True
except ImportError:
    pass  # no PyArrow support


class PassThrough:
    def __init__(self, data):
        self.data = data

    def to_json(self):
        if isinstance(self.data, str):
            return json.load(self.data)
        return self.data


def _serialize_table(obj):
    if __supports_pyarrow:
        try:
            f = BytesIO()
            data = pa.Table.from_pandas(obj, preserve_index=False)
            with pa.RecordBatchFileWriter(f, data.schema) as writer:
                writer.write_table(data)
            return {
                "arrow": True,
                # Tornado will encode this
                "data": f.getvalue()
            }
        except Exception as e:
            print("Failed to serialize to Arrow")
            print(e)
            # fall through to the JSON format

    def _serialize_row(row_obj, column_types, row_name=None):
        row_data = []
        for i, irow in enumerate(row_obj):
            if (column_types[i] == "Any"):
                datatype = guess_type(irow)
                row_data.append(serialize(irow, datatype))
            else:
                row_data.append(serialize(irow, column_types[i])["value"])
        return {
            "children": [],
            "name": row_name,
            "data": [serialize(irow, column_types[i]) for i, irow in enumerate(row_obj)]
        }

    serialized_table = {
        "rows": [],
        "cols": [],
        "types": []
    }
    for col in obj:
        serialized_table["cols"].append(col)
        # Use the numpy types to infer the MavenType
        serialized_table["types"].append(guess_type(obj.dtypes[col].type, check_instanceof=False))

    for i, row in obj.iterrows():
        serialized_table["rows"].append(_serialize_row(row, serialized_table["types"], i))
    return serialized_table


def _deserialize_table(obj):
    def _deserialize_val(val, idx: int):
        try:
            # if this fails, val doesn't have typeName
            if "typeName" not in val:
                return deserialize({"typeName": obj["types"][idx], "value": val})
            return deserialize(val)
        except TypeError:
            return deserialize({"typeName": obj["types"][idx], "value": val})

    def _deserialize_row(row_obj, nrows):
        row_values = getattr(row_obj, "value", row_obj)  # might be JSON struct
        return chain(
            [getattr(row_values, "name", nrows)],
            [
                _deserialize_val(val, i)
                for i, val in enumerate(row_values["data"])
            ]
        )

    df = DataFrame([_deserialize_row(r, i) for i, r in enumerate(obj["rows"])],
                   columns=list(chain(["rowname"], obj["cols"])))
    return df.set_index("rowname")


def _serialize_number(num_obj):
    if math.isnan(num_obj):
        return None
    return num_obj

def _deserialize_date(date_obj):
    if isinstance(date_obj, str):
        return datetime.fromisoformat(date_obj)
    if isinstance(date_obj, int):
        return datetime.utcfromtimestamp(date_obj/1000)
    raise ValueError('Invalid date object. Type: ' + str(type(date_obj)) + ' Value: ' + str(date_obj))


def _serialize_date(date_obj):
    return date_obj.isoformat()


def serialize(obj, annotated_type):
    """Roughly serialize a Python object into a good approximation of it's MavenWorks-serialized equivalent"""

    if isinstance(obj, PassThrough):
        return obj.to_json()

    # "who needs switch statements anyway?" -Guido Van Rossum
    serializers = {
        "Array": lambda array_obj: list(map(lambda i: serialize(i, guess_type(i)), array_obj)),
        "Date": _serialize_date,
        "DateTime": _serialize_date,
        "Table": _serialize_table,
        "Number": lambda num_obj: _serialize_number(num_obj),
    }
    if obj is not None and annotated_type in serializers:
        return {"typeName": annotated_type, "value": serializers[annotated_type](obj)}
    return {"typeName": annotated_type, "value": obj}


def deserialize(serialized_obj):
    """Attempt a simplistic deserialization of a MavenWorks object into an equivalent Python representation"""
    if serialized_obj is None:
        return None
    try:
        data = serialized_obj["value"]
    except (KeyError, TypeError):
        return serialized_obj  # improperly serialized object, do nothing and hope for the best
    data = serialized_obj["value"]
    deserializers = {
        "Array": lambda obj: list(map(lambda i: deserialize(i), obj)),
        "Table": _deserialize_table,
        "Date": _deserialize_date,
        "DateTime": _deserialize_date,
    }
    if serialized_obj["typeName"] in deserializers:
        return deserializers[serialized_obj["typeName"]](data)
    if hasattr(data, "val") or (isinstance(data, dict) and 'val' in data):
        return data["val"]
    return data


def guess_type(obj, check_instanceof=True):
    """Make a best guess as to what the MavenWorks equivalent type might be"""
    # ordered in decreasing certainty/specificity
    compare = isinstance if check_instanceof else issubclass
    if compare(obj, DataFrame):
        return "Table"
    if compare(obj, BaseException):
        return "Error"
    if compare(obj, datetime):
        return "DateTime"
    if compare(obj, date):
        return "Date"
    if compare(obj, bool):
        return "Boolean"
    if compare(obj, Real):
        # only real-valued numbers are supported in the MavenWorks converter
        return "Number"
    if compare(obj, str):
        return "String"
    if compare(obj, list):
        return "Array"
    if compare(obj, dict):
        return "Object"
    return "Any"  # no support for color, datetime


def traitlet_to_type(trait):
    """Returns an equivalent Maven type annotation for the given traitlet."""
    import traitlets
    if isinstance(trait, traitlets.Bool):
        return "Boolean"
    if any(isinstance(trait, x) for x in [
        traitlets.Integer,
        traitlets.Int,
        traitlets.Long,
        traitlets.Float
    ]):
        return "Number"
    if isinstance(trait, traitlets.Unicode) or isinstance(trait, traitlets.Bytes):
        return "String"
    if any(isinstance(trait, x) for x in [
        traitlets.List,
        traitlets.Tuple,
        traitlets.Set
    ]):
        return "Array"
    if any(isinstance(trait, x) for x in [
        traitlets.Dict,
        traitlets.Instance,
        traitlets.Type,
    ]):
        return "Object"
    if isinstance(trait, traitlets.Union):
        return traitlet_to_type(trait.trait_types[0])
    return "Any"
