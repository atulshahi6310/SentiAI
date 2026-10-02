import os
import sys
import io
import time
import json
import threading

# Ensure TensorFlow from dl-tf216 conda environment is accessible
tf_site_packages = r'C:\Users\Lenovo\anaconda3\envs\dl-tf216\Lib\site-packages'
if os.path.exists(tf_site_packages) and tf_site_packages not in sys.path:
    sys.path.append(tf_site_packages)

import numpy as np
from flask import Flask, render_template, request, jsonify, redirect, url_for, Response
import tensorflow as tf
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.datasets import imdb
from tensorflow.keras.models import load_model
import pandas as pd
from database import (
    init_db, create_job_with_pending_reviews, update_chunk_results,
    mark_job_completed, get_job, get_job_updates, get_recent_jobs
)

# ── Model setup ──────────────────────────────────────────────────────────────
parth = os.getcwd()
model_path = os.path.join(parth, 'model', 'sample_rnn_imdb.h5')
model = load_model(model_path)

word_index = imdb.get_word_index()
word_index = {k: (v + 3) for k, v in word_index.items()}
word_index['<PAD>']    = 0
word_index['<START>']  = 1
word_index['<UNK>']    = 2
word_index['<UNUSED>'] = 3

VOCAB_SIZE = 10000
MAX_LEN    = 500
CHUNK_SIZE = 2   # reviews per inference batch, specifically to prevent overwhelm

# ── Flask app ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB upload limit

# Initialise DB on startup
init_db()

# ── Helpers ───────────────────────────────────────────────────────────────────
def preprocess_text(text):
    words = text.lower().split()
    encoded = []
    for word in words:
        idx = word_index.get(word, 2)
        encoded.append(idx if idx < VOCAB_SIZE else 2)
    return pad_sequences([encoded], maxlen=MAX_LEN)


def run_inference(text):
    """Run model on a single review text. Returns (sentiment_str, score_float)."""
    processed = preprocess_text(text)
    score = float(model.predict(processed, verbose=0)[0][0])
    sentiment = 'Positive' if score > 0.5 else 'Negative'
    return sentiment, round(score * 100, 2)


def extract_reviews_from_file(file_storage):
    """
    Accepts a FileStorage object (CSV or XLS/XLSX).
    Returns a list of review strings.
    """
    filename = file_storage.filename.lower()
    raw = file_storage.read()
    if filename.endswith('.csv'):
        df = pd.read_csv(io.BytesIO(raw), encoding='utf-8', on_bad_lines='skip')
    elif filename.endswith(('.xls', '.xlsx')):
        df = pd.read_excel(io.BytesIO(raw))
    else:
        raise ValueError('Unsupported file type. Please upload a CSV or Excel (.xls/.xlsx) file.')

    if df.empty:
        raise ValueError('The uploaded file is empty.')

    text_col = None
    preferred = ['review', 'text', 'comment', 'feedback', 'description']
    for col in df.columns:
        if any(p in col.lower() for p in preferred):
            text_col = col
            break
    if text_col is None:
        for col in df.columns:
            if df[col].dtype == object:
                text_col = col
                break
    if text_col is None:
        raise ValueError('No text column found in the uploaded file.')

    reviews = df[text_col].dropna().astype(str).tolist()
    reviews = [r.strip() for r in reviews if r.strip()]
    if not reviews:
        raise ValueError('No valid review text found in the file.')
    return reviews


def process_job_async(job_id, reviews):
    """
    Runs in background thread to process reviews in chunks of CHUNK_SIZE.
    Uses model() instead of model.predict() for faster, thread-safe small batches.
    """
    for i in range(0, len(reviews), CHUNK_SIZE):
        chunk = reviews[i:i + CHUNK_SIZE]
        encoded = []
        for text in chunk:
            words = text.lower().split()
            enc = [word_index.get(w, 2) if word_index.get(w, 2) < VOCAB_SIZE else 2 for w in words]
            encoded.append(enc)
            
        padded = pad_sequences(encoded, maxlen=MAX_LEN)
        preds = model(padded, training=False).numpy()
        
        chunk_results = []
        for j, pred in enumerate(preds):
            score = float(pred[0])
            chunk_results.append({
                'row_index': i + j,
                'sentiment': 'Positive' if score > 0.5 else 'Negative',
                'score': round(score * 100, 2)
            })
            
        update_chunk_results(job_id, chunk_results)
        time.sleep(0.3)  # Gentle artificial delay for visual streaming flow and to ease CPU load
        
    mark_job_completed(job_id)


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/predict', methods=['POST'])
def predict():
    user_input = request.form.get('review', '').strip()
    if not user_input:
        return render_template('index.html')
    sentiment, score = run_inference(user_input)
    return render_template(
        'index.html',
        review=user_input,
        sentiment=sentiment,
        score=score
    )


@app.route('/bulk', methods=['POST'])
def bulk_upload():
    """Handle CSV/XLS file upload, create pending job, and start background processing."""
    if 'file' not in request.files:
        return render_template('index.html', bulk_error='No file provided.')

    f = request.files['file']
    if f.filename == '':
        return render_template('index.html', bulk_error='No file selected.')

    try:
        reviews = extract_reviews_from_file(f)
    except ValueError as e:
        return render_template('index.html', bulk_error=str(e))

    # Create job with pending status
    job_id = create_job_with_pending_reviews(f.filename, reviews)
    
    # Start inference loop in background thread
    threading.Thread(target=process_job_async, args=(job_id, reviews)).start()
    
    return redirect(url_for('bulk_result', job_id=job_id))


@app.route('/bulk/result/<int:job_id>')
def bulk_result(job_id):
    """Display results for a bulk job. Page connects to SSE stream to auto-update."""
    job, rows = get_job(job_id)
    if job is None:
        return render_template('index.html', bulk_error='Job not found.'), 404
    return render_template('bulk_result.html', job=job, rows=rows)


@app.route('/api/job/<int:job_id>')
def api_job(job_id):
    job, rows = get_job(job_id)
    if job is None:
        return jsonify({'error': 'Not found'}), 404
    return jsonify({'job': job, 'results': rows})


@app.route('/api/job/<int:job_id>/stream')
def stream_job(job_id):
    """Server-Sent Events endpoint that yields processed rows chunk by chunk."""
    def generate():
        last_processed = 0
        while True:
            job, new_rows = get_job_updates(job_id, last_processed)
            if not job:
                break
                
            if new_rows or job['status'] in ('completed', 'failed'):
                data = {
                    "status": job['status'],
                    "total": job['total_reviews'],
                    "processed": last_processed + len(new_rows),
                    "positive": job['positive_count'],
                    "negative": job['negative_count'],
                    "avg_score": job['avg_score'],
                    "new_results": new_rows
                }
                yield f"data: {json.dumps(data)}\n\n"
                last_processed += len(new_rows)
                
            if job['status'] in ('completed', 'failed'):
                yield "event: complete\ndata: {}\n\n"
                break
                
            time.sleep(0.4)
            
    return Response(generate(), mimetype='text/event-stream')


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
