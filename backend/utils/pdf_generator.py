"""
PDF Generation utilities for invoices and quotes
"""
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from io import BytesIO
import os
from datetime import datetime
import pytz

class PDFGenerator:
    def __init__(self):
        self.pagesize = A4
        self.width, self.height = self.pagesize
        self.styles = getSampleStyleSheet()
        
        # Custom styles
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            textColor=colors.HexColor('#2196F3'),
            alignment=TA_CENTER
        )
        
        self.header_style = ParagraphStyle(
            'CustomHeader',
            parent=self.styles['Heading2'],
            fontSize=16,
            spaceAfter=12,
            textColor=colors.HexColor('#1976D2')
        )
        
        self.body_style = ParagraphStyle(
            'CustomBody',
            parent=self.styles['Normal'],
            fontSize=10,
            spaceAfter=6
        )
        
        self.footer_style = ParagraphStyle(
            'CustomFooter',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=colors.gray,
            alignment=TA_CENTER
        )

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

    def generate_invoice_pdf(self, invoice_data, client_data, org_data=None):
        """Generate invoice PDF"""
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=self.pagesize,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=18
        )
        
        # Build the PDF content
        elements = []
        
        # Header
        if org_data:
            org_name = org_data.get('name', 'AUTOSTUDIOFLOW')
            org_address = org_data.get('address', '')
            org_phone = org_data.get('phone', '')
            org_email = org_data.get('email', '')
        else:
            org_name = 'AUTOSTUDIOFLOW'
            org_address = ''
            org_phone = ''
            org_email = ''
        
        # Company header
        elements.append(Paragraph(org_name, self.title_style))
        if org_address:
            elements.append(Paragraph(org_address, self.body_style))
        if org_phone or org_email:
            contact_info = f"Phone: {org_phone}" + (f" | Email: {org_email}" if org_email else "")
            elements.append(Paragraph(contact_info, self.body_style))
        
        elements.append(Spacer(1, 20))
        
        # Invoice title and number
        invoice_title = f"INVOICE {invoice_data.get('number', 'DRAFT')}"
        elements.append(Paragraph(invoice_title, self.header_style))
        elements.append(Spacer(1, 20))
        
        # Invoice details and client info in two columns
        invoice_details = [
            ['Invoice #:', invoice_data.get('number', 'DRAFT')],
            ['Issue Date:', self.format_date(invoice_data.get('issueDate'))],
            ['Due Date:', self.format_date(invoice_data.get('dueDate'))],
            ['Currency:', invoice_data.get('currency', 'INR')]
        ]
        
        client_details = [
            ['Bill To:', ''],
            ['', client_data.get('profile', {}).get('name', 'Unknown Client')],
            ['', client_data.get('profile', {}).get('email', '')],
            ['', client_data.get('profile', {}).get('billingAddress', '')]
        ]
        
        # Create table for invoice and client details
        details_data = []
        for i in range(max(len(invoice_details), len(client_details))):
            row = []
            if i < len(invoice_details):
                row.extend(invoice_details[i])
            else:
                row.extend(['', ''])
            
            row.append('')  # Spacer column
            
            if i < len(client_details):
                row.extend(client_details[i])
            else:
                row.extend(['', ''])
            
            details_data.append(row)
        
        details_table = Table(details_data, colWidths=[1.5*inch, 2*inch, 0.5*inch, 1.5*inch, 2*inch])
        details_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (1, -1), 'Helvetica-Bold'),
            ('FONTNAME', (3, 0), (4, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (3, 0), (3, -1), 'RIGHT'),
        ]))
        
        elements.append(details_table)
        elements.append(Spacer(1, 30))
        
        # Line items table
        items_data = [['Description', 'Qty', 'Unit Price', 'Tax %', 'Amount']]
        
        for item in invoice_data.get('items', []):
            items_data.append([
                item.get('desc', ''),
                str(item.get('qty', 0)),
                self.format_currency(item.get('unitPrice', 0), invoice_data.get('currency', 'INR')),
                f"{item.get('taxRatePct', 0)}%",
                self.format_currency(item.get('qty', 0) * item.get('unitPrice', 0), invoice_data.get('currency', 'INR'))
            ])
        
        items_table = Table(items_data, colWidths=[3*inch, 0.8*inch, 1.2*inch, 0.8*inch, 1.2*inch])
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2196F3')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        
        elements.append(items_table)
        elements.append(Spacer(1, 20))
        
        # Totals section
        totals = invoice_data.get('totals', {})
        currency = invoice_data.get('currency', 'INR')
        
        totals_data = [
            ['Subtotal:', self.format_currency(totals.get('subTotal', 0), currency)]
        ]
        
        if totals.get('discountTotal', 0) > 0:
            totals_data.append(['Discount:', f"-{self.format_currency(totals.get('discountTotal', 0), currency)}"])
        
        totals_data.extend([
            ['Tax:', self.format_currency(totals.get('taxTotal', 0), currency)],
        ])
        
        if invoice_data.get('shipping', 0) > 0:
            totals_data.append(['Shipping:', self.format_currency(invoice_data.get('shipping', 0), currency)])
        
        totals_data.append(['', ''])  # Spacer row
        totals_data.append(['TOTAL:', self.format_currency(totals.get('grandTotal', 0), currency)])
        
        if totals.get('amountPaid', 0) > 0:
            totals_data.append(['Amount Paid:', self.format_currency(totals.get('amountPaid', 0), currency)])
            totals_data.append(['AMOUNT DUE:', self.format_currency(totals.get('amountDue', 0), currency)])
        
        # Right-align totals table
        totals_table = Table(totals_data, colWidths=[2*inch, 1.5*inch])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, -3), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTSIZE', (0, -3), (-1, -1), 12),
            ('LINEABOVE', (0, -3), (-1, -3), 2, colors.black),
            ('BACKGROUND', (0, -3), (-1, -1), colors.HexColor('#E3F2FD')),
        ]))
        
        # Create a table to right-align the totals
        right_align_data = [['', totals_table]]
        right_align_table = Table(right_align_data, colWidths=[4.5*inch, 3.5*inch])
        right_align_table.setStyle(TableStyle([
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        
        elements.append(right_align_table)
        elements.append(Spacer(1, 30))
        
        # Notes section
        if invoice_data.get('notes'):
            elements.append(Paragraph("Notes:", self.header_style))
            elements.append(Paragraph(invoice_data.get('notes'), self.body_style))
            elements.append(Spacer(1, 20))
        
        # Terms and conditions
        terms = """
        Terms & Conditions:
        • Payment is due by the due date specified above
        • Late payments may incur additional charges
        • Please include invoice number in payment reference
        • For any queries, please contact us using the details above
        """
        elements.append(Paragraph("Terms & Conditions:", self.header_style))
        elements.append(Paragraph(terms, self.body_style))
        
        # Footer
        elements.append(Spacer(1, 30))
        footer_text = f"Generated on {datetime.now(pytz.timezone('Asia/Kolkata')).strftime('%d %B %Y at %I:%M %p IST')}"
        elements.append(Paragraph(footer_text, self.footer_style))
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        return buffer

    def generate_quote_pdf(self, quote_data, client_data, org_data=None):
        """Generate quote PDF"""
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=self.pagesize,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=18
        )
        
        # Build the PDF content
        elements = []
        
        # Header
        if org_data:
            org_name = org_data.get('name', 'AUTOSTUDIOFLOW')
            org_address = org_data.get('address', '')
            org_phone = org_data.get('phone', '')
            org_email = org_data.get('email', '')
        else:
            org_name = 'AUTOSTUDIOFLOW'
            org_address = ''
            org_phone = ''
            org_email = ''
        
        # Company header
        elements.append(Paragraph(org_name, self.title_style))
        if org_address:
            elements.append(Paragraph(org_address, self.body_style))
        if org_phone or org_email:
            contact_info = f"Phone: {org_phone}" + (f" | Email: {org_email}" if org_email else "")
            elements.append(Paragraph(contact_info, self.body_style))
        
        elements.append(Spacer(1, 20))
        
        # Quote title and number
        quote_title = f"QUOTATION {quote_data.get('number', 'DRAFT')}"
        elements.append(Paragraph(quote_title, self.header_style))
        elements.append(Spacer(1, 20))
        
        # Quote details and client info in two columns
        quote_details = [
            ['Quote #:', quote_data.get('number', 'DRAFT')],
            ['Issue Date:', self.format_date(quote_data.get('issueDate'))],
            ['Valid Until:', self.format_date(quote_data.get('validUntil'))],
            ['Currency:', quote_data.get('currency', 'INR')]
        ]
        
        client_details = [
            ['Quote For:', ''],
            ['', client_data.get('profile', {}).get('name', 'Unknown Client')],
            ['', client_data.get('profile', {}).get('email', '')],
            ['', client_data.get('profile', {}).get('billingAddress', '')]
        ]
        
        # Create table for quote and client details
        details_data = []
        for i in range(max(len(quote_details), len(client_details))):
            row = []
            if i < len(quote_details):
                row.extend(quote_details[i])
            else:
                row.extend(['', ''])
            
            row.append('')  # Spacer column
            
            if i < len(client_details):
                row.extend(client_details[i])
            else:
                row.extend(['', ''])
            
            details_data.append(row)
        
        details_table = Table(details_data, colWidths=[1.5*inch, 2*inch, 0.5*inch, 1.5*inch, 2*inch])
        details_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (1, -1), 'Helvetica-Bold'),
            ('FONTNAME', (3, 0), (4, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (3, 0), (3, -1), 'RIGHT'),
        ]))
        
        elements.append(details_table)
        elements.append(Spacer(1, 30))
        
        # Line items table (same as invoice)
        items_data = [['Description', 'Qty', 'Unit Price', 'Tax %', 'Amount']]
        
        for item in quote_data.get('items', []):
            items_data.append([
                item.get('desc', ''),
                str(item.get('qty', 0)),
                self.format_currency(item.get('unitPrice', 0), quote_data.get('currency', 'INR')),
                f"{item.get('taxRatePct', 0)}%",
                self.format_currency(item.get('qty', 0) * item.get('unitPrice', 0), quote_data.get('currency', 'INR'))
            ])
        
        items_table = Table(items_data, colWidths=[3*inch, 0.8*inch, 1.2*inch, 0.8*inch, 1.2*inch])
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4CAF50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        
        elements.append(items_table)
        elements.append(Spacer(1, 20))
        
        # Totals section (same structure as invoice)
        totals = quote_data.get('totals', {})
        currency = quote_data.get('currency', 'INR')
        
        totals_data = [
            ['Subtotal:', self.format_currency(totals.get('subTotal', 0), currency)]
        ]
        
        if totals.get('discountTotal', 0) > 0:
            totals_data.append(['Discount:', f"-{self.format_currency(totals.get('discountTotal', 0), currency)}"])
        
        totals_data.extend([
            ['Tax:', self.format_currency(totals.get('taxTotal', 0), currency)],
        ])
        
        if quote_data.get('shipping', 0) > 0:
            totals_data.append(['Shipping:', self.format_currency(quote_data.get('shipping', 0), currency)])
        
        totals_data.append(['', ''])  # Spacer row
        totals_data.append(['TOTAL QUOTED AMOUNT:', self.format_currency(totals.get('grandTotal', 0), currency)])
        
        # Right-align totals table
        totals_table = Table(totals_data, colWidths=[2.5*inch, 1.5*inch])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, -2), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTSIZE', (0, -2), (-1, -1), 12),
            ('LINEABOVE', (0, -2), (-1, -2), 2, colors.black),
            ('BACKGROUND', (0, -2), (-1, -1), colors.HexColor('#E8F5E8')),
        ]))
        
        # Create a table to right-align the totals
        right_align_data = [['', totals_table]]
        right_align_table = Table(right_align_data, colWidths=[4*inch, 4*inch])
        right_align_table.setStyle(TableStyle([
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        
        elements.append(right_align_table)
        elements.append(Spacer(1, 30))
        
        # Notes section
        if quote_data.get('notes'):
            elements.append(Paragraph("Notes:", self.header_style))
            elements.append(Paragraph(quote_data.get('notes'), self.body_style))
            elements.append(Spacer(1, 20))
        
        # Quote validity and terms
        validity_text = f"This quotation is valid until {self.format_date(quote_data.get('validUntil'))}."
        elements.append(Paragraph("Quote Validity:", self.header_style))
        elements.append(Paragraph(validity_text, self.body_style))
        elements.append(Spacer(1, 10))
        
        terms = """
        Terms & Conditions:
        • This quote is valid for the period specified above
        • Prices are subject to change after quote expiry
        • Work will commence upon quote acceptance and advance payment
        • Final invoice may vary based on actual scope of work
        • Please contact us for any clarifications
        """
        elements.append(Paragraph("Terms & Conditions:", self.header_style))
        elements.append(Paragraph(terms, self.body_style))
        
        # Footer
        elements.append(Spacer(1, 30))
        footer_text = f"Generated on {datetime.now(pytz.timezone('Asia/Kolkata')).strftime('%d %B %Y at %I:%M %p IST')}"
        elements.append(Paragraph(footer_text, self.footer_style))
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        return buffer

# Global PDF generator instance
pdf_generator = PDFGenerator()
