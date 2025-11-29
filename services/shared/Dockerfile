# Shared module base image
FROM python:3.11-slim

WORKDIR /app

# Copy shared module
COPY shared/ /app/shared/

# Install shared dependencies
COPY shared/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Keep container running for shared module testing
CMD ["python", "-c", "print('Shared module ready')"]
