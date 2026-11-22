# AltFreezing

Локальный сервер выполняет авторскую 3D-сеть I3D на CPU в отдельном процессе. На входе 32 последовательных кадра 320 × 320 RGBA. YuNet ищет пять ориентиров одного лица. При потере лица, скачке координат или нескольких лицах сервер возвращает `no_track`. Общее выравнивание клипа, RGB 224 × 224, нормализация ImageNet и sigmoid соответствуют авторскому примеру. Подготовка лиц для демки отличается от офлайн-пайплайна авторов, использующего RetinaFace. Оценки между детекторами не калиброваны. В авторском примере для AltFreezing используется порог 0,04. [Код инференса](https://github.com/ZhendongWang6/AltFreezing/blob/f76b061717f534dd9b21dd932e6ec53540925a8d/demo.py)

## Установка

В корне Deepfake Demo выполните команды для macOS/Linux с Git, curl и Python 3.12. При уже установленном FTCN пропустите создание venv и установку зависимостей. Укажите в ALTFREEZING_PYTHON путь к его интерпретатору. Модели загружаются в отдельные процессы.

```sh
base="$HOME/.cache/deepfake-demo"
git clone https://github.com/ZhendongWang6/AltFreezing.git "$base/altfreezing"
git -C "$base/altfreezing" checkout f76b061717f534dd9b21dd932e6ec53540925a8d
python3.12 -m venv "$base/altfreezing-venv"
"$base/altfreezing-venv/bin/pip" install setuptools wheel
"$base/altfreezing-venv/bin/pip" install --no-build-isolation -r integrations/ftcn/requirements.txt
curl -fL https://media.githubusercontent.com/media/opencv/opencv_zoo/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet/face_detection_yunet_2023mar.onnx -o "$base/altfreezing/checkpoints/yunet.onnx"
```

Скачайте `model.pth` из ссылки авторов RecDrive или BaiduDrive, пароль `altf`. Положите его в `$base/altfreezing/checkpoints/model.pth`. Размер, возвращённый HTTPS API RecDrive, — 109 241 199 байт. SHA-256 `e93a6f7c0e0477db226c9063f94b0af86f0f4dffcf73ab0d87e17e4868db9197` вычислен локально по файлу из авторского хранилища. При старте проверяются обе контрольные суммы и полное соответствие ключей checkpoint архитектуре. [Ссылки авторов на веса](https://github.com/ZhendongWang6/AltFreezing/tree/f76b061717f534dd9b21dd932e6ec53540925a8d#inference)

```sh
export ALTFREEZING_PYTHON="$base/altfreezing-venv/bin/python"
"$ALTFREEZING_PYTHON" integrations/altfreezing/smoke.py "$base/altfreezing/examples/shining.mp4"
yarn start:altfreezing
```

На Windows создайте тот же кэш в профиле пользователя и используйте `Scripts/python.exe` из виртуального окружения. Переменная `ALTFREEZING_REPO` задаёт каталог авторского checkout вместе с подкаталогом `checkpoints`. Исходный код авторов распространяется по MIT, условия на веса в отдельном файле авторы не указали. Демка использует файлы только из локального кэша. [Лицензия кода](https://github.com/ZhendongWang6/AltFreezing/blob/f76b061717f534dd9b21dd932e6ec53540925a8d/LICENSE), [YuNet](https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet).
