FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir requests

COPY simulator.py .

# Retry loop: wait for the ingestion service before starting
CMD ["python", "-u", "simulator.py"]
