.PHONY: site site-data test ingest etl features train price stream replay dashboard pipeline all

PYTHON ?= python
PYTHONPATH ?= src

all: pipeline

help:
	@echo "Available targets: ingest etl features train price stream replay dashboard pipeline test all"

ingest:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m dpa.ingest.xlsx_to_parquet

etl:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m dpa.etl.clean

features:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m dpa.features.build

train:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m dpa.models.forecast

price:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m dpa.pricing.recommend

stream:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m dpa.streaming.stream_job

replay:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m dpa.streaming.replay

dashboard:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m streamlit run dashboard/app.py

test:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m pytest -q

pipeline: test
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m dpa.pipeline

site-data:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m dpa.site_data

site: site-data
	@echo "Dashboard: http://localhost:8000/index.html"
	$(PYTHON) -m http.server 8000 --directory site
