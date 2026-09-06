"""Original yard exports: actual binary geometry, not authoring metadata."""
import math
import unittest
from test_homestead_contract import ASSETS, geometry_bounds, read_glb


class RoadsteadYardContract(unittest.TestCase):
    def test_portable_metre_scale_yard_props(self):
        # Catch missing, foreign, floating, flattened or accidentally huge exports.
        bounds = {
            "freight_shelter": ((5.8, 3.0, 3.8), (6.7, 4.5, 4.8), 15000),
            "reclaimed_fence": ((3.9, 0.9, 0.12), (4.2, 1.6, 0.5), 4000),
            "yard_lamp": ((0.3, 3.3, 0.3), (1.0, 4.3, 1.0), 4000),
        }
        for name, (minimum, maximum, budget) in bounds.items():
            with self.subTest(asset=name):
                path = ASSETS / (name + ".glb")
                self.assertTrue(path.is_file(), "Missing original yard asset: " + name)
                gltf, binary = read_glb(path)
                self.assertEqual(len(gltf["scenes"]), 1)
                self.assertFalse(any("uri" in b for b in gltf.get("buffers", [])))
                self.assertFalse(any("uri" in i for i in gltf.get("images", [])))
                low, high = geometry_bounds(gltf, binary)
                self.assertTrue(all(math.isfinite(v) for v in low + high))
                self.assertGreaterEqual(low[1], -0.06)
                self.assertLessEqual(low[1], 0.02, "Grounded props must not float")
                for axis in range(3):
                    self.assertGreaterEqual(high[axis] - low[axis], minimum[axis])
                    self.assertLessEqual(high[axis] - low[axis], maximum[axis])
                triangles = sum(gltf["accessors"][p["indices"]]["count"] // 3
                                for m in gltf["meshes"] for p in m["primitives"])
                self.assertGreater(triangles, 50)
                self.assertLess(triangles, budget)
                if name == "freight_shelter":
                    self.assertTrue(any(n.get("name", "").startswith("Roof") and "mesh" in n
                                        for n in gltf["nodes"]), "Cutaway roof must be independent")


if __name__ == "__main__":
    unittest.main()
