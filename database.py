import sqlite3
import os

DB_PATH = os.path.join(os.getcwd(), 'sentiai.db')

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS bulk_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            total_reviews INTEGER NOT NULL,
            positive_count INTEGER NOT NULL,
            negative_count INTEGER NOT NULL,
            avg_score REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS bulk_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            row_index INTEGER NOT NULL,
            review_text TEXT NOT NULL,
            sentiment TEXT NOT NULL,
            score REAL NOT NULL,
            FOREIGN KEY (job_id) REFERENCES bulk_jobs(id)
        )
    ''')
    
    # Try to add status column if it doesn't exist (for migration)
    try:
        c.execute("ALTER TABLE bulk_jobs ADD COLUMN status TEXT DEFAULT 'processing'")
    except sqlite3.OperationalError:
        pass
        
    conn.commit()
    conn.close()

def create_job_with_pending_reviews(filename, reviews):
    """Creates a job and inserts all reviews as Pending. Returns job_id."""
    total = len(reviews)
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        'INSERT INTO bulk_jobs (filename, total_reviews, positive_count, negative_count, avg_score, status) VALUES (?,?,?,?,?,?)',
        (filename, total, 0, 0, 0.0, 'processing')
    )
    job_id = c.lastrowid
    
    # Insert pending results
    pending_rows = []
    for i, text in enumerate(reviews):
        pending_rows.append((job_id, i, text[:2000], 'Pending', -1.0))
        
    c.executemany(
        'INSERT INTO bulk_results (job_id, row_index, review_text, sentiment, score) VALUES (?,?,?,?,?)',
        pending_rows
    )
    conn.commit()
    conn.close()
    return job_id

def update_chunk_results(job_id, results):
    """
    Updates the DB with processed results for a chunk.
    results is a list of dicts: {'row_index': int, 'sentiment': str, 'score': float}
    """
    conn = get_connection()
    c = conn.cursor()
    
    # Update individual rows
    update_data = []
    for r in results:
        update_data.append((r['sentiment'], round(r['score'], 4), job_id, r['row_index']))
        
    c.executemany(
        'UPDATE bulk_results SET sentiment=?, score=? WHERE job_id=? AND row_index=?',
        update_data
    )
    
    # Recalculate job aggregates
    c.execute("SELECT sentiment, score FROM bulk_results WHERE job_id=? AND sentiment != 'Pending'", (job_id,))
    processed_rows = c.fetchall()
    
    total_processed = len(processed_rows)
    if total_processed > 0:
        pos_count = sum(1 for r in processed_rows if r['sentiment'] == 'Positive')
        neg_count = total_processed - pos_count
        avg_score = sum(r['score'] for r in processed_rows) / total_processed
        
        c.execute(
            'UPDATE bulk_jobs SET positive_count=?, negative_count=?, avg_score=? WHERE id=?',
            (pos_count, neg_count, avg_score, job_id)
        )
        
    conn.commit()
    conn.close()

def mark_job_completed(job_id, status='completed'):
    conn = get_connection()
    conn.execute("UPDATE bulk_jobs SET status=? WHERE id=?", (status, job_id))
    conn.commit()
    conn.close()

def get_job(job_id):
    conn = get_connection()
    c = conn.cursor()
    job = c.execute('SELECT * FROM bulk_jobs WHERE id=?', (job_id,)).fetchone()
    rows = c.execute('SELECT * FROM bulk_results WHERE job_id=? ORDER BY row_index', (job_id,)).fetchall()
    conn.close()
    if job is None:
        return None, []
    return dict(job), [dict(r) for r in rows]

def get_job_updates(job_id, offset=0):
    """Returns job info and PROCESSED rows starting from `offset`."""
    conn = get_connection()
    c = conn.cursor()
    job = c.execute('SELECT * FROM bulk_jobs WHERE id=?', (job_id,)).fetchone()
    if job is None:
        conn.close()
        return None, []
        
    # Get processed rows strictly by row_index order
    rows = c.execute('''
        SELECT * FROM bulk_results 
        WHERE job_id=? AND sentiment != 'Pending' 
        ORDER BY row_index 
        LIMIT -1 OFFSET ?
    ''', (job_id, offset)).fetchall()
    
    conn.close()
    return dict(job), [dict(r) for r in rows]

def get_recent_jobs(limit=10):
    conn = get_connection()
    rows = conn.execute('SELECT * FROM bulk_jobs ORDER BY created_at DESC LIMIT ?', (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]
