# Equipment Service
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for QR code generation
RUN apt-get update && apt-get install -y \
    libzbar0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY equipment/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared module
COPY shared /app/shared

# Copy service code
COPY equipment/ .

# Expose port
EXPOSE 8002

# Run the service
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
