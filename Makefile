.PHONY: data validate import-legacy encrypt test

data:
	python pipeline/export_json.py

validate:
	python pipeline/validate.py

import-legacy:
	python pipeline/import_legacy.py

encrypt:
	python pipeline/encrypt.py

test:
	python -m unittest discover pipeline/tests
