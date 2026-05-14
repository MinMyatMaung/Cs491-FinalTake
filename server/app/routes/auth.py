from flask import Blueprint, request, jsonify
from app.models import db
from app.models.user import User

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()

    if not data or not data.get('email') or not data.get('password') or not data.get('username'):
        return jsonify({'error': 'Username, email, and password are required'}), 400

    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already registered'}), 409

    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already taken'}), 409

    user = User(username=data['username'], email=data['email'])
    user.set_password(data['password'])

    db.session.add(user)
    db.session.commit()

    return jsonify({'message': 'User created successfully', 'user': user.to_dict()}), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()

    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password are required'}), 400

    user = User.query.filter_by(email=data['email']).first()

    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid email or password'}), 401

    return jsonify({'message': 'Login successful', 'user': user.to_dict()}), 200

@auth_bp.route('/update-username', methods=['POST'])
def update_username():
    data = request.get_json()
    user_id = request.headers.get('X-User-Id')

    if not user_id:
        return jsonify({'error': 'Authentication required'}), 401

    new_username = data.get('username', '').strip()
    if not new_username:
        return jsonify({'error': 'Username is required'}), 400

    if len(new_username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if User.query.filter_by(username=new_username).first():
        return jsonify({'error': 'Username already taken'}), 409

    user.username = new_username
    db.session.commit()

    return jsonify({'message': 'Username updated', 'user': user.to_dict()}), 200
