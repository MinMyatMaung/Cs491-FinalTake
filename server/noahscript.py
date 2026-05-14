"""
Generate demo users, reviews, and favorites for FinalTake.

Usage:
    cd server
    python noahscript.py
"""
from datetime import datetime, timedelta
import random

from app import create_app, db
from app.models.favorite import Favorite
from app.models.review import Review
from app.models.user import PasswordHistory, User


PASSWORD = 'demo-passphrase-2026'
SECURITY_QUESTION = 'What city were you born in?'
SECURITY_ANSWER_HASH = '339eb5382745f10671c18a4f5fb58af8ec6fd76018eebd7e4977b1985b0972a5'

USERS = [
    ('noah', 'noah.demo@gmail.com'),
    ('mia', 'mia.demo@gmail.com'),
    ('liam', 'liam.demo@gmail.com'),
    ('ava', 'ava.demo@gmail.com'),
    ('ethan', 'ethan.demo@gmail.com'),
    ('sophia', 'sophia.demo@gmail.com'),
    ('lucas', 'lucas.demo@gmail.com'),
    ('isabella', 'isabella.demo@gmail.com'),
    ('mason', 'mason.demo@gmail.com'),
    ('olivia', 'olivia.demo@gmail.com'),
]

MEDIA = [
    {
        'media_id': '27205',
        'media_type': 'movie',
        'title': 'Inception',
        'image_url': 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
        'rating': 4.2,
    },
    {
        'media_id': '155',
        'media_type': 'movie',
        'title': 'The Dark Knight',
        'image_url': 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
        'rating': 4.5,
    },
    {
        'media_id': '1399',
        'media_type': 'tv',
        'title': 'Game of Thrones',
        'image_url': 'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg',
        'rating': 4.1,
    },
    {
        'media_id': '66732',
        'media_type': 'tv',
        'title': 'Stranger Things',
        'image_url': 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
        'rating': 4.0,
    },
    {
        'media_id': '3498',
        'media_type': 'game',
        'title': 'Grand Theft Auto V',
        'image_url': 'https://media.rawg.io/media/games/456/456dea5e1c7e3cd07060c14e96612001.jpg',
        'rating': 4.4,
    },
    {
        'media_id': '3328',
        'media_type': 'game',
        'title': 'The Witcher 3: Wild Hunt',
        'image_url': 'https://media.rawg.io/media/games/618/618c2031a07bbff6b4f611f10b6bcdbc.jpg',
        'rating': 4.7,
    },
    {
        'media_id': 'zyTCAlFPjgYC',
        'media_type': 'book',
        'title': 'The Hunger Games',
        'image_url': 'http://books.google.com/books/content?id=zyTCAlFPjgYC&printsec=frontcover&img=1&zoom=1',
        'rating': 4.1,
    },
    {
        'media_id': 'wrOQLV6xB-wC',
        'media_type': 'book',
        'title': 'Harry Potter and the Sorcerer\'s Stone',
        'image_url': 'http://books.google.com/books/content?id=wrOQLV6xB-wC&printsec=frontcover&img=1&zoom=1',
        'rating': 4.6,
    },
]

REVIEW_BODIES = [
    'Still holds up and makes for an easy recommendation.',
    'The pacing worked better than expected.',
    'Great moments, even if a few parts dragged.',
    'I understand the hype after revisiting it.',
    'Strong cast, memorable scenes, and a satisfying finish.',
    'Not perfect, but definitely worth the time.',
    'The world-building is the best part.',
    'A solid pick when you want something familiar but still engaging.',
]


def ensure_user(username, email):
    user = User.query.filter_by(email=email).first()
    if user:
        return user, False

    user = User(
        username=username,
        email=email,
        security_question=SECURITY_QUESTION,
        security_answer_hash=SECURITY_ANSWER_HASH,
    )
    user.set_password(PASSWORD)
    db.session.add(user)
    db.session.flush()
    db.session.add(PasswordHistory(user_id=user.id, password_hash=user.password_hash))
    return user, True


def ensure_review(user, media, rating, body, created_at):
    review = Review.query.filter_by(
        user_id=user.id,
        media_id=str(media['media_id']),
        media_type=media['media_type'],
    ).first()
    if review:
        return False

    db.session.add(Review(
        user_id=user.id,
        media_id=str(media['media_id']),
        media_type=media['media_type'],
        title=media['title'],
        image_url=media['image_url'],
        rating=rating,
        body=body,
        created_at=created_at,
    ))
    return True


def ensure_favorite(user, media, created_at):
    favorite = Favorite.query.filter_by(
        user_id=user.id,
        media_id=str(media['media_id']),
        media_type=media['media_type'],
    ).first()
    if favorite:
        return False

    db.session.add(Favorite(
        user_id=user.id,
        media_id=str(media['media_id']),
        media_type=media['media_type'],
        title=media['title'],
        image_url=media['image_url'],
        rating=media['rating'],
        created_at=created_at,
    ))
    return True


def main():
    random.seed(491)
    app = create_app()

    with app.app_context():
        db.create_all()

        users_created = 0
        reviews_created = 0
        favorites_created = 0
        base_date = datetime.utcnow() - timedelta(days=30)

        for index, (username, email) in enumerate(USERS):
            user, created = ensure_user(username, email)
            users_created += int(created)

            picks = random.sample(MEDIA, k=5)
            favorite_picks = random.sample(picks, k=3)

            for media_index, media in enumerate(picks):
                created_at = base_date + timedelta(days=index * 2 + media_index)
                rating = random.randint(3, 5)
                body = random.choice(REVIEW_BODIES)
                reviews_created += int(ensure_review(user, media, rating, body, created_at))

            for media_index, media in enumerate(favorite_picks):
                created_at = base_date + timedelta(days=index * 2 + media_index, hours=6)
                favorites_created += int(ensure_favorite(user, media, created_at))

        db.session.commit()

        print('Demo data ready.')
        print(f'Users created: {users_created}')
        print(f'Reviews created: {reviews_created}')
        print(f'Favorites created: {favorites_created}')
        print(f'Demo password for all generated users: {PASSWORD}')
        print('Demo security answer for all generated users: fullerton')


if __name__ == '__main__':
    main()
