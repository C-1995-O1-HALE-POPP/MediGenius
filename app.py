from flask import Flask
from flask import render_template
from flask import request
from flask import jsonify
from flask import session
import os
import uuid
import secrets
import sqlite3
from datetime import datetime
from dotenv import load_dotenv

from core.langgraph_workflow import create_workflow
from core.state import initialize_conversation_state
from core.state import reset_query_state
from tools.pdf_loader import process_pdf
from tools.vector_store import get_or_create_vectorstore

load_dotenv()

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)

# Global workflow and conversation states
workflow_app = None
conversation_states = {}

# SQLite Database Setup
DB_PATH = './chat_db/medigenius_chats.db'

def init_db():
    """Initialize SQLite database with required tables"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create sessions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create messages table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            source TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions (session_id)
        )
    ''')
    
    conn.commit()
    conn.close()

def save_message(session_id, role, content, source=None):
    """Save a message to the database"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Ensure session exists
    cursor.execute('''
        INSERT OR IGNORE INTO sessions (session_id) VALUES (?)
    ''', (session_id,))
    
    # Update last active time
    cursor.execute('''
        UPDATE sessions SET last_active = CURRENT_TIMESTAMP WHERE session_id = ?
    ''', (session_id,))
    
    # Insert message
    cursor.execute('''
        INSERT INTO messages (session_id, role, content, source)
        VALUES (?, ?, ?, ?)
    ''', (session_id, role, content, source))
    
    conn.commit()
    conn.close()

def get_chat_history(session_id):
    """Retrieve chat history for a session"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT role, content, source, timestamp
        FROM messages
        WHERE session_id = ?
        ORDER BY timestamp ASC
    ''', (session_id,))
    
    messages = []
    for row in cursor.fetchall():
        messages.append({
            'role': row[0],
            'content': row[1],
            'source': row[2],
            'timestamp': row[3]
        })
    
    conn.close()
    return messages

def get_all_sessions():
    """Get all chat sessions"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT s.session_id, s.created_at, s.last_active, 
               (SELECT content FROM messages WHERE session_id = s.session_id 
                AND role = 'user' ORDER BY timestamp ASC LIMIT 1) as first_message
        FROM sessions s
        ORDER BY s.last_active DESC
    ''')
    
    sessions = []
    for row in cursor.fetchall():
        sessions.append({
            'session_id': row[0],
            'created_at': row[1],
            'last_active': row[2],
            'preview': row[3][:50] + '...' if row[3] and len(row[3]) > 50 else row[3]
        })
    
    conn.close()
    return sessions

def delete_session(session_id):
    """Delete a chat session and its messages"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM messages WHERE session_id = ?', (session_id,))
    cursor.execute('DELETE FROM sessions WHERE session_id = ?', (session_id,))
    
    conn.commit()
    conn.close()

def initialize_system():
    global workflow_app
    
    pdf_path = './data/medical_book.pdf'
    persist_dir = './medical_db/'
    
    print("Initializing MediGenius System...")
    
    # Initialize database
    init_db()
    print("Database initialized...")
    
    # Try to load existing database
    existing_db = get_or_create_vectorstore(persist_dir=persist_dir)
    
    if not existing_db and os.path.exists(pdf_path):
        print("Creating vector database from PDF...")
        doc_splits = process_pdf(pdf_path)
        get_or_create_vectorstore(documents=doc_splits, persist_dir=persist_dir)
    elif not existing_db:
        print("No vector database and no PDF found - RAG features will be limited")
    
    workflow_app = create_workflow()
    print("MediGenius Web Interface Ready!")

@app.route('/')
def index():
    if 'session_id' not in session:
        session['session_id'] = str(uuid.uuid4())
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    global workflow_app, conversation_states
    
    data = request.json
    message = data.get('message', '')
    session_id = session.get('session_id')
    
    if not message:
        return jsonify({'error': 'No message provided'}), 400
    
    if not workflow_app:
        return jsonify({'error': 'System not initialized'}), 500
    
    # Save user message to database
    save_message(session_id, 'user', message)
    
    # Initialize or get conversation state
    if session_id not in conversation_states:
        conversation_states[session_id] = initialize_conversation_state()
    
    conversation_state = conversation_states[session_id]
    conversation_state = reset_query_state(conversation_state)
    conversation_state["question"] = message
    
    # Process query through workflow
    result = workflow_app.invoke(conversation_state)
    conversation_states[session_id].update(result)
    
    # Get current timestamp
    timestamp = datetime.now().strftime("%I:%M %p")
    
    # Extract response and source
    response = result.get('generation', 'Unable to generate response.')
    source = result.get('source', 'Unknown')
    
    # Save assistant response to database
    save_message(session_id, 'assistant', response, source)
    
    return jsonify({
        'response': response,
        'source': source,
        'timestamp': timestamp,
        'success': bool(result.get('generation'))
    })

@app.route('/api/history', methods=['GET'])
def get_history():
    """Get chat history for current session"""
    session_id = session.get('session_id')
    if not session_id:
        return jsonify({'messages': []})
    
    messages = get_chat_history(session_id)
    return jsonify({'messages': messages, 'success': True})

@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    """Get all chat sessions"""
    sessions = get_all_sessions()
    return jsonify({'sessions': sessions, 'success': True})

@app.route('/api/session/<session_id>', methods=['GET'])
def load_session(session_id):
    """Load a specific chat session"""
    session['session_id'] = session_id
    messages = get_chat_history(session_id)
    return jsonify({
        'messages': messages,
        'session_id': session_id,
        'success': True
    })

@app.route('/api/session/<session_id>', methods=['DELETE'])
def delete_chat_session(session_id):
    """Delete a chat session"""
    delete_session(session_id)
    
    # If current session was deleted, create new one
    if session.get('session_id') == session_id:
        session['session_id'] = str(uuid.uuid4())
    
    return jsonify({'message': 'Session deleted', 'success': True})

@app.route('/api/clear', methods=['POST'])
def clear():
    """Clear current conversation (in memory only, doesn't delete from DB)"""
    session_id = session.get('session_id')
    if session_id in conversation_states:
        conversation_states[session_id] = initialize_conversation_state()
    return jsonify({'message': 'Conversation cleared', 'success': True})

@app.route('/api/new-chat', methods=['POST'])
def new_chat():
    """Create a new chat session"""
    new_session_id = str(uuid.uuid4())
    session['session_id'] = new_session_id
    return jsonify({
        'message': 'New chat created',
        'session_id': new_session_id,
        'success': True
    })

@app.route('/api/health')
def health():
    return jsonify({'status': 'healthy', 'service': 'MediGenius'})

if __name__ == '__main__':
    initialize_system()
    app.run(debug=True, port=5000)