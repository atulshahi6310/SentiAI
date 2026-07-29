# SentiAI Docker Configuration
# Build: docker build -t sentiai .
# Run:   docker run -p 5000:5000 sentiai

FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir --upgrade -r requirements.txt

COPY . /app

EXPOSE 5000

CMD ["python", "app.py"]
