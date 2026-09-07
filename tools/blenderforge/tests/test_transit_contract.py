"""Real exported meshes must support later coach/rotor passenger animation."""
import math
import unittest
from pathlib import Path
from test_homestead_contract import read_glb, geometry_bounds, matrix, multiply

ASSETS = Path(__file__).resolve().parents[3] / 'game/assets/models/transit'


def world_nodes(gltf):
    result = {}
    identity = [[int(r == c) for c in range(4)] for r in range(4)]

    def visit(index, parent):
        node = gltf['nodes'][index]
        transform = multiply(parent, matrix(node))
        result[node['name']] = (node, transform)
        for child in node.get('children', []):
            visit(child, transform)

    for index in gltf['scenes'][gltf.get('scene', 0)]['nodes']:
        visit(index, identity)
    return result


class TransitContract(unittest.TestCase):
    def verify_asset(self, name, budget):
        path = ASSETS / (name + '.glb')
        self.assertTrue(path.is_file(), 'Missing original transit asset: ' + name)
        gltf, binary = read_glb(path)
        self.assertEqual(len(gltf['scenes']), 1, 'Other scenes leaked into the vehicle')
        self.assertFalse(any('uri' in b for b in gltf.get('buffers', [])))
        self.assertFalse(any('uri' in i for i in gltf.get('images', [])))
        self.assertNotIn('cameras', gltf, 'Studio camera leaked into game asset')
        nodes = world_nodes(gltf)
        self.assertFalse(any(n.startswith('Preview_') for n in nodes))
        triangles = sum(gltf['accessors'][p['indices']]['count'] // 3
                        for mesh in gltf['meshes'] for p in mesh['primitives'])
        self.assertGreater(triangles, 500, 'Vehicle is an empty/placeholder shell')
        self.assertLessEqual(triangles, budget)
        low, high = geometry_bounds(gltf, binary)
        self.assertTrue(all(math.isfinite(v) for v in low + high))
        self.assertGreaterEqual(low[1], -0.03, 'Wheels/skids sink under the ground origin')
        self.assertLessEqual(low[1], 0.03, 'Wheels/skids float above the ground origin')
        for anchor in ('Seat_driver', 'Seat_passenger_01', 'Boarding', 'Exit'):
            self.assertIn(anchor, nodes, 'Missing gameplay attachment: ' + anchor)
            self.assertNotIn('mesh', nodes[anchor][0], 'An attachment must not render')
        driver = nodes['Seat_driver'][1]
        self.assertLess(driver[0][3], 0, 'Driver must sit on the left')
        self.assertLess(driver[2][3], 0, 'Vehicle faces Godot -Z')
        self.assertGreater(nodes['Boarding'][1][0][3], 1, 'Board on the right, away from traffic')
        print(f'TRANSIT ASSET {name}: {triangles} triangles, bounds {low}..{high}, nodes {len(nodes)}')
        return gltf, binary, nodes, low, high

    def test_coach_has_grounded_animation_ready_geometry(self):
        gltf, binary, nodes, low, high = self.verify_asset('lastline_coach', 60000)
        self.assertTrue(2.4 <= high[0] - low[0] <= 3.2)
        self.assertTrue(8.0 <= high[2] - low[2] <= 9.5)
        self.assertTrue(3.0 <= high[1] <= 3.8)
        for wheel in ('Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'):
            self.assertIn(wheel, nodes)
            node, transform = nodes[wheel]
            self.assertIn('mesh', node)
            self.assertAlmostEqual(transform[1][3], .50, delta=.01)
            local = gltf['accessors'][gltf['meshes'][node['mesh']]['primitives'][0]['attributes']['POSITION']]
            self.assertGreater(local['count'], 12)
        self.assertIn('Door_passenger', nodes)
        self.assertIn('Roof_coach', nodes)
        # Actual roof geometry, not an extras flag, must remain independently hideable.
        roof_low, roof_high = geometry_bounds(gltf, binary, 'Roof_coach')
        self.assertGreater(roof_low[1], 2.7)
        self.assertGreater(roof_high[2] - roof_low[2], 7)
        for n in range(1, 7):
            self.assertIn(f'Seat_passenger_{n:02d}', nodes)

    def test_helicopter_has_independent_rotor_pivots_and_skids(self):
        gltf, binary, nodes, low, high = self.verify_asset('kestrel_courier', 60000)
        self.assertTrue(9.0 <= high[0] - low[0] <= 11.0)
        self.assertTrue(8.0 <= high[2] - low[2] <= 11.0)
        self.assertTrue(3.0 <= high[1] <= 4.0)
        for name in ('Rotor_main', 'Rotor_tail', 'Door_passenger', 'Roof_cabin'):
            self.assertIn(name, nodes)
            self.assertIn('mesh', nodes[name][0])
        main = nodes['Rotor_main'][1]
        self.assertAlmostEqual(main[0][3], 0, delta=.01)
        self.assertTrue(3.1 <= main[1][3] <= 3.6)
        rotor_low, rotor_high = geometry_bounds(gltf, binary, 'Rotor_main')
        self.assertGreater(rotor_high[0] - rotor_low[0], 9)
        self.assertLess(rotor_high[1] - rotor_low[1], .4)
        self.assertGreater(nodes['Rotor_tail'][1][2][3], 3.5)


if __name__ == '__main__':
    unittest.main()
