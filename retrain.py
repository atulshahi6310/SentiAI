import os
import sys
import numpy as np


import tensorflow as tf
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.datasets import imdb
from tensorflow.keras.models import load_model
from database import get_recent_jobs, get_job

def retrain():
    print("Fetching most recent job from database...")
    jobs = get_recent_jobs(1)
    if not jobs:
        print("No jobs found to train on.")
        return
        
    job_id = jobs[0]['id']
    job, rows = get_job(job_id)
    print(f"Loaded job {job_id} with {len(rows)} reviews.")
    
    if len(rows) == 0:
        print("No reviews to train on.")
        return

    # Load word index
    word_index = imdb.get_word_index()
    word_index = {k: (v + 3) for k, v in word_index.items()}
    word_index['<PAD>']    = 0
    word_index['<START>']  = 1
    word_index['<UNK>']    = 2
    word_index['<UNUSED>'] = 3
    
    VOCAB_SIZE = 10000
    MAX_LEN    = 500
    
    # Prepare data
    print("Preprocessing text...")
    encoded_reviews = []
    labels = []
    
    for r in rows:
        text = r['review_text'].lower().split()
        enc = [word_index.get(w, 2) if word_index.get(w, 2) < VOCAB_SIZE else 2 for w in text]
        encoded_reviews.append(enc)
        labels.append(1 if r['sentiment'] == 'Positive' else 0)
        
    X_train = pad_sequences(encoded_reviews, maxlen=MAX_LEN)
    y_train = np.array(labels)
    
    model_path = os.path.join(os.getcwd(), 'model', 'sample_rnn_imdb.h5')
    print(f"Loading model from {model_path}...")
    model = load_model(model_path)
    
    # Compile model for fine-tuning
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    
    print("Starting fine-tuning...")
    model.fit(X_train, y_train, epochs=3, batch_size=8, verbose=1)
    
    print("Saving fine-tuned model...")
    model.save(model_path)
    print("Done!")

if __name__ == '__main__':
    retrain()
