DATABASE ?= ./data/miquest.sqlite3
PYTHON := backend/.venv/bin/python
.DEFAULT_GOAL := dev

.PHONY: setup migrate prefill dev test

setup:
	uv sync --project backend --locked --extra dev
	npm --prefix frontend ci

migrate:
	$(PYTHON) -m miquest.runtime migrate --database "$(DATABASE)"

prefill:
	$(PYTHON) -m miquest.runtime prefill --database "$(DATABASE)"

dev:
	$(PYTHON) scripts/dev.py "$(DATABASE)"

test:
	$(PYTHON) -m unittest discover -s scripts -p 'test_*.py'
	cd backend && .venv/bin/pytest
	npm --prefix frontend test
	npm --prefix frontend run test:e2e
