import base64
import hashlib
import io
import re
import secrets
from datetime import datetime, timedelta

import pyotp
import qrcode
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


def _normalize_security_answer(answer):
    return re.sub(r'\s+', ' ', (answer or '').strip().lower())


def _set_security_answer(user, question, answer):
    normalized_answer = _normalize_security_answer(answer)
    if not question or not normalized_answer:
        return 'Security question and answer are required'
    if len(question.strip()) < 8:
        return 'Security question must be at least 8 characters'
    if len(normalized_answer) < 2:
        return 'Security answer must be at least 2 characters'

    user.security_question = question.strip()
    user.security_answer_hash = _hash_secret(normalized_answer)
    return None


def _check_security_answer(user, answer):
    if not user.security_answer_hash:
        return False
    return secrets.compare_digest(
        user.security_answer_hash,
        _hash_secret(_normalize_security_answer(answer)),
    )


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


def _build_totp_setup(user):
    uri = pyotp.TOTP(user.totp_secret).provisioning_uri(
        name=user.email,
        issuer_name='FinalTake',
    )
    qr_image = qrcode.make(uri)
    buffer = io.BytesIO()
    qr_image.save(buffer, format='PNG')
    qr_data = base64.b64encode(buffer.getvalue()).decode('ascii')

    return {
        'otpauth_uri': uri,
        'qr_code_data_url': f'data:image/png;base64,{qr_data}',
        'manual_entry_key': user.totp_secret,
    }


