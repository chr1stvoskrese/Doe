# Doe — сборка и разработка (только macOS arm64)
#
#   make install      создать venv и поставить зависимости
#   make run          запустить в dev-режиме (python wrapper.py)
#   make build        собрать dist/Doe.app (PyInstaller)
#   make install-app  собрать и положить в /Applications/Doe.app
#   make check        дымовая проверка бэкенда (импорты, API, миграции)
#   make clean        удалить артефакты сборки

VENV      := venv
PY        := $(VENV)/bin/python3
APP       := dist/Doe.app
TARGET    := /Applications/Doe.app

.PHONY: help install run build install-app check clean

help:
	@echo "  install      создать venv и поставить зависимости"
	@echo "  run          dev-запуск (python wrapper.py)"
	@echo "  build        собрать $(APP)"
	@echo "  install-app  собрать и установить в $(TARGET)"
	@echo "  check        дымовая проверка бэкенда"
	@echo "  clean        удалить артефакты сборки"

install:
	python3 -m venv $(VENV)
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -r requirements.txt

run:
	$(PY) wrapper.py

build:
	$(PY) build.py

install-app: build
	rm -rf "$(TARGET)"
	ditto "$(APP)" "$(TARGET)"
	xattr -cr "$(TARGET)"
	open -R "$(TARGET)"
	@echo "✅ Установлено в $(TARGET)"

check:
	$(PY) -c "from main import app; print('app ok:', len(app.routes), 'routes')"
	$(PY) -m alembic heads
	$(PY) -c "from src.core.config import ALL_EXTENSION_KEYS; print('extensions:', ALL_EXTENSION_KEYS)"

clean:
	rm -rf build dist Doe.spec
	find . -name "__pycache__" -type d -prune -exec rm -rf {} +
