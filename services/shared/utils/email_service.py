"""
Email Service - Stub for email functionality
"""

import logging

logger = logging.getLogger(__name__)


class EmailService:
    """Email service for sending notifications"""
    
    def __init__(self):
        self.configured = False
    
    async def send_email(self, to: str, subject: str, body: str, html: bool = False):
        """Send email (stub implementation)"""
        logger.info(f"Email would be sent to: {to}, subject: {subject}")
        return True
    
    async def send_template_email(self, to: str, template: str, context: dict):
        """Send templated email (stub implementation)"""
        logger.info(f"Template email would be sent to: {to}, template: {template}")
        return True


# Singleton instance
email_service = EmailService()
