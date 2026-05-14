from flask import Blueprint, request, jsonify
from sqlalchemy.orm import joinedload
from app.models import db
from app.models.review import Review
from app.models.user import User

reviews_bp = Blueprint('reviews', __name__, url_prefix='/api/reviews')


def _get_user(request):
    """Extract user from X-User-Id header."""
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return None, jsonify({'error': 'Authentication required'}), 401
    user = db.session.get(User, user_id)
    if not user:
        return None, jsonify({'error': 'User not found'}), 404
    return user, None, None


@reviews_bp.route('', methods=['GET'])
def get_reviews():
    """Return all reviews for a specific media item (public)."""
    media_type = request.args.get('media_type')
    media_id = request.args.get('media_id')
    if not media_type or not media_id:
        return jsonify({'error': 'media_type and media_id query params are required'}), 400

    reviews = (
        Review.query
        .options(joinedload(Review.user))
        .filter_by(media_type=media_type, media_id=media_id)
        .order_by(Review.created_at.desc())
        .all()
    )
    return jsonify({'reviews': [r.to_dict(include_username=True) for r in reviews]}), 200


@reviews_bp.route('/mine', methods=['GET'])
def get_my_reviews():
    """Return all reviews written by the authenticated user."""
    user, err_response, status = _get_user(request)
    if err_response:
        return err_response, status

    reviews = (
        Review.query
        .options(joinedload(Review.user))
        .filter_by(user_id=user.id)
        .order_by(Review.created_at.desc())
        .all()
    )
    return jsonify({'reviews': [r.to_dict() for r in reviews]}), 200


@reviews_bp.route('/check/<string:media_type>/<string:media_id>', methods=['GET'])
def check_review(media_type, media_id):
    """Check whether the current user has already reviewed a media item."""
    user, err_response, status = _get_user(request)
    if err_response:
        return err_response, status

    review = Review.query.filter_by(
        user_id=user.id, media_id=media_id, media_type=media_type
    ).first()
    return jsonify({'review': review.to_dict() if review else None}), 200


@reviews_bp.route('', methods=['POST'])
def create_review():
    """Create or update a review for a media item."""
    user, err_response, status = _get_user(request)
    if err_response:
        return err_response, status

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    media_id = data.get('media_id')
    media_type = data.get('media_type')
    rating = data.get('rating')
    title = data.get('title', '')

    if not media_id or not media_type or rating is None:
        return jsonify({'error': 'media_id, media_type, and rating are required'}), 400

    if not isinstance(rating, int) or not (1 <= rating <= 5):
        return jsonify({'error': 'rating must be an integer between 1 and 5'}), 400

    # Upsert: update existing review if one already exists
    existing = Review.query.filter_by(
        user_id=user.id, media_id=str(media_id), media_type=media_type
    ).first()

    if existing:
        existing.rating = rating
        existing.body = data.get('body', existing.body)
        existing.title = title or existing.title
        existing.image_url = data.get('image_url', existing.image_url)
        db.session.commit()
        return jsonify({'review': existing.to_dict(include_username=True), 'message': 'Review updated'}), 200

    review = Review(
        user_id=user.id,
        media_id=str(media_id),
        media_type=media_type,
        title=title,
        image_url=data.get('image_url'),
        rating=rating,
        body=data.get('body'),
    )
    db.session.add(review)
    db.session.commit()
    return jsonify({'review': review.to_dict(include_username=True), 'message': 'Review created'}), 201


@reviews_bp.route('/<int:review_id>', methods=['DELETE'])
def delete_review(review_id):
    """Delete a review (owner only)."""
    user, err_response, status = _get_user(request)
    if err_response:
        return err_response, status

    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404
    if review.user_id != user.id:
        return jsonify({'error': 'Forbidden'}), 403

    db.session.delete(review)
    db.session.commit()
    return jsonify({'message': 'Review deleted'}), 200
