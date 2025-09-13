"""
AI-Enhanced Admin Analysis Service for Receipt Verification
Uses OpenRouter API for intelligent receipt analysis and decision support
"""

import logging
import requests
import os
import json
import re
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class AIInsight:
    """AI-generated insight for admin review"""
    type: str  # 'risk_factor', 'anomaly', 'pattern', 'recommendation'
    title: str
    description: str
    confidence: float
    severity: str  # 'low', 'medium', 'high', 'critical'
    evidence: Dict[str, Any]
    suggested_action: str

@dataclass
class AdminAnalysisResult:
    """Comprehensive AI analysis result for admin review"""
    natural_language_summary: str
    risk_level: str  # LOW, MEDIUM, HIGH
    risk_explanation: str
    primary_concerns: List[str]
    contextual_insights: List[AIInsight]
    evidence_highlights: List[str]
    similar_cases: List[Dict[str, Any]]
    recommendation: str
    recommendation_confidence: int  # 0-100
    overall_confidence: int  # 0-100
    analysis_timestamp: str

@dataclass 
class OrganizationalInsights:
    """AI-generated organizational insights"""
    executive_summary: str
    key_metrics: Dict[str, Any]
    spending_patterns: List[Dict[str, Any]]
    risk_analysis: Dict[str, Any]
    user_behavior: Dict[str, Any]
    recommendations: List[Dict[str, Any]]
    trends: Dict[str, Any]
    timeframe: str
    analysis_timestamp: str

