from django.conf import settings
from django.contrib.auth import login

from .services import get_development_admin


class DevelopmentAutoLoginMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if settings.DEV_AUTO_LOGIN:
            user = get_development_admin()
            if not request.user.is_authenticated or request.user.pk != user.pk:
                login(request, user)
        return self.get_response(request)
