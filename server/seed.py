"""
Run this once after setting up the project to create a test user.
Usage: python seed.py
"""
from app import create_app, db
from app.models.user import User

app = create_app()

with app.app_context():
    db.create_all()

    if not User.query.filter_by(email='test@test.com').first():
        user = User(username='testuser', email='test@test.com')
        user.set_password('test-passphrase-2026')
        user.security_question = 'What is the test answer?'
        user.security_answer_hash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
        db.session.add(user)
        db.session.commit()
        print('Test user created: test@test.com / test-passphrase-2026')
    else:
        print('Test user already exists, skipping.')
