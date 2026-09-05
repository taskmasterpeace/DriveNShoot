"""Export contract: catches missing/oversized assets and non-cutaway roofs."""
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
    size, kind = struct.unpack_from("<II", raw, 12)
    if kind != 0x4E4F534A:
        raise ValueError("Missing GLB JSON")
    return json.loads(raw[20:20 + size])


def matrix(node):
    if "matrix" in node:
        m = node["matrix"]
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
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
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def bounds(gltf):
    points = []
    identity = [[int(r == c) for c in range(4)] for r in range(4)]

    def visit(index, parent):
        node = gltf["nodes"][index]
        transform = multiply(parent, matrix(node))
        if "mesh" in node:
            for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
                accessor = gltf["accessors"][primitive["attributes"]["POSITION"]]
                for x in (accessor["min"][0], accessor["max"][0]):
                    for y in (accessor["min"][1], accessor["max"][1]):
                        for z in (accessor["min"][2], accessor["max"][2]):
                            point = [x, y, z, 1]
                            points.append([sum(transform[r][k] * point[k] for k in range(4)) for r in range(3)])
        for child in node.get("children", []):
            visit(child, transform)

    for root in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        visit(root, identity)
    return ([min(p[i] for p in points) for i in range(3)],
            [max(p[i] for p in points) for i in range(3)])


class HomesteadContract(unittest.TestCase):
    def test_four_portable_original_game_assets(self):
        for name in ("roadstead_cottage", "parcel_mailbox", "freight_kiosk", "delivery_crate"):
            with self.subTest(asset=name):
                path = ASSETS / (name + ".glb")
                self.assertTrue(path.is_file(), "Missing Blender MCP asset: " + name)
                gltf = read_glb(path)
                self.assertEqual(len(gltf["scenes"]), 1, "Export accidentally includes other Blender scenes")
                self.assertLessEqual(len(gltf["nodes"]), 2, "Foreign asset or factory cube in GLB")
                self.assertFalse(any(n.get("name", "") == "Cube" for n in gltf["nodes"]))
                self.assertGreater(len(gltf.get("meshes", [])), 0)
                self.assertGreater(len(gltf.get("materials", [])), 1)
                self.assertFalse(any("uri" in b for b in gltf.get("buffers", [])), "GLB depends on external buffers")
                self.assertFalse(any("uri" in i for i in gltf.get("images", [])), "GLB depends on external images")
                triangles = sum(gltf["accessors"][p["indices"]]["count"] // 3
                                for mesh in gltf["meshes"] for p in mesh["primitives"])
                budget = {"roadstead_cottage":40000, "parcel_mailbox":4000, "freight_kiosk":12000, "delivery_crate":6000}[name]
                self.assertLess(triangles, budget, "Asset exceeds first-pass geometry budget")
                lo, hi = bounds(gltf)
                self.assertTrue(all(math.isfinite(n) for n in lo + hi))
                self.assertGreater(hi[1] - lo[1], 0.3, "Export is flattened or wrong-axis")
                if name == "roadstead_cottage":
                    self.assertTrue(any(n.get("name", "").startswith("Roof") and "mesh" in n for n in gltf["nodes"]), "No independently hideable roof")
                    self.assertGreater(hi[0] - lo[0], 9.5)
                    self.assertLess(hi[0] - lo[0], 13)
                    self.assertGreater(hi[1], 4)
                    self.assertLess(hi[1], 7)
                    self.assertGreater(hi[2], 5.5, "Porch must project toward Godot +Z")
                    self.assertGreater(lo[1], -0.3, "Ground origin is wrong")


if __name__ == "__main__":
    unittest.main()
