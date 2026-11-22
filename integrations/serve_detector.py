import argparse
import importlib
from ftcn.http_api import serve

ENGINES = {'altfreezing': ('AltFreezing', 8769, 32), 'sbi': ('SBI', 8770, 1)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('model', choices=ENGINES)
    model = parser.parse_args().model
    name, port, frames = ENGINES[model]

    def load():
        engine = importlib.import_module(model + '.engine')
        if (engine.FRAMES, engine.SIDE) != (frames, 320):
            raise ValueError('Размер входа модели не соответствует адаптеру')
        return engine.Detector()

    serve(name, port, frames, 320, load)


if __name__ == '__main__':
    main()
