"""Export contract: inspect real GLB vertices, hierarchy and resource portability."""
import json
import math
import struct
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "game/assets/models/homestead"


def read_glb(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", raw)
    if (magic, version, length) != (0x46546C67, 2, len(raw)):
        raise ValueError("Invalid GLB header")
    chunks = {}
    offset = 12
    while offset < len(raw):
        size, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunks[kind] = raw[offset:offset + size]
        offset += size
    if 0x4E4F534A not in chunks or 0x004E4942 not in chunks:
        raise ValueError("GLB must contain JSON and embedded binary geometry")
    document = json.loads(chunks[0x4E4F534A].decode("utf-8").rstrip(" \0"))
    return document, chunks[0x004E4942]


def matrix(node):
    if "matrix" in node:
        values = node["matrix"]
        return [[values[column * 4 + row] for column in range(4)] for row in range(4)]
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    tx, ty, tz = node.get("translation", [0, 0, 0])
    return [
        [(1-2*y*y-2*z*z)*sx, (2*x*y-2*z*w)*sy, (2*x*z+2*y*w)*sz, tx],
        [(2*x*y+2*z*w)*sx, (1-2*x*x-2*z*z)*sy, (2*y*z-2*x*w)*sz, ty],
        [(2*x*z-2*y*w)*sx, (2*y*z+2*x*w)*sy, (1-2*x*x-2*y*y)*sz, tz],
        [0, 0, 0, 1],
    ]


def multiply(a, b):
    return [[sum(a[row][k] * b[k][column] for k in range(4))
             for column in range(4)] for row in range(4)]


def position_values(gltf, binary, accessor_index):
    accessor = gltf["accessors"][accessor_index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    if accessor["componentType"] != 5126 or accessor["type"] != "VEC3":
        raise ValueError("Position accessor must contain float VEC3 values")
    stride = view.get("byteStride", 12)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from("<fff", binary, start + index * stride)
            for index in range(accessor["count"])]


def geometry_bounds(gltf, binary, node_prefix=None):
    points = []
    identity = [[int(row == column) for column in range(4)] for row in range(4)]

    def visit(index, parent):
        node = gltf["nodes"][index]
        transform = multiply(parent, matrix(node))
        if "mesh" in node and (node_prefix is None or node.get("name", "").startswith(node_prefix)):
            for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
                for point in position_values(gltf, binary, primitive["attributes"]["POSITION"]):
                    value = [point[0], point[1], point[2], 1]
                    points.append([sum(transform[row][k] * value[k] for k in range(4))
                                   for row in range(3)])
        for child in node.get("children", []):
            visit(child, transform)

    for root in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        visit(root, identity)
    return ([min(point[axis] for point in points) for axis in range(3)],
            [max(point[axis] for point in points) for axis in range(3)])


class HomesteadContract(unittest.TestCase):
    def test_four_portable_original_game_assets(self):
        for name in ("roadstead_cottage", "parcel_mailbox", "freight_kiosk", "delivery_crate"):
            with self.subTest(asset=name):
                path = ASSETS / (name + ".glb")
                self.assertTrue(path.is_file(), "Missing Blender MCP asset: " + name)
                gltf, binary = read_glb(path)
                self.assertEqual(len(gltf["scenes"]), 1, "Export accidentally includes other Blender scenes")
                self.assertLessEqual(len(gltf["nodes"]), 2, "Foreign asset or factory cube in GLB")
                self.assertFalse(any(node.get("name", "") == "Cube" for node in gltf["nodes"]))
                self.assertGreater(len(gltf.get("meshes", [])), 0)
                self.assertGreater(len(gltf.get("materials", [])), 1)
                self.assertFalse(any("uri" in buffer for buffer in gltf.get("buffers", [])), "GLB depends on external buffers")
                self.assertFalse(any("uri" in image for image in gltf.get("images", [])), "GLB depends on external images")
                triangles = sum(gltf["accessors"][primitive["indices"]]["count"] // 3
                                for mesh in gltf["meshes"] for primitive in mesh["primitives"])
                budget = {"roadstead_cottage":40000, "parcel_mailbox":4000,
                          "freight_kiosk":12000, "delivery_crate":6000}[name]
                self.assertLess(triangles, budget, "Asset exceeds first-pass geometry budget")
                low, high = geometry_bounds(gltf, binary)
                self.assertTrue(all(math.isfinite(number) for number in low + high))
                self.assertGreater(high[1] - low[1], 0.3, "Export is flattened or wrong-axis")
                if name == "roadstead_cottage":
                    self.assertTrue(any(node.get("name", "").startswith("Roof") and "mesh" in node
                                        for node in gltf["nodes"]), "No independently hideable roof")
                    self.assertGreater(high[1], 4, "Cottage roof is flattened or underscaled")
                    self.assertLess(high[1], 7, "Cottage roof exceeds metre-scale height")
                    self.assertGreater(high[2], 5.5, "Porch must project toward Godot +Z")
                    body_low, _body_high = geometry_bounds(gltf, binary, "Body")
                    self.assertGreaterEqual(body_low[1], -0.06, "Body sinks below the documented ground tolerance")
                    self.assertLessEqual(body_low[1], 0.02, "Body floats above the documented ground tolerance")


if __name__ == "__main__":
    unittest.main()
