.PHONY: data encrypt test

data:
	python pipeline/export_json.py

encrypt:
	python pipeline/encrypt.py

test:
	python -m unittest discover pipeline/tests
