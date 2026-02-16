FROM node:20-slim

# Install Python 3 + pip
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --break-system-packages -r requirements.txt

# Install Node dependencies + build frontend
COPY visualization/package*.json visualization/
RUN cd visualization && npm ci

COPY . .
RUN cd visualization && npm run build

# Railway provides PORT env var
EXPOSE 3001
ENV PYTHON_BIN=python3

CMD ["node", "visualization/server.js"]
