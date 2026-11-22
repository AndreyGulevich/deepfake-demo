"""Offline tests for configuration, fixed-source processing and download policy."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

from dlc_engine import coreml_model, Animator, REVISION, local_files, offline


class ConfigTests(unittest.TestCase):
    def test_coreml_cache_preserves_fp16_values_and_original(self):
        try:
            import onnx
            import numpy as np
        except ImportError:
            self.skipTest('Requires the Deep-Live-Cam environment')
        from onnx import TensorProto, helper, numpy_helper
        values = np.array([0.125, -0.75], np.float16)
        weight = numpy_helper.from_array(values, 'weights')
        node = helper.make_node('Cast', ['weights'], ['out'], to=TensorProto.FLOAT16)
        output = helper.make_tensor_value_info('out', TensorProto.FLOAT16, [2])
        model = helper.make_model(helper.make_graph([node], 'cache-test', [], [output], [weight]))
        with TemporaryDirectory() as folder:
            path = Path(folder) / 'original.onnx'
            onnx.save(model, str(path))
            original = path.read_bytes()
            optimizer = Mock()
            optimizer.optimize_for_coreml.side_effect = lambda local, shape: local
            with patch.dict('sys.modules', {'modules.onnx_optimize': optimizer}):
                result = coreml_model(path, is_swapper=True)
                self.assertEqual(coreml_model(path, is_swapper=True), result)
            optimizer.optimize_for_coreml.assert_called_once()
            graph = onnx.load(result).graph
            self.assertEqual(graph.initializer[0].data_type, TensorProto.FLOAT)
            np.testing.assert_array_equal(numpy_helper.to_array(graph.initializer[0]), values)
            self.assertEqual(graph.node[0].attribute[0].i, TensorProto.FLOAT)
            self.assertEqual(graph.output[0].type.tensor_type.elem_type, TensorProto.FLOAT)
            self.assertEqual(path.read_bytes(), original)

    def test_missing_checkout(self):
        with self.assertRaisesRegex(ValueError, 'DLC_REPO'):
            local_files(None, None)

    def test_only_explicit_complete_weights_and_pinned_code(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            processor = root / 'modules/processors/frame/face_swapper.py'
            processor.parent.mkdir(parents=True)
            processor.touch()
            with patch('dlc_engine.subprocess.run', return_value=Mock(returncode=0, stdout='other')):
                with self.assertRaisesRegex(ValueError, REVISION):
                    local_files(root, root)
            with patch('dlc_engine.subprocess.run', return_value=Mock(returncode=0, stdout=REVISION)):
                with self.assertRaisesRegex(ValueError, 'DLC_MODELS'):
                    local_files(root, None)
                with self.assertRaisesRegex(ValueError, 'Missing local weights.*det_10g.*w600k.*inswapper'):
                    local_files(root, root)
                swap = root / 'inswapper_128_fp16.onnx'
                det, rec = (root / 'buffalo_l' / name for name in ('det_10g.onnx', 'w600k_r50.onnx'))
                det.parent.mkdir()
                for file in (swap, det, rec):
                    file.write_bytes(b'test presence only')
                self.assertEqual(local_files(root, root), (root.resolve(), swap.resolve(), det.resolve(), rec.resolve()))

    def test_inference_needs_no_outbound_socket(self):
        for operation in ('socket.connect', 'urllib.Request'):
            with self.assertRaises(PermissionError):
                offline(operation, ())
        offline('socket.bind', ())

    def test_swaps_with_fixed_source_and_rejects_upstream_passthrough(self):
        engine = object.__new__(Animator)
        engine.source = object()
        engine.np = Mock()
        frame, target = Mock(), object()
        result = Mock(shape=frame.shape)
        engine.process = Mock(return_value=result)
        engine.np.array_equal.return_value = False
        self.assertIs(engine.swapped(frame, target), result)
        engine.process.assert_called_once_with(engine.source, frame.copy.return_value, target_face=target)
        engine.np.array_equal.return_value = True
        with self.assertRaisesRegex(RuntimeError, 'unchanged'):
            engine.swapped(frame, target)

    def test_counts_only_successful_incoming_face_swaps(self):
        engine = object.__new__(Animator)
        engine.np, engine.cv2 = Mock(), Mock()
        engine.detect, engine.swapped = Mock(), Mock()
        engine.fresh_faces = 0
        engine.swapped_frames = 0
        engine.detect.side_effect = (None, object(), object())
        engine.frame(b'fixture', None)
        self.assertEqual(engine.swapped_frames, 0)
        engine.frame(b'fixture', None)
        self.assertEqual(engine.swapped_frames, 1)
        self.assertEqual(engine.fresh_faces, 1)
        engine.swapped.side_effect = RuntimeError('Inference failed')
        with self.assertRaises(RuntimeError):
            engine.frame(b'fixture', None)
        self.assertEqual(engine.swapped_frames, 1)
        self.assertEqual(engine.fresh_faces, 1)


if __name__ == '__main__':
    unittest.main()