def _verify_totp(user, code):
    if not user.totp_secret:
        return False
    return pyotp.TOTP(user.totp_secret).verify(code, valid_window=1)


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


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    email = _normalize_email(data.get('email'))
    username = (data.get('username') or '').strip()
    password = data.get('password', '')
    twofa_enabled = bool(data.get('twofa_enabled'))
    security_question = data.get('security_question', '')
    security_answer = data.get('security_answer', '')

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

    user = User(username=username, email=email, twofa_enabled=False)
    security_error = _set_security_answer(user, security_question, security_answer)
    if security_error:
        return jsonify({'error': security_error}), 400

    if twofa_enabled:
        user.totp_secret = pyotp.random_base32()

    db.session.add(user)
    _save_password(user, password)
    db.session.commit()

    response = {'message': 'User created successfully', 'user': user.to_dict()}
    if twofa_enabled:
        response.update({
            'message': 'Set up two-factor authentication',
            'requires_2fa_setup': True,
            'user_id': user.id,
            'twofa_setup': _build_totp_setup(user),
        })

    return jsonify(response), 201


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

    if user.totp_secret and not user.twofa_enabled:
        db.session.commit()
        return jsonify({
            'message': 'Set up two-factor authentication',
            'requires_2fa_setup': True,
            'user_id': user.id,
            'twofa_setup': _build_totp_setup(user),
        }), 202

    if user.twofa_enabled:
        if not user.totp_secret:
            user.totp_secret = pyotp.random_base32()
            user.twofa_enabled = False
            db.session.commit()
            return jsonify({
                'message': 'Set up two-factor authentication',
                'requires_2fa_setup': True,
                'user_id': user.id,
                'twofa_setup': _build_totp_setup(user),
            }), 202

        db.session.commit()
        return jsonify({
            'message': 'Two-factor verification required',
            'requires_2fa': True,
            'user_id': user.id,
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

    if not user.twofa_enabled:
        return jsonify({'error': 'Two-factor authentication is not enabled'}), 400

    if not _verify_totp(user, code):
        return jsonify({'error': 'Invalid verification code'}), 401

    db.session.commit()

    return jsonify({'message': 'Login successful', 'user': user.to_dict()}), 200


@auth_bp.route('/confirm-2fa', methods=['POST'])
def confirm_2fa():
    data = request.get_json() or {}
    user = User.query.get(data.get('user_id'))
    code = (data.get('code') or '').strip()

    if not user or not code:
        return jsonify({'error': 'Verification code is required'}), 400

    if not user.totp_secret:
        return jsonify({'error': 'No two-factor setup is pending'}), 400

    if not _verify_totp(user, code):
        return jsonify({'error': 'Invalid verification code'}), 401

    user.twofa_enabled = True
    db.session.commit()

    return jsonify({'message': 'Two-factor authentication enabled', 'user': user.to_dict()}), 200


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
        response['security_question'] = user.security_question

        db.session.commit()

    return jsonify(response), 200


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json() or {}
    email = _normalize_email(data.get('email'))
    token = data.get('token') or ''
    new_password = data.get('password') or ''
    code = (data.get('code') or '').strip()
    security_answer = data.get('security_answer') or ''
    user = User.query.filter_by(email=email).first()

    if not user or not token:
        return jsonify({'error': 'Invalid or expired reset link'}), 400

    if not user.reset_token_hash or not user.reset_token_expires_at:
        return jsonify({'error': 'Invalid or expired reset link'}), 400

    if user.reset_token_expires_at < datetime.utcnow():
        return jsonify({'error': 'Invalid or expired reset link'}), 400

    if not secrets.compare_digest(user.reset_token_hash, _hash_secret(token)):
        return jsonify({'error': 'Invalid or expired reset link'}), 400

    verified_with_totp = bool(code and user.twofa_enabled and _verify_totp(user, code))
    verified_with_security_answer = _check_security_answer(user, security_answer)
    if not verified_with_totp and not verified_with_security_answer:
        return jsonify({'error': 'Enter a valid authenticator code or security answer'}), 401

    password_error = _validate_password(new_password)
    if password_error:
        return jsonify({'error': password_error}), 400

    if _password_was_used(user, new_password):
        return jsonify({'error': 'Choose a password you have not used before'}), 400

    _save_password(user, new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    _clear_login_failures(user)
    db.session.commit()

    return jsonify({'message': 'Password reset successful'}), 200


@auth_bp.route('/change-password', methods=['POST'])
def change_password():
    data = request.get_json() or {}
    user_id = request.headers.get('X-User-Id')

    if not user_id:
        return jsonify({'error': 'Authentication required'}), 401

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    current_password = data.get('current_password') or ''
    new_password = data.get('new_password') or ''
    code = (data.get('code') or '').strip()
    security_answer = data.get('security_answer') or ''

    if not current_password or not new_password:
        return jsonify({'error': 'Current password and new password are required'}), 400

    if not user.check_password(current_password):
        return jsonify({'error': 'Current password is incorrect'}), 401

    password_error = _validate_password(new_password)
    if password_error:
        return jsonify({'error': password_error}), 400

    if _password_was_used(user, new_password):
        return jsonify({'error': 'Choose a password you have not used before'}), 400

    verified_with_totp = bool(code and user.twofa_enabled and _verify_totp(user, code))
    verified_with_security_answer = _check_security_answer(user, security_answer)
    if not verified_with_totp and not verified_with_security_answer:
        return jsonify({'error': 'Enter a valid authenticator code or security answer'}), 401

    _save_password(user, new_password)
    _clear_login_failures(user)
    db.session.commit()

    return jsonify({'message': 'Password changed successfully'}), 200


@auth_bp.route('/update-security-question', methods=['POST'])
def update_security_question():
    data = request.get_json() or {}
    user_id = request.headers.get('X-User-Id')

    if not user_id:
        return jsonify({'error': 'Authentication required'}), 401

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    current_password = data.get('current_password') or ''
    if not user.check_password(current_password):
        return jsonify({'error': 'Current password is incorrect'}), 401

    security_error = _set_security_answer(
        user,
        data.get('security_question', ''),
        data.get('security_answer', ''),
    )
    if security_error:
        return jsonify({'error': security_error}), 400

    db.session.commit()
    return jsonify({'message': 'Security question updated'}), 200


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
