# Face localization for the classifier

- Model [pico facefinder](https://github.com/nenadmarkus/pico/blob/7d550c78b2c31a4e1dfc5bcdfe9da013297b5cc8/rnt/cascades/facefinder), released with the repository MIT license. SHA-256 `d8014993e7298c7b1865d1f8b855d6dbf4ec5c808bf879e2091ab6837abf90cd`.
- [pico.js](https://github.com/nenadmarkus/picojs/tree/afffa50ec4134a47005f2cbf8112eaa69f65f37e), MIT, with the global declaration converted to an ES module export. The full notice accompanies the model and runtime in `vendor/LICENSE.txt`. Algorithm by N. Markus, M. Frljak, I. S. Pandzic, J. Ahlberg and R. Forchheimer. [Paper](https://arxiv.org/abs/1305.4537).
- The 192 × 192 grayscale test fixture is derived from NASA's public-domain photograph of Eileen Collins distributed with scikit-image 0.24. It is used only for localization testing. [Fixture source](https://github.com/scikit-image/scikit-image/blob/v0.24.0/skimage/data/astronaut.png) and [rights statement](https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut).

Run `node --test src/detectors/classifier/pico/tracker.test.mjs` from the project root.
