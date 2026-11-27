from .base import *

DEBUG = True
ALLOWED_HOSTS = ["*"]

# `manage.py runserver` serves WebSockets (real-time co-editing) when daphne comes first.
INSTALLED_APPS = ["daphne", *INSTALLED_APPS]

if DEV_AUTO_LOGIN:
    _auth_index = MIDDLEWARE.index("django.contrib.auth.middleware.AuthenticationMiddleware") + 1
    MIDDLEWARE = [
        *MIDDLEWARE[:_auth_index],
        "apps.accounts.middleware.DevelopmentAutoLoginMiddleware",
        *MIDDLEWARE[_auth_index:],
    ]
