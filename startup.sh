#!/bin/bash
set -e

python -m gunicorn -w 2 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:${PORT:-8000} api.main:app
