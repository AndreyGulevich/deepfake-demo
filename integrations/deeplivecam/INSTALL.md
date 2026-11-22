# Локальный сервис Deep-Live-Cam

Сервис использует отдельное окружение CPython 3.12 (64-bit), Git и компилятор C++. На macOS понадобится Xcode Command Line Tools, на Windows — Visual Studio Build Tools с компонентом Desktop development with C++, на Linux — C++ toolchain, заголовки Python и модуль venv. Это среда для процессора кадров. Интерфейс предоставляет демка, статус headless-процессора выводится в терминал. Для установки моделей см. [условия и источники](TERMS.md).

На macOS arm64 проверены чистая установка и подмена лица на синтетической фикстуре. На MacBook Air M5 поиск лица и замену выполняет Core ML. Исходные веса сохраняются, подготовленные графы кэшируются локально. При сбое инициализации используется CPU. Проверить выбранный режим можно по полю provider в /health. Для Windows x64 и Linux x86-64 проверено наличие колёс CPython 3.12 для перечисленных в requirements.txt библиотек, кроме собираемого из исходников InsightFace. Запуск на этих двух ОС требует проверки на соответствующей машине.

Запустите команды из корня Deepfake Demo. Создайте checkout и окружение один раз.

### macOS и Linux

```sh
export DLC_REPO="$HOME/.cache/deepfake-demo/Deep-Live-Cam"
git clone --filter=blob:none --no-checkout https://github.com/hacksider/Deep-Live-Cam.git "$DLC_REPO"
git -C "$DLC_REPO" sparse-checkout set modules
git -C "$DLC_REPO" checkout --detach 08896a51c9a6198f50dc9f7508acf39fc460c8f1
python3.12 -m venv "$DLC_REPO/venv"
. "$DLC_REPO/venv/bin/activate"
```

### Windows PowerShell

```powershell
$env:DLC_REPO = Join-Path $HOME '.cache/deepfake-demo/Deep-Live-Cam'
git clone --filter=blob:none --no-checkout https://github.com/hacksider/Deep-Live-Cam.git $env:DLC_REPO
git -C $env:DLC_REPO sparse-checkout set modules
git -C $env:DLC_REPO checkout --detach 08896a51c9a6198f50dc9f7508acf39fc460c8f1
py -3.12 -m venv "$env:DLC_REPO/venv"
& "$env:DLC_REPO/venv/Scripts/Activate.ps1"
```

### Установка и запуск из активированного окружения

```sh
python -m pip install pip==25.0.1 setuptools==84.2.1 wheel==0.48.0 Cython==3.3.1 numpy==2.2.6
python -m pip install --no-build-isolation -r integrations/deeplivecam/requirements.txt
python -m pip check
python integrations/deeplivecam/prepare_models.py --download
yarn start:deeplivecam
```

Ключ `--no-build-isolation` позволяет сборке InsightFace найти установленный NumPy и Cython. Команда загрузки весов предназначена для указанного в [условиях](TERMS.md) исследования. `DLC_MODELS` переопределяет каталог весов при запуске сервиса, а `DLC_PYTHON` — интерпретатор. По умолчанию используются подпапки пользовательского `.cache/deepfake-demo`. Проверка готовности доступна по `http://127.0.0.1:8766/health`. Параметр `ready` учитывает пробную замену, а `swappedFrames` считает обработанные входящие кадры с найденным лицом.
