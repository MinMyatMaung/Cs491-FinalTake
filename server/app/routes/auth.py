import hashlib
import re
import secrets
from datetime import datetime, timedelta

import requests
from flask import Blueprint, current_app, jsonify, request
from werkzeug.security import check_password_hash

from app.models import db
from app.models.user import PasswordHistory, User

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')

PASSWORD_BLOCKLIST = {
    'password',
    'password1',
    'password12',
    'password123',
    '12345678',
    '123456789',
    'qwerty123',
    'letmein123',
    'welcome123',
    'admin1234',
    'finaltake',
}

EMAIL_RE = re.compile(r'^[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})$', re.IGNORECASE)
PASSWORD_RE = re.compile(r'^(?=.{8,128}$)(?!\s)(?!.*\s$)[^\x00-\x1f\x7f]+$')
LOCKOUT_SECONDS = 10
MAX_FAILED_ATTEMPTS = 3


def _hash_secret(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def _normalize_email(email):
    return (email or '').strip().lower()


def _validate_email(email):
    match = EMAIL_RE.match(email)
    if not match:
        return 'Enter a valid email address'

    domain = match.group(1).lower()
    allowed_domains = current_app.config.get('EMAIL_PROVIDER_DOMAINS', set())
    if allowed_domains and domain not in allowed_domains:
        return 'Use an email from a supported provider'

    return None


def _validate_password(password):
    if not PASSWORD_RE.match(password or ''):
        return 'Password must be 8-128 characters with no leading/trailing spaces or control characters'

    lowered = password.lower()
    if lowered in PASSWORD_BLOCKLIST:
        return 'Choose a less common password'

    if lowered.startswith(('password', 'qwerty', 'admin', 'welcome')):
        return 'Choose a less predictable password'

    return None


def _password_was_used(user, password):
    if user.password_hash and check_password_hash(user.password_hash, password):
        return True

    history = PasswordHistory.query.filter_by(user_id=user.id).all()
    return any(check_password_hash(item.password_hash, password) for item in history)


def _save_password(user, password):
    user.set_password(password)
    db.session.flush()
    db.session.add(PasswordHistory(user_id=user.id, password_hash=user.password_hash))


def _generate_2fa_code(user):
    code = f'{secrets.randbelow(1_000_000):06d}'
    user.twofa_code_hash = _hash_secret(code)
    user.twofa_expires_at = datetime.utcnow() + timedelta(minutes=5)
    return code


def _is_locked(user):
    return user.locked_until and user.locked_until > datetime.utcnow()


def _remaining_lock_seconds(user):
    if not _is_locked(user):
        return 0
    return max(1, int((user.locked_until - datetime.utcnow()).total_seconds()))


def _record_failed_login(user):
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
        user.locked_until = datetime.utcnow() + timedelta(seconds=LOCKOUT_SECONDS)
        user.failed_login_attempts = 0
    db.session.commit()


def _clear_login_failures(user):
    user.failed_login_attempts = 0
    user.locked_until = None


def _unique_username(base):
    cleaned = re.sub(r'[^a-zA-Z0-9_]', '', base or '')[:40] or 'user'
    username = cleaned
    suffix = 1
    while User.query.filter_by(username=username).first():
        suffix += 1
        username = f'{cleaned[:35]}{suffix}'
    return username


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    email = _normalize_email(data.get('email'))
    username = (data.get('username') or '').strip()
    password = data.get('password', '')
    twofa_enabled = bool(data.get('twofa_enabled'))

    if not email or not username or not password:
        return jsonify({'error': 'Username, email, and password are required'}), 400

    email_error = _validate_email(email)
    if email_error:
        return jsonify({'error': email_error}), 400

    password_error = _validate_password(password)
    if password_error:
        return jsonify({'error': password_error}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 409

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already taken'}), 409

    user = User(username=username, email=email, twofa_enabled=twofa_enabled)
    db.session.add(user)
    _save_password(user, password)
    db.session.commit()

    return jsonify({'message': 'User created successfully', 'user': user.to_dict()}), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()

    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password are required'}), 400

    email = _normalize_email(data.get('email'))
    password = data.get('password', '')
    user = User.query.filter_by(email=email).first()

    if user and _is_locked(user):
        return jsonify({
            'error': f'Account locked. Try again in {_remaining_lock_seconds(user)} seconds.',
            'locked': True,
            'retry_after': _remaining_lock_seconds(user),
        }), 423

    if not user or not user.check_password(password):
        if user:
            _record_failed_login(user)
        return jsonify({'error': 'Invalid email or password'}), 401

    _clear_login_failures(user)

    if user.twofa_enabled:
        code = _generate_2fa_code(user)
        db.session.commit()
        return jsonify({
            'message': 'Two-factor verification required',
            'requires_2fa': True,
            'user_id': user.id,
            'demo_2fa_code': code,
        }), 202

    db.session.commit()
    return jsonify({'message': 'Login successful', 'user': user.to_dict()}), 200


@auth_bp.route('/verify-2fa', methods=['POST'])
def verify_2fa():
    data = request.get_json() or {}
    user = User.query.get(data.get('user_id'))
    code = (data.get('code') or '').strip()

    if not user or not code:
        return jsonify({'error': 'Verification code is required'}), 400

    if not user.twofa_code_hash or not user.twofa_expires_at:
        return jsonify({'error': 'No active verification code'}), 400

    if user.twofa_expires_at < datetime.utcnow():
        return jsonify({'error': 'Verification code expired'}), 400

    if not secrets.compare_digest(user.twofa_code_hash, _hash_secret(code)):
        return jsonify({'error': 'Invalid verification code'}), 401

    user.twofa_code_hash = None
    user.twofa_expires_at = None
    db.session.commit()

    return jsonify({'message': 'Login successful', 'user': user.to_dict()}), 200


@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json() or {}
    email = _normalize_email(data.get('email'))
    user = User.query.filter_by(email=email).first()

    response = {
        'message': 'If that email exists, reset instructions have been created.',
    }

    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token_hash = _hash_secret(token)
        user.reset_token_expires_at = datetime.utcnow() + timedelta(minutes=15)
        response['demo_reset_token'] = token
        response['demo_reset_url'] = f'/login?reset_token={token}&email={email}'

        if user.twofa_enabled:
            response['demo_2fa_code'] = _generate_2fa_code(user)

        db.session.commit()

    return jsonify(response), 200


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json() or {}
    email = _normalize_email(data.get('email'))
    token = data.get('token') or ''
    new_password = data.get('password') or ''
    code = (data.get('code') or '').strip()
    user = User.query.filter_by(email=email).first()

    if not user or not token:
        return jsonify({'error': 'Invalid or expired reset link'}), 400

    if not user.reset_token_hash or not user.reset_token_expires_at:
        return jsonify({'error': 'Invalid or expired reset link'}), 400

    if user.reset_token_expires_at < datetime.utcnow():
        return jsonify({'error': 'Invalid or expired reset link'}), 400

    if not secrets.compare_digest(user.reset_token_hash, _hash_secret(token)):
        return jsonify({'error': 'Invalid or expired reset link'}), 400

    if user.twofa_enabled:
        if not code or not user.twofa_code_hash or not user.twofa_expires_at:
            return jsonify({'error': 'Two-factor code is required'}), 400
        if user.twofa_expires_at < datetime.utcnow():
            return jsonify({'error': 'Two-factor code expired'}), 400
        if not secrets.compare_digest(user.twofa_code_hash, _hash_secret(code)):
            return jsonify({'error': 'Invalid two-factor code'}), 401

    password_error = _validate_password(new_password)
    if password_error:
        return jsonify({'error': password_error}), 400

    if _password_was_used(user, new_password):
        return jsonify({'error': 'Choose a password you have not used before'}), 400

    _save_password(user, new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    user.twofa_code_hash = None
    user.twofa_expires_at = None
    _clear_login_failures(user)
    db.session.commit()

    return jsonify({'message': 'Password reset successful'}), 200


@auth_bp.route('/google', methods=['POST'])
def google_login():
    data = request.get_json() or {}
    id_token = data.get('id_token')
    email = None
    name = None

    if id_token:
        try:
            res = requests.get(
                'https://oauth2.googleapis.com/tokeninfo',
                params={'id_token': id_token},
                timeout=5,
            )
            res.raise_for_status()
            claims = res.json()
        except requests.RequestException:
            return jsonify({'error': 'Unable to verify Google account'}), 401

        expected_audience = current_app.config.get('GOOGLE_CLIENT_ID')
        if expected_audience and claims.get('aud') != expected_audience:
            return jsonify({'error': 'Google token audience mismatch'}), 401
        if claims.get('email_verified') not in (True, 'true', 'True'):
            return jsonify({'error': 'Google email is not verified'}), 401

        email = _normalize_email(claims.get('email'))
        name = claims.get('name')
    elif current_app.config.get('GOOGLE_OAUTH_DEMO_ENABLED'):
        email = _normalize_email(data.get('email') or 'demo.google@gmail.com')
        name = data.get('name') or 'Google Demo User'
    else:
        return jsonify({'error': 'Google token is required'}), 400

    email_error = _validate_email(email)
    if email_error:
        return jsonify({'error': email_error}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        username_base = data.get('username') or name or email.split('@')[0]
        user = User(
            username=_unique_username(username_base),
            email=email,
            auth_provider='google',
        )
        user.set_password(secrets.token_urlsafe(32))
        db.session.add(user)
        db.session.commit()

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
