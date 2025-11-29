# AI Service
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for image processing
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY ai/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared module
COPY shared /app/shared

# Copy service code
COPY ai/ .

# Expose port
EXPOSE 8005

# Run the service
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8005"]
