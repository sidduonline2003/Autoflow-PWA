"""
Email notification utilities for AR module
"""
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition, Email
import os
import base64
from jinja2 import Template
from datetime import datetime
import pytz
from typing import Optional

class EmailService:
    def __init__(self):
        self.sendgrid_api_key = os.getenv('SENDGRID_API_KEY')
        self.from_email = os.getenv('FROM_EMAIL', 'noreply@autostudioflow.com')
        self.sg = SendGridAPIClient(api_key=self.sendgrid_api_key) if self.sendgrid_api_key else None

    def format_currency(self, amount, currency='INR'):
        """Format currency amount"""
        if currency == 'INR':
            return f"₹{amount:,.2f}"
        elif currency == 'USD':
            return f"${amount:,.2f}"
        elif currency == 'EUR':
            return f"€{amount:,.2f}"
        else:
            return f"{currency} {amount:,.2f}"

    def format_date(self, date_str):
        """Format date for display"""
        try:
            if isinstance(date_str, str):
                date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            else:
                date_obj = date_str
            
            # Convert to IST
            ist = pytz.timezone('Asia/Kolkata')
            if date_obj.tzinfo is None:
                date_obj = pytz.utc.localize(date_obj)
            date_obj = date_obj.astimezone(ist)
            
            return date_obj.strftime('%d %B %Y')
        except:
            return str(date_str)

    def send_invoice_email(self, invoice_data, client_data, pdf_buffer=None, org_data=None):
        """Send invoice via email"""
        if not self.sg:
            print("SendGrid not configured. Email not sent.")
            return False

        client_email = client_data.get('profile', {}).get('email')
        if not client_email:
            print("Client email not found. Email not sent.")
            return False

        # Email template
        template = Template("""
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; }
                .invoice-details { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .footer { background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; }
                .button { display: inline-block; padding: 10px 20px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>{{ org_name }}</h1>
                <h2>Invoice {{ invoice_number }}</h2>
            </div>
            
            <div class="content">
                <p>Dear {{ client_name }},</p>
                
                <p>Please find attached your invoice for the services provided. Here are the details:</p>
                
                <div class="invoice-details">
                    <strong>Invoice #:</strong> {{ invoice_number }}<br>
                    <strong>Issue Date:</strong> {{ issue_date }}<br>
                    <strong>Due Date:</strong> {{ due_date }}<br>
                    <strong>Amount:</strong> {{ amount }}<br>
                    {% if amount_due != amount %}
                    <strong>Amount Due:</strong> {{ amount_due }}<br>
                    {% endif %}
                </div>
                
                {% if notes %}
                <p><strong>Notes:</strong></p>
                <p>{{ notes }}</p>
                {% endif %}
                
                <p>Please ensure payment is made by the due date. If you have any questions about this invoice, please don't hesitate to contact us.</p>
                
                <p>Thank you for your business!</p>
                
                <p>Best regards,<br>
                {{ org_name }} Team</p>
            </div>
            
            <div class="footer">
                <p>This is an automated email. Please do not reply to this email.</p>
                <p>Generated on {{ generated_at }}</p>
            </div>
        </body>
        </html>
        """)

        # Prepare template data
        org_name = org_data.get('name', 'AUTOSTUDIOFLOW') if org_data else 'AUTOSTUDIOFLOW'
        template_data = {
            'org_name': org_name,
            'client_name': client_data.get('profile', {}).get('name', 'Valued Client'),
            'invoice_number': invoice_data.get('number', 'DRAFT'),
            'issue_date': self.format_date(invoice_data.get('issueDate')),
            'due_date': self.format_date(invoice_data.get('dueDate')),
            'amount': self.format_currency(invoice_data.get('totals', {}).get('grandTotal', 0), invoice_data.get('currency', 'INR')),
            'amount_due': self.format_currency(invoice_data.get('totals', {}).get('amountDue', 0), invoice_data.get('currency', 'INR')),
            'notes': invoice_data.get('notes', ''),
            'generated_at': datetime.now(pytz.timezone('Asia/Kolkata')).strftime('%d %B %Y at %I:%M %p IST')
        }

        # Create email
        subject = f"Invoice {invoice_data.get('number', '')} from {org_name}"
        html_content = template.render(**template_data)
        
        message = Mail(
            from_email=self.from_email,
            to_emails=client_email,
            subject=subject,
            html_content=html_content
        )

        # Attach PDF if provided
        if pdf_buffer:
            pdf_buffer.seek(0)
            encoded_file = base64.b64encode(pdf_buffer.read()).decode()
            
            attachment = Attachment(
                FileContent(encoded_file),
                FileName(f"Invoice-{invoice_data.get('number', 'DRAFT')}.pdf"),
                FileType("application/pdf"),
                Disposition("attachment")
            )
            message.attachment = attachment

        try:
            response = self.sg.send(message)
            print(f"Email sent successfully. Status code: {response.status_code}")
            return True
        except Exception as e:
            print(f"Error sending email: {str(e)}")
            return False

    def send_quote_email(self, quote_data, client_data, pdf_buffer=None, org_data=None):
        """Send quote via email"""
        if not self.sg:
            print("SendGrid not configured. Email not sent.")
            return False

        client_email = client_data.get('profile', {}).get('email')
        if not client_email:
            print("Client email not found. Email not sent.")
            return False

        # Email template
        template = Template("""
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; }
                .quote-details { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .footer { background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; }
                .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; }
                .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 5px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>{{ org_name }}</h1>
                <h2>Quotation {{ quote_number }}</h2>
            </div>
            
            <div class="content">
                <p>Dear {{ client_name }},</p>
                
                <p>Thank you for your interest in our services. Please find attached our detailed quotation.</p>
                
                <div class="quote-details">
                    <strong>Quote #:</strong> {{ quote_number }}<br>
                    <strong>Issue Date:</strong> {{ issue_date }}<br>
                    <strong>Valid Until:</strong> {{ valid_until }}<br>
                    <strong>Total Amount:</strong> {{ amount }}<br>
                </div>
                
                <div class="warning">
                    <strong>⏰ Important:</strong> This quotation is valid until {{ valid_until }}. Please respond before the expiry date to secure these prices.
                </div>
                
                {% if notes %}
                <p><strong>Additional Information:</strong></p>
                <p>{{ notes }}</p>
                {% endif %}
                
                <p>We look forward to working with you. If you have any questions or would like to proceed with this quotation, please don't hesitate to contact us.</p>
                
                <p>Best regards,<br>
                {{ org_name }} Team</p>
            </div>
            
            <div class="footer">
                <p>This is an automated email. Please do not reply to this email.</p>
                <p>Generated on {{ generated_at }}</p>
            </div>
        </body>
        </html>
        """)

        # Prepare template data
        org_name = org_data.get('name', 'AUTOSTUDIOFLOW') if org_data else 'AUTOSTUDIOFLOW'
        template_data = {
            'org_name': org_name,
            'client_name': client_data.get('profile', {}).get('name', 'Valued Client'),
            'quote_number': quote_data.get('number', 'DRAFT'),
            'issue_date': self.format_date(quote_data.get('issueDate')),
            'valid_until': self.format_date(quote_data.get('validUntil')),
            'amount': self.format_currency(quote_data.get('totals', {}).get('grandTotal', 0), quote_data.get('currency', 'INR')),
            'notes': quote_data.get('notes', ''),
            'generated_at': datetime.now(pytz.timezone('Asia/Kolkata')).strftime('%d %B %Y at %I:%M %p IST')
        }

        # Create email
        subject = f"Quotation {quote_data.get('number', '')} from {org_name}"
        html_content = template.render(**template_data)
        
        message = Mail(
            from_email=self.from_email,
            to_emails=client_email,
            subject=subject,
            html_content=html_content
        )

        # Attach PDF if provided
        if pdf_buffer:
            pdf_buffer.seek(0)
            encoded_file = base64.b64encode(pdf_buffer.read()).decode()
            
            attachment = Attachment(
                FileContent(encoded_file),
                FileName(f"Quote-{quote_data.get('number', 'DRAFT')}.pdf"),
                FileType("application/pdf"),
                Disposition("attachment")
            )
            message.attachment = attachment

        try:
            response = self.sg.send(message)
            print(f"Email sent successfully. Status code: {response.status_code}")
            return True
        except Exception as e:
            print(f"Error sending email: {str(e)}")
            return False

    def send_payment_reminder(self, invoice_data, client_data, reminder_type='due_soon', org_data=None):
        """Send payment reminder email"""
        if not self.sg:
            print("SendGrid not configured. Email not sent.")
            return False

        client_email = client_data.get('profile', {}).get('email')
        if not client_email:
            print("Client email not found. Email not sent.")
            return False

        # Different templates based on reminder type
        if reminder_type == 'due_soon':  # T-3 days
            subject_prefix = "Friendly Reminder"
            header_color = "#FF9800"
            message_tone = "We wanted to give you a friendly reminder that"
            urgency_class = "info"
        elif reminder_type == 'overdue_1':  # T+1 day
            subject_prefix = "Payment Overdue"
            header_color = "#f44336"
            message_tone = "This is to inform you that"
            urgency_class = "warning"
        else:  # T+7 days
            subject_prefix = "Urgent: Payment Required"
            header_color = "#d32f2f"
            message_tone = "This is an urgent reminder that"
            urgency_class = "urgent"

        template = Template("""
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .header { background-color: {{ header_color }}; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; }
                .invoice-details { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .footer { background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; }
                .info { background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 10px; margin: 15px 0; }
                .warning { background-color: #fff3cd; border-left: 4px solid #ff9800; padding: 10px; margin: 15px 0; }
                .urgent { background-color: #ffebee; border-left: 4px solid #f44336; padding: 10px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>{{ org_name }}</h1>
                <h2>{{ subject_prefix }}</h2>
            </div>
            
            <div class="content">
                <p>Dear {{ client_name }},</p>
                
                <p>{{ message_tone }} invoice {{ invoice_number }} for {{ amount_due }} {% if reminder_type == 'due_soon' %}is due on {{ due_date }}{% else %}was due on {{ due_date }}{% endif %}.</p>
                
                <div class="invoice-details">
                    <strong>Invoice #:</strong> {{ invoice_number }}<br>
                    <strong>Original Amount:</strong> {{ original_amount }}<br>
                    <strong>Amount Due:</strong> {{ amount_due }}<br>
                    <strong>Due Date:</strong> {{ due_date }}<br>
                    {% if days_overdue > 0 %}
                    <strong>Days Overdue:</strong> {{ days_overdue }}<br>
                    {% endif %}
                </div>
                
                <div class="{{ urgency_class }}">
                    {% if reminder_type == 'due_soon' %}
                    <strong>📅 Reminder:</strong> Payment is due in {{ days_until_due }} days. Please ensure payment is made by the due date to avoid any inconvenience.
                    {% elif reminder_type == 'overdue_1' %}
                    <strong>⚠️ Overdue Notice:</strong> This invoice is now {{ days_overdue }} day(s) overdue. Please arrange payment at your earliest convenience.
                    {% else %}
                    <strong>🚨 Urgent Action Required:</strong> This invoice is significantly overdue ({{ days_overdue }} days). Please contact us immediately to discuss payment arrangements.
                    {% endif %}
                </div>
                
                <p>If you have already made this payment, please ignore this reminder. If you have any questions or need to discuss payment arrangements, please don't hesitate to contact us.</p>
                
                <p>Thank you for your prompt attention to this matter.</p>
                
                <p>Best regards,<br>
                {{ org_name }} Team</p>
            </div>
            
            <div class="footer">
                <p>This is an automated reminder. For any queries, please contact us using the details above.</p>
                <p>Generated on {{ generated_at }}</p>
            </div>
        </body>
        </html>
        """)

        # Calculate days overdue/until due
        due_date = datetime.fromisoformat(invoice_data.get('dueDate').replace('Z', '+00:00'))
        now = datetime.now(pytz.UTC)
        days_diff = (now - due_date).days
        
        # Prepare template data
        org_name = org_data.get('name', 'AUTOSTUDIOFLOW') if org_data else 'AUTOSTUDIOFLOW'
        template_data = {
            'org_name': org_name,
            'client_name': client_data.get('profile', {}).get('name', 'Valued Client'),
            'invoice_number': invoice_data.get('number', ''),
            'original_amount': self.format_currency(invoice_data.get('totals', {}).get('grandTotal', 0), invoice_data.get('currency', 'INR')),
            'amount_due': self.format_currency(invoice_data.get('totals', {}).get('amountDue', 0), invoice_data.get('currency', 'INR')),
            'due_date': self.format_date(invoice_data.get('dueDate')),
            'days_overdue': max(0, days_diff),
            'days_until_due': max(0, -days_diff),
            'reminder_type': reminder_type,
            'subject_prefix': subject_prefix,
            'header_color': header_color,
            'message_tone': message_tone,
            'urgency_class': urgency_class,
            'generated_at': datetime.now(pytz.timezone('Asia/Kolkata')).strftime('%d %B %Y at %I:%M %p IST')
        }

        # Create email
        subject = f"{subject_prefix}: Invoice {invoice_data.get('number', '')} - {org_name}"
        html_content = template.render(**template_data)
        
        message = Mail(
            from_email=self.from_email,
            to_emails=client_email,
            subject=subject,
            html_content=html_content
        )

        try:
            response = self.sg.send(message)
            print(f"Reminder email sent successfully. Status code: {response.status_code}")
            return True
        except Exception as e:
            print(f"Error sending reminder email: {str(e)}")
            return False

    def send_client_reply_notification(self, invoice_data, client_data, message, admin_email, org_data=None):
        """Send notification to admin when client replies to invoice"""
        if not self.sg:
            print("SendGrid not configured. Email not sent.")
            return False

        org_name = org_data.get('name', 'AutoStudioFlow') if org_data else 'AutoStudioFlow'
        client_name = client_data.get('profile', {}).get('name', 'Client')
        invoice_number = invoice_data.get('number', 'DRAFT')

        html_content = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .header {{ background-color: #2196F3; color: white; padding: 20px; text-align: center; }}
                .content {{ padding: 20px; }}
                .message-box {{ background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2196F3; }}
                .footer {{ background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; }}
                .info {{ background-color: #e3f2fd; padding: 10px; border-radius: 5px; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>{org_name}</h1>
                <h2>Client Response - Invoice {invoice_number}</h2>
            </div>
            
            <div class="content">
                <div class="info">
                    <p><strong>📧 New client response received</strong></p>
                    <p><strong>Client:</strong> {client_name}</p>
                    <p><strong>Invoice:</strong> {invoice_number}</p>
                    <p><strong>Amount Due:</strong> {self._format_currency(invoice_data.get('totals', {}).get('amountDue', 0))}</p>
                </div>
                
                <h3>Client Message:</h3>
                <div class="message-box">
                    <p>{message}</p>
                </div>
                
                <p>Please log into the admin panel to view the complete communication thread and respond if necessary.</p>
                
                <p>This is an automated notification from {org_name}.</p>
            </div>
            
            <div class="footer">
                <p>Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}</p>
            </div>
        </body>
        </html>
        """

        message = Mail(
            from_email=Email(self.from_email),
            to_emails=admin_email,
            subject=f"Client Response - Invoice {invoice_number}",
            html_content=html_content
        )

        try:
            response = self.sg.send(message)
            print(f"Client reply notification sent successfully. Status code: {response.status_code}")
            return True
        except Exception as e:
            print(f"Error sending client reply notification: {str(e)}")
            return False

    def send_invoice_message_notification(self, invoice_data, client_data, message, org_data=None):
        """Send message notification to client from admin/accountant"""
        if not self.sg:
            print("SendGrid not configured. Email not sent.")
            return False

        client_email = client_data.get('profile', {}).get('email')
        if not client_email:
            print("Client email not found. Email not sent.")
            return False

        org_name = org_data.get('name', 'AutoStudioFlow') if org_data else 'AutoStudioFlow'
        client_name = client_data.get('profile', {}).get('name', 'Valued Client')
        invoice_number = invoice_data.get('number', 'DRAFT')

        html_content = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .header {{ background-color: #2196F3; color: white; padding: 20px; text-align: center; }}
                .content {{ padding: 20px; }}
                .message-box {{ background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2196F3; }}
                .footer {{ background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; }}
                .info {{ background-color: #e3f2fd; padding: 10px; border-radius: 5px; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>{org_name}</h1>
                <h2>Message About Invoice {invoice_number}</h2>
            </div>
            
            <div class="content">
                <p>Dear {client_name},</p>
                
                <p>We have sent you a message regarding Invoice {invoice_number}:</p>
                
                <div class="message-box">
                    <p>{message}</p>
                </div>
                
                <div class="info">
                    <p><strong>Invoice Details:</strong></p>
                    <p><strong>Invoice #:</strong> {invoice_number}</p>
                    <p><strong>Amount Due:</strong> {self._format_currency(invoice_data.get('totals', {}).get('amountDue', 0))}</p>
                    <p><strong>Due Date:</strong> {invoice_data.get('dueDate', 'Not set')}</p>
                </div>
                
                <p>You can reply to this message and view your complete invoice history by logging into your client portal.</p>
                
                <p>If you have any questions or concerns, please don't hesitate to reach out to us.</p>
                
                <p>Best regards,<br>
                {org_name} Team</p>
            </div>
            
            <div class="footer">
                <p>This is an automated email. You can reply to this invoice through your client portal.</p>
                <p>Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}</p>
            </div>
        </body>
        </html>
        """

        message = Mail(
            from_email=Email(self.from_email),
            to_emails=client_email,
            subject=f"Message About Invoice {invoice_number} - {org_name}",
            html_content=html_content
        )

        try:
            response = self.sg.send(message)
            print(f"Invoice message notification sent successfully. Status code: {response.status_code}")
            return True
        except Exception as e:
            print(f"Error sending invoice message notification: {str(e)}")
            return False

    def _format_currency(self, amount):
        """Helper method to format currency"""
        return f"₹{amount:,.2f}"
        
# Global email service instance
email_service = EmailService()