class AIAdminAnalysisService:
    """Advanced AI service for admin decision support using OpenRouter"""
    
    def __init__(self):
        self.risk_thresholds = {
            "APPROVE": 30,
            "INVESTIGATE": 60,
            "REJECT": 80
        }
    
    def get_openrouter_analysis(self, prompt_text: str) -> Dict[str, Any]:
        """Get AI analysis using OpenRouter API (same as events.py)"""
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY not configured")
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        data = {
            "model": "google/gemma-2-9b-it:free",  # Free model that works well
            "messages": [
                {
                    "role": "system", 
                    "content": "You are a financial fraud detection expert. You MUST respond with ONLY valid JSON. Do not include any text before or after the JSON object."
                },
                {
                    "role": "user", 
                    "content": prompt_text
                }
            ],
            "temperature": 0.1  # Very low temperature for consistent JSON output
        }
        
        logger.info("OpenRouter request for receipt analysis")
        response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=data)
        
        try:
            response.raise_for_status()
        except Exception as e:
            logger.error(f"OpenRouter API error: {response.text}")
            raise
        
        response_data = response.json()
        content = response_data["choices"][0]["message"]["content"]
        
        # Clean up the content - handle various code block formats (same as events.py)
        patterns = [
            r'```json\s*\n([\s\S]+?)\n\s*```',
            r'```json([\s\S]+?)```',
            r'```\s*\n([\s\S]+?)\n\s*```',
            r'```([\s\S]+?)```'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, content)
            if match:
                content = match.group(1).strip()
                break
        
        try:
            return json.loads(content)
        except Exception as e:
            logger.error(f"Failed to parse AI response as JSON: {content}")
            
            # Try to find JSON object in the content
            json_pattern = r'\{[\s\S]*\}'
            json_match = re.search(json_pattern, content)
            if json_match:
                try:
                    return json.loads(json_match.group(0))
                except:
                    pass
            
            # Try to extract key information from natural language response
            logger.warning("Attempting to parse natural language AI response")
            
            # Look for decision keywords
            decision = "INVESTIGATE"  # Default
            if any(word in content.lower() for word in ["approve", "low risk", "acceptable"]):
                decision = "APPROVE"
            elif any(word in content.lower() for word in ["reject", "high risk", "fraud", "manipulation"]):
                decision = "REJECT"
            
            # Extract confidence if mentioned
            confidence = 0.7  # Default
            confidence_match = re.search(r'(\d+)%?\s*confidence', content.lower())
            if confidence_match:
                confidence = float(confidence_match.group(1)) / 100
            
            # Extract main concerns from the text
            concerns = []
            if "manipulation" in content.lower():
                concerns.append("Image manipulation detected")
            if "duplicate" in content.lower():
                concerns.append("Duplicate submission found")
            if "high amount" in content.lower():
                concerns.append("High amount submission")
            
            # Fallback structured response
            return {
                "summary": content[:200] + "..." if len(content) > 200 else content,
                "decision": decision,
                "confidence": confidence,
                "primary_concerns": [
                    {
                        "title": concern,
                        "description": f"System detected: {concern}",
                        "severity": "medium",
                        "confidence": 0.8,
                        "suggested_action": "Manual review required"
                    } for concern in concerns
                ],
                "contextual_insights": [
                    {
                        "title": "AI Response Format Issue",
                        "description": "AI returned natural language instead of structured JSON",
                        "significance": "System parsed key information from text"
                    }
                ],
                "reasoning": "AI response was in natural language format, key information extracted automatically",
                "recommended_next_steps": ["Manual review", "Verify extracted information"]
            }
    
    async def generate_comprehensive_admin_analysis(
        self, 
        receipt_data: Dict[str, Any],
        verification_results: Dict[str, Any],
        historical_data: List[Dict[str, Any]],
        team_context: Dict[str, Any]
    ) -> AdminAnalysisResult:
        """Generate comprehensive AI analysis for admin review"""
        try:
            receipt_id = receipt_data.get('id', 'unknown')
            
            # Prepare data for AI analysis
            receipt_summary = self._prepare_receipt_summary(receipt_data, verification_results)
            historical_summary = self._prepare_historical_summary(historical_data, receipt_data)
            
            # Create comprehensive AI prompt
            prompt = self._create_analysis_prompt(receipt_summary, historical_summary, team_context)
            
            # Get AI analysis
            ai_response = self.get_openrouter_analysis(prompt)
            
            # Process AI response into structured format
            analysis_result = self._process_ai_response(
                ai_response, receipt_id, receipt_data, verification_results, historical_data
            )
            
            return analysis_result
            
        except Exception as e:
            logger.error(f"Error generating admin analysis: {e}")
            return self._generate_fallback_analysis(receipt_data, verification_results)
    
    def _prepare_receipt_summary(self, receipt_data: Dict[str, Any], verification_results: Dict[str, Any]) -> str:
        """Prepare receipt data summary for AI analysis"""
        provider = receipt_data.get('provider', 'Unknown').capitalize()
        amount = receipt_data.get('extractedData', {}).get('amount', 0)
        submitter = receipt_data.get('submittedByName', 'Unknown')
        risk_score = verification_results.get('risk_score', 0)
        exact_duplicate = verification_results.get('exact_duplicate_detected', False)
        
        # Extract key risk factors
        risk_factors = verification_results.get('risk_factors', {})
        duplicates_found = risk_factors.get('duplicates', {}).get('found', False)
        manipulation_detected = risk_factors.get('image_manipulation', {}).get('detected', False)
        
        summary = f"""
RECEIPT DETAILS:
- Provider: {provider}
- Amount: ₹{amount}
- Submitted by: {submitter}
- Submission date: {receipt_data.get('createdAt', 'Unknown')[:10]}

RISK ASSESSMENT:
- Overall Risk Score: {risk_score}/100
- Exact Duplicate Detected: {exact_duplicate}
- Image Manipulation: {manipulation_detected}
- Multiple Duplicates Found: {duplicates_found}

EXTRACTED DATA:
- Ride ID: {receipt_data.get('extractedData', {}).get('rideId', 'Not detected')}
- Date/Time: {receipt_data.get('extractedData', {}).get('timestamp', 'Not detected')}
- Locations: {receipt_data.get('extractedData', {}).get('locations', 'Not detected')}
"""
        return summary
    
    def _prepare_historical_summary(self, historical_data: List[Dict[str, Any]], current_receipt: Dict[str, Any]) -> str:
        """Prepare historical context for AI analysis"""
        submitter_id = current_receipt.get('submittedBy')
        current_amount = current_receipt.get('extractedData', {}).get('amount', 0)
        
        # Analyze submitter's history
        submitter_receipts = [r for r in historical_data if r.get('submittedBy') == submitter_id]
        
        if len(submitter_receipts) > 0:
            amounts = [r.get('extractedData', {}).get('amount', 0) for r in submitter_receipts if r.get('extractedData', {}).get('amount')]
            avg_amount = sum(amounts) / len(amounts) if amounts else 0
            rejected_count = len([r for r in submitter_receipts if r.get('status') == 'REJECTED'])
            
            summary = f"""
SUBMITTER HISTORY:
- Total previous submissions: {len(submitter_receipts)}
- Average amount: ₹{avg_amount:.2f}
- Current vs Average: {current_amount/avg_amount:.1f}x higher
- Previous rejections: {rejected_count}
- Rejection rate: {(rejected_count/len(submitter_receipts)*100):.1f}%

RECENT PATTERNS:
- Last 5 submissions: {[r.get('extractedData', {}).get('amount', 0) for r in submitter_receipts[-5:]]}
- Risk levels: {[r.get('verification_results', {}).get('risk_level', 'UNKNOWN') for r in submitter_receipts[-5:]]}
"""
        else:
            summary = """
SUBMITTER HISTORY:
- New submitter - no previous submissions
- No historical data available for comparison
"""
        
        return summary
    
    def _create_analysis_prompt(self, receipt_summary: str, historical_summary: str, team_context: Dict[str, Any]) -> str:
        """Create comprehensive AI analysis prompt"""
        prompt = f"""You are an expert fraud detection analyst for a corporate expense management system. Analyze this cab receipt submission and provide comprehensive insights for admin decision-making.

{receipt_summary}

{historical_summary}

TEAM CONTEXT:
- Organization: {team_context.get('organization_id', 'Unknown')}
- Event: {team_context.get('event_id', 'Unknown')}
- Team size: {len(team_context.get('team_members', []))}

CRITICAL INSTRUCTION: You MUST respond with ONLY a valid JSON object. Do not include any text before or after the JSON. Do not use markdown formatting.

Provide your analysis in this exact JSON structure:
{{
  "summary": "One-sentence overall assessment of the receipt",
  "decision": "APPROVE",
  "confidence": 0.85,
  "primary_concerns": [
    {{
      "title": "Concern title",
      "description": "Detailed description", 
      "severity": "medium",
      "confidence": 0.90,
      "suggested_action": "Specific action to take"
    }}
  ],
  "contextual_insights": [
    {{
      "title": "Pattern or insight title",
      "description": "What this means",
      "significance": "Why this matters"
    }}
  ],
  "reasoning": "Detailed explanation of your decision logic",
  "recommended_next_steps": ["Step 1", "Step 2"]
}}

DECISION CRITERIA:
- APPROVE: Low risk (0-30), no significant concerns
- INVESTIGATE: Medium risk (30-70), some concerns need clarification  
- REJECT: High risk (70+), clear fraud indicators or policy violations

REMEMBER: Respond with ONLY the JSON object, no additional text or formatting."""

        return prompt
    
    def _process_ai_response(
        self, 
        ai_response: Dict[str, Any], 
        receipt_id: str,
        receipt_data: Dict[str, Any],
        verification_results: Dict[str, Any],
        historical_data: List[Dict[str, Any]]
    ) -> AdminAnalysisResult:
        """Process AI response into structured AdminAnalysisResult"""
        
        # Extract primary concerns
        primary_concerns = []
        for concern in ai_response.get('primary_concerns', []):
            primary_concerns.append(AIInsight(
                type='risk_factor',
                title=concern.get('title', 'Unknown Concern'),
                description=concern.get('description', ''),
                confidence=concern.get('confidence', 0.5),
                severity=concern.get('severity', 'medium'),
                evidence={},
                suggested_action=concern.get('suggested_action', 'Manual review')
            ))
        
        # Extract contextual insights
        contextual_insights = []
        for insight in ai_response.get('contextual_insights', []):
            contextual_insights.append(AIInsight(
                type='pattern',
                title=insight.get('title', 'Pattern Insight'),
                description=insight.get('description', ''),
                confidence=0.7,
                severity='medium',
                evidence={'significance': insight.get('significance', '')},
                suggested_action='Consider in decision'
            ))
        
        # Find similar cases
        similar_cases = self._find_similar_cases(receipt_data, historical_data)
        
        # Generate evidence highlights
        evidence_highlights = self._generate_evidence_highlights(receipt_data, verification_results)
        
        return AdminAnalysisResult(
            natural_language_summary=ai_response.get('summary', 'AI analysis completed'),
            risk_level=ai_response.get('decision', 'INVESTIGATE'),
            risk_explanation=ai_response.get('reasoning', 'No reasoning provided'),
            primary_concerns=[concern.get('title', 'Unknown Concern') for concern in ai_response.get('primary_concerns', [])],
            contextual_insights=contextual_insights,
            evidence_highlights=self._generate_evidence_highlights(receipt_data, verification_results),
            similar_cases=self._find_similar_cases(receipt_data, historical_data),
            recommendation=ai_response.get('decision', 'INVESTIGATE'),
            recommendation_confidence=int((ai_response.get('confidence', 0.5) * 100)),
            overall_confidence=int((ai_response.get('confidence', 0.5) * 100)),
            analysis_timestamp=datetime.now(timezone.utc).isoformat()
        )
    
    def _find_similar_cases(
        self, 
        receipt_data: Dict[str, Any], 
        historical_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Find similar historical cases for reference"""
        similar_cases = []
        current_amount = receipt_data.get('extractedData', {}).get('amount', 0)
        current_risk_score = receipt_data.get('verification_results', {}).get('risk_score', 0)
        
        for historical_receipt in historical_data[-30:]:  # Check last 30 receipts
            hist_amount = historical_receipt.get('extractedData', {}).get('amount', 0)
            hist_risk_score = historical_receipt.get('verification_results', {}).get('risk_score', 0)
            
            if current_amount > 0 and hist_amount > 0:
                amount_similarity = 1 - abs(current_amount - hist_amount) / max(current_amount, hist_amount)
                risk_similarity = 1 - abs(current_risk_score - hist_risk_score) / 100
                
                if amount_similarity > 0.7 and risk_similarity > 0.6:
                    similar_cases.append({
                        'receipt_id': historical_receipt.get('id'),
                        'amount': hist_amount,
                        'risk_score': hist_risk_score,
                        'final_status': historical_receipt.get('status'),
                        'admin_decision': historical_receipt.get('admin_decision', {}).get('decision'),
                        'similarity_score': (amount_similarity + risk_similarity) / 2,
                        'submitted_by': historical_receipt.get('submittedByName'),
                        'submitted_at': historical_receipt.get('createdAt', '')[:10]
                    })
        
        # Sort by similarity and return top 3
        similar_cases.sort(key=lambda x: x['similarity_score'], reverse=True)
        return similar_cases[:3]
    
    def _generate_evidence_highlights(
        self, 
        receipt_data: Dict[str, Any], 
        verification_results: Dict[str, Any]
    ) -> List[str]:
        """Generate evidence highlights for visual presentation"""
        highlights = []
        
        # Highlight duplicate information
        risk_factors = verification_results.get('risk_factors', {})
        duplicates = risk_factors.get('duplicates', {})
        
        if duplicates.get('found'):
            highest_confidence = duplicates.get('highest_confidence', {})
            highlights.append(f"Exact duplicate detected: {highest_confidence.get('confidence', 0)}% similarity")
        
        # Highlight manipulation detection
        manipulation = risk_factors.get('image_manipulation', {})
        if manipulation.get('detected'):
            highlights.append(f"Image manipulation detected: {manipulation.get('score', 0)}% confidence")
        
        # Add general risk factors
        if verification_results.get('risk_score', 0) >= 70:
            highlights.append(f"High risk score: {verification_results.get('risk_score', 0)}/100")
        
        # Add amount-based insights
        amount = receipt_data.get('extractedData', {}).get('amount', 0)
        if amount > 1000:
            highlights.append(f"High amount submission: ₹{amount}")
        
        return highlights
    
    def _generate_fallback_analysis(
        self, 
        receipt_data: Dict[str, Any], 
        verification_results: Dict[str, Any]
    ) -> AdminAnalysisResult:
        """Generate fallback analysis when AI processing fails"""
        
        risk_score = verification_results.get('risk_score', 100)
        exact_duplicate = verification_results.get('exact_duplicate_detected', False)
        
        # Create basic concerns based on verification results
        concerns = []
        if exact_duplicate:
            concerns.append(AIInsight(
                type='risk_factor',
                title='Exact Duplicate Detected',
                description='System detected an exact duplicate of this receipt',
                confidence=1.0,
                severity='critical',
                evidence={},
                suggested_action='REJECT - Investigate potential fraud'
            ))
        
        if risk_score >= 70:
            concerns.append(AIInsight(
                type='risk_factor',
                title='High Risk Score',
                description=f'System calculated high risk score of {risk_score}/100',
                confidence=0.8,
                severity='high',
                evidence={'risk_score': risk_score},
                suggested_action='INVESTIGATE - Manual review required'
            ))
        
        # Determine decision
        if exact_duplicate or risk_score >= 80:
            decision = 'REJECT'
            confidence = 0.9
        elif risk_score >= 50:
            decision = 'INVESTIGATE'
            confidence = 0.7
        else:
            decision = 'APPROVE'
            confidence = 0.6
        
        return AdminAnalysisResult(
            natural_language_summary=f"Automated analysis completed with {risk_score}/100 risk score. AI analysis unavailable - using rule-based assessment.",
            risk_level=decision,
            risk_explanation=f"Rule-based decision: {decision} based on risk score {risk_score} and duplicate status {exact_duplicate}",
            primary_concerns=[concern.suggested_action for concern in concerns],
            contextual_insights=[],
            evidence_highlights=self._generate_evidence_highlights(receipt_data, verification_results),
            similar_cases=[],
            recommendation=decision,
            recommendation_confidence=int(confidence * 100),
            overall_confidence=int(confidence * 100),
            analysis_timestamp=datetime.now(timezone.utc).isoformat()
        )

    async def analyze_receipt_for_admin(self, receipt_data: Dict[str, Any]) -> AdminAnalysisResult:
        """Generate comprehensive AI analysis for admin review"""
        try:
            # Extract key information
            amount = receipt_data.get('extractedData', {}).get('amount', 0)
            risk_assessment = receipt_data.get('riskAssessment', {})
            risk_score = risk_assessment.get('riskScore', 0)
            issues = risk_assessment.get('issues', [])
            
            # Generate natural language summary
            summary_prompt = f"""
            Analyze this receipt submission for an admin:
            
            Amount: ₹{amount}
            Risk Score: {risk_score}/100
            Issues Found: {', '.join(issues)}
            Submitter: {receipt_data.get('submittedByName', 'Unknown')}
            Provider: {receipt_data.get('extractedData', {}).get('provider', 'Unknown')}
            
            Provide a clear, professional summary for an admin to understand the situation quickly.
            """
            
            summary = await self._generate_ai_content(summary_prompt, "summary")
            
            # Determine risk level
            risk_level = "LOW"
            if risk_score >= 80:
                risk_level = "HIGH"
            elif risk_score >= 50:
                risk_level = "MEDIUM"
            
            # Generate risk explanation
            risk_explanation = f"Risk score of {risk_score}/100 based on: {', '.join(issues)}"
            
            # Create primary concerns
            primary_concerns = []
            if risk_score >= 80:
                primary_concerns.extend(["High Risk Score", "Requires Immediate Review"])
            if "duplicate" in str(issues).lower():
                primary_concerns.append("Potential Duplicate")
            if amount > 1000:
                primary_concerns.append("High Amount")
            
            # Generate contextual insights
            contextual_insights = [
                AIInsight(
                    title="Risk Assessment",
                    description=f"System identified {len(issues)} potential issues requiring review",
                    confidence=85,
                    type="risk_analysis",
                    severity="medium",
                    evidence=issues,
                    suggested_action="Review flagged issues carefully"
                ),
                AIInsight(
                    title="Amount Analysis", 
                    description=f"Amount of ₹{amount} is {'above' if amount > 500 else 'within'} typical range",
                    confidence=90,
                    type="financial_analysis",
                    severity="low",
                    evidence=[f"Amount: ₹{amount}"],
                    suggested_action="Standard amount verification"
                )
            ]
            
            # Evidence highlights
            evidence_highlights = issues[:5]  # Top 5 issues
            
            # Generate recommendation
            recommendation = "REQUIRES_REVIEW"
            if risk_score >= 90:
                recommendation = "REJECT - High risk factors detected"
            elif risk_score <= 20:
                recommendation = "APPROVE - Low risk, standard submission"
            else:
                recommendation = "REVIEW - Manual verification recommended"
                
            recommendation_confidence = 100 - risk_score  # Inverse relationship
            
            return AdminAnalysisResult(
                natural_language_summary=summary,
                risk_level=risk_level,
                risk_explanation=risk_explanation,
                primary_concerns=primary_concerns,
                contextual_insights=contextual_insights,
                evidence_highlights=evidence_highlights,
                similar_cases=[],  # Would implement similarity search
                recommendation=recommendation,
                recommendation_confidence=recommendation_confidence,
                overall_confidence=max(60, 100 - risk_score),  # Minimum 60% confidence
                analysis_timestamp=datetime.now(timezone.utc).isoformat()
            )
            
        except Exception as e:
            logger.error(f"Error in analyze_receipt_for_admin: {str(e)}")
            # Return fallback analysis
            return AdminAnalysisResult(
                natural_language_summary="Unable to generate AI analysis at this time.",
                risk_level="MEDIUM",
                risk_explanation="Analysis unavailable",
                primary_concerns=["AI Analysis Failed"],
                contextual_insights=[],
                evidence_highlights=[],
                similar_cases=[],
                recommendation="MANUAL_REVIEW",
                recommendation_confidence=50,
                overall_confidence=50,
                analysis_timestamp=datetime.now(timezone.utc).isoformat()
            )

    async def generate_priority_queue(self, receipts: List[Dict], priority_filter: str = None, limit: int = 50) -> List[Dict]:
        """Generate AI-prioritized queue of receipts requiring attention"""
        try:
            prioritized_items = []
            
            for receipt in receipts:
                risk_score = receipt.get('riskAssessment', {}).get('riskScore', 0)
                amount = receipt.get('extractedData', {}).get('amount', 0)
                issues = receipt.get('riskAssessment', {}).get('issues', [])
                
                # Determine priority
                priority = "low"
                if risk_score >= 90:
                    priority = "critical"
                elif risk_score >= 70:
                    priority = "high"
                elif risk_score >= 40:
                    priority = "medium"
                
                # Generate priority reason
                priority_reason = f"Risk score {risk_score}/100"
                if len(issues) > 0:
                    priority_reason += f" - {issues[0]}"
                
                # Calculate AI confidence (inverse of risk)
                ai_confidence = max(20, 100 - risk_score)
                
                queue_item = {
                    "id": receipt.get('id', 'unknown'),
                    "priority": priority,
                    "priority_reason": priority_reason,
                    "ai_confidence": ai_confidence,
                    "risk_score": risk_score,
                    "amount": amount,
                    "submittedByName": receipt.get('submittedByName', 'Unknown'),
                    "createdAt": receipt.get('createdAt', ''),
                    "risk_factors": issues[:3],  # Top 3 risk factors
                    "status": receipt.get('status', 'PENDING')
                }
                
                # Apply priority filter
                if not priority_filter or priority == priority_filter:
                    prioritized_items.append(queue_item)
            
            # Sort by priority and risk score
            priority_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
            prioritized_items.sort(
                key=lambda x: (priority_order.get(x["priority"], 0), x["risk_score"]), 
                reverse=True
            )
            
            return prioritized_items[:limit]
            
        except Exception as e:
            logger.error(f"Error generating priority queue: {str(e)}")
            return []

    async def generate_organizational_insights(self, receipts: List[Dict], timeframe: str) -> OrganizationalInsights:
        """Generate AI insights about organizational receipt patterns"""
        try:
            if not receipts:
                return OrganizationalInsights(
                    executive_summary="No receipt data available for analysis.",
                    key_metrics={},
                    spending_patterns=[],
                    risk_analysis={},
                    user_behavior={},
                    recommendations=[],
                    trends={},
                    timeframe=timeframe,
                    analysis_timestamp=datetime.now(timezone.utc).isoformat()
                )
            
            # Calculate key metrics
            total_amount = sum(r.get('extractedData', {}).get('amount', 0) for r in receipts)
            total_receipts = len(receipts)
            high_risk_count = len([r for r in receipts if r.get('riskAssessment', {}).get('riskScore', 0) >= 70])
            verified_count = len([r for r in receipts if r.get('status') == 'VERIFIED'])
            verification_rate = int((verified_count / total_receipts) * 100) if total_receipts > 0 else 0
            
            key_metrics = {
                "total_amount": total_amount,
                "total_receipts": total_receipts,
                "high_risk_count": high_risk_count,
                "verification_rate": verification_rate
            }
            
            # Generate executive summary
            executive_summary = await self._generate_ai_content(
                f"Summarize these receipt analytics for {timeframe}: {total_receipts} receipts, "
                f"₹{total_amount:,.2f} total, {high_risk_count} high-risk items, {verification_rate}% verified.",
                "executive_summary"
            )
            
            # Analyze spending patterns
            spending_patterns = []
            provider_amounts = {}
            for receipt in receipts:
                provider = receipt.get('extractedData', {}).get('provider', 'Unknown')
                amount = receipt.get('extractedData', {}).get('amount', 0)
                provider_amounts[provider] = provider_amounts.get(provider, 0) + amount
            
            for provider, amount in sorted(provider_amounts.items(), key=lambda x: x[1], reverse=True)[:5]:
                percentage = (amount / total_amount) * 100 if total_amount > 0 else 0
                spending_patterns.append({
                    "category": provider.title(),
                    "amount": amount,
                    "percentage": percentage,
                    "insight": f"Represents {percentage:.1f}% of total spending"
                })
            
            # Risk analysis
            risk_analysis = {
                "overall_assessment": f"Organization shows {'high' if high_risk_count > total_receipts * 0.2 else 'moderate' if high_risk_count > total_receipts * 0.1 else 'low'} risk profile",
                "risk_factors": [
                    {
                        "factor": "High-Risk Submissions",
                        "severity": "high" if high_risk_count > 5 else "medium",
                        "description": f"{high_risk_count} receipts flagged as high-risk"
                    }
                ]
            }
            
            # User behavior analysis
            user_submissions = {}
            for receipt in receipts:
                user = receipt.get('submittedByName', 'Unknown')
                amount = receipt.get('extractedData', {}).get('amount', 0)
                if user not in user_submissions:
                    user_submissions[user] = {"count": 0, "total_amount": 0}
                user_submissions[user]["count"] += 1
                user_submissions[user]["total_amount"] += amount
            
            top_submitters = []
            for user, data in sorted(user_submissions.items(), key=lambda x: x[1]["count"], reverse=True)[:3]:
                top_submitters.append({
                    "name": user,
                    "count": data["count"],
                    "total_amount": data["total_amount"]
                })
            
            user_behavior = {
                "top_submitters": top_submitters,
                "behavior_insights": [
                    f"Average of {total_receipts / len(user_submissions):.1f} receipts per user" if user_submissions else "No user data available"
                ]
            }
            
            # Generate recommendations
            recommendations = [
                {
                    "title": "Enhance Verification Process",
                    "description": f"With {high_risk_count} high-risk receipts, consider implementing stricter verification",
                    "priority": "high" if high_risk_count > 5 else "medium",
                    "expected_impact": "Reduce fraud risk by 30-50%"
                }
            ]
            
            # Trends analysis
            trends = {
                "submission_trend": {
                    "description": f"Average of {total_receipts / 30:.1f} receipts per day in {timeframe}",
                    "change": 0  # Would calculate from historical data
                },
                "amount_trend": {
                    "description": f"Average receipt value: ₹{total_amount / total_receipts:.2f}" if total_receipts > 0 else "No data",
                    "change": 0
                }
            }
            
            return OrganizationalInsights(
                executive_summary=executive_summary,
                key_metrics=key_metrics,
                spending_patterns=spending_patterns,
                risk_analysis=risk_analysis,
                user_behavior=user_behavior,
                recommendations=recommendations,
                trends=trends,
                timeframe=timeframe,
                analysis_timestamp=datetime.now(timezone.utc).isoformat()
            )
            
        except Exception as e:
            logger.error(f"Error generating organizational insights: {str(e)}")
            return OrganizationalInsights(
                executive_summary="Unable to generate insights at this time.",
                key_metrics={},
                spending_patterns=[],
                risk_analysis={},
                user_behavior={},
                recommendations=[],
                trends={},
                timeframe=timeframe,
                analysis_timestamp=datetime.now(timezone.utc).isoformat()
            )

    async def _generate_ai_content(self, prompt: str, content_type: str) -> str:
        """Generate AI content using OpenRouter API"""
        try:
            # Use the same OpenRouter integration as in the main analysis
            ai_response = self.get_openrouter_analysis(f"""
            Generate a {content_type} based on this prompt:
            {prompt}
            
            Respond with clear, professional text. Keep it concise and actionable.
            """)
            
            # Extract the response content
            if isinstance(ai_response, dict):
                return ai_response.get('summary', ai_response.get('content', 'AI analysis completed'))
            else:
                return str(ai_response)
            
        except Exception as e:
            logger.warning(f"AI content generation failed for {content_type}: {str(e)}")
            # Fallback responses
            fallbacks = {
                "summary": "Receipt requires admin review based on automated risk assessment.",
                "executive_summary": "Standard receipt processing patterns observed during the analysis period.",
                "default": "AI analysis temporarily unavailable - manual review recommended."
            }
            return fallbacks.get(content_type, fallbacks["default"])


# Global instance
ai_admin_service = AIAdminAnalysisService()
