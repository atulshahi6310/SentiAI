import numpy as np
from flask import Flask, render_template, request
import tensorflow as tf
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.datasets import imdb
from tensorflow.keras.models import load_model
import os

parth = os.getcwd()
##model folder path
model_folder_path = os.path.join(parth, 'model')
model_path = os.path.join(model_folder_path, 'sample_rnn_imdb.h5')
# Load trained model
model = load_model(model_path)

# Load IMDB word index
word_index = imdb.get_word_index()

VOCAB_SIZE = 10000
# Load word index
word_index = imdb.get_word_index()

# Add offset
word_index = {k: (v + 3) for k, v in word_index.items()}
word_index["<PAD>"] = 0
word_index["<START>"] = 1
word_index["<UNK>"] = 2
word_index["<UNUSED>"] = 3


# Maximum review length (must match training)
max_len = 500

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')


VOCAB_SIZE = 10000  # must match training

def preprocess_text(text):
    words = text.lower().split()

    encoded_review = []
    for word in words:
        index = word_index.get(word, 2)  # unknown word = 2
        if index >= VOCAB_SIZE:
            index = 2
        
        encoded_review.append(index)

    padded_review = pad_sequences([encoded_review], maxlen=max_len)

    return padded_review


@app.route('/predict', methods=['POST'])
def predict():
    user_input = request.form['review']   # get input from HTML form

    processed_input = preprocess_text(user_input)
    prediction = model.predict(processed_input)

    score = float(prediction[0][0])
    sentiment = 'Positive 😊' if score > 0.5 else 'Negative 😞'

    return render_template(
        'index.html',
        review=user_input,
        sentiment=sentiment,
        score=round(score * 100, 2)
    )


if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)
