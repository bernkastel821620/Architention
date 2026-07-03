.PHONY: install install-api install-web dev dev-api dev-web test test-api test-web lint lint-api lint-web

install: install-api install-web

install-api:
	python -m pip install -r apps/api/requirements.txt

install-web:
	cd apps/web && npm install

dev:
	$(MAKE) -j2 dev-api dev-web

dev-api:
	python -m uvicorn app.main:app --app-dir apps/api --reload --host 127.0.0.1 --port 8000

dev-web:
	cd apps/web && npm run dev

test: test-api test-web

test-api:
	cd apps/api && python -m pytest

test-web:
	cd apps/web && npm run build

lint: lint-api lint-web

lint-api:
	python -m compileall apps/api/app

lint-web:
	cd apps/web && npm run lint

