"""
AI Client - Uses OpenRouter for flexible model selection
Maintains backward compatibility with Gemini client interface
"""

import os
import aiohttp
import base64
import json
from typing import Optional, Dict, Any
from enum import Enum


class ModelTier(Enum):
    # Fast models for simple tasks (using Llama)
    FLASH = "meta-llama/llama-3.1-8b-instruct"
    # Pro models for complex tasks (using Claude)
    PRO = "anthropic/claude-3.5-sonnet"


class GeminiClient:
    """OpenRouter API client (backward compatible with Gemini interface)"""
    
    BASE_URL = "https://openrouter.ai/api/v1"
    
    def __init__(self):
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY environment variable not set")
        
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://autostudioflow.com",
            "X-Title": "AutoStudioFlow"
        }
        
        # Task complexity thresholds
        self.complex_tasks = [
            "financial_analysis",
            "contract_review",
            "complex_ocr",
            "multi_document_analysis",
            "legal_interpretation",
            "strategic_insights"
        ]
    
    def _select_model(self, task_type: str, force_pro: bool = False) -> str:
        """Select appropriate model based on task complexity"""
        if force_pro or task_type in self.complex_tasks:
            return ModelTier.PRO.value
        return ModelTier.FLASH.value
    
    async def generate_text(
        self,
        prompt: str,
        task_type: str = "general",
        force_pro: bool = False,
        temperature: float = 0.7,
        max_tokens: int = 2048
    ) -> Dict[str, Any]:
        """Generate text response"""
        model = self._select_model(task_type, force_pro)
        
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.BASE_URL}/chat/completions",
                headers=self.headers,
                json=payload
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"OpenRouter API error: {response.status} - {error_text}")
                
                data = await response.json()
                
                return {
                    "text": data["choices"][0]["message"]["content"],
                    "model_used": model,
                    "tokens_used": {
                        "prompt": data.get("usage", {}).get("prompt_tokens"),
                        "completion": data.get("usage", {}).get("completion_tokens")
                    }
                }
    
    async def analyze_image(
        self,
        image_data: bytes,
        prompt: str,
        task_type: str = "image_analysis",
        force_pro: bool = False
    ) -> Dict[str, Any]:
        """Analyze image with text prompt"""
        # Use Claude for vision tasks
        model = ModelTier.PRO.value
        
        # Encode image to base64
        image_b64 = base64.b64encode(image_data).decode()
        
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_b64}"
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }
        ]
        
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": 4096
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.BASE_URL}/chat/completions",
                headers=self.headers,
                json=payload
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"OpenRouter API error: {response.status} - {error_text}")
                
                data = await response.json()
                
                return {
                    "text": data["choices"][0]["message"]["content"],
                    "model_used": model
                }
    
    async def extract_structured_data(
        self,
        content: str,
        schema: Dict[str, Any],
        task_type: str = "extraction"
    ) -> Dict[str, Any]:
        """Extract structured data based on schema"""
        prompt = f"""Extract the following information from the text below.
Return ONLY a valid JSON object matching this schema:
{json.dumps(schema, indent=2)}

Text to analyze:
{content}

Return only the JSON object, no additional text."""

        result = await self.generate_text(
            prompt=prompt,
            task_type=task_type,
            temperature=0.1  # Lower temperature for structured extraction
        )
        
        # Parse JSON from response
        try:
            text = result["text"]
            # Clean up potential markdown formatting
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            
            extracted_data = json.loads(text.strip())
            result["extracted_data"] = extracted_data
        except json.JSONDecodeError:
            result["extracted_data"] = None
            result["parse_error"] = "Failed to parse JSON from response"
        
        return result


# Global client instance
_client: Optional[GeminiClient] = None


def get_gemini_client() -> GeminiClient:
    """Get or create AI client instance"""
    global _client
    if _client is None:
        _client = GeminiClient()
    return _client
