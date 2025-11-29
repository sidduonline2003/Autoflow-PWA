"""
OpenRouter AI Client - Smart routing between different models
Uses OpenRouter API for flexible model selection
"""

import os
import aiohttp
from typing import Optional, List, Dict, Any
from enum import Enum
import base64


class ModelTier(Enum):
    # Fast models for simple tasks
    FAST = "meta-llama/llama-3.1-8b-instruct"
    # Standard models for most tasks
    STANDARD = "anthropic/claude-3.5-sonnet"
    # Pro models for complex tasks
    PRO = "anthropic/claude-3.5-sonnet"
    # Vision models for image analysis
    VISION = "anthropic/claude-3.5-sonnet"


class OpenRouterClient:
    """OpenRouter API client with smart model routing"""
    
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
        
        self.simple_tasks = [
            "simple_query",
            "formatting",
            "basic_extraction",
            "summarization"
        ]
    
    def _select_model(self, task_type: str, force_pro: bool = False, has_image: bool = False) -> str:
        """Select appropriate model based on task complexity"""
        if has_image:
            return ModelTier.VISION.value
        if force_pro or task_type in self.complex_tasks:
            return ModelTier.PRO.value
        if task_type in self.simple_tasks:
            return ModelTier.FAST.value
        return ModelTier.STANDARD.value
    
    async def generate_text(
        self,
        prompt: str,
        task_type: str = "general",
        force_pro: bool = False,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate text response"""
        model = self._select_model(task_type, force_pro)
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        payload = {
            "model": model,
            "messages": messages,
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
        force_pro: bool = False,
        mime_type: str = "image/jpeg"
    ) -> Dict[str, Any]:
        """Analyze image with text prompt"""
        model = self._select_model(task_type, force_pro, has_image=True)
        
        # Encode image to base64
        image_b64 = base64.b64encode(image_data).decode()
        
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{image_b64}"
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
    
    async def extract_json(
        self,
        prompt: str,
        task_type: str = "extraction",
        force_pro: bool = False
    ) -> Dict[str, Any]:
        """Extract structured JSON from text"""
        model = self._select_model(task_type, force_pro)
        
        system_prompt = """You are a JSON extraction assistant. 
        Always respond with valid JSON only. No markdown, no explanations.
        If you cannot extract the requested data, return an empty object {}."""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
        
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.1,  # Low temperature for consistent JSON
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
                text = data["choices"][0]["message"]["content"]
                
                # Try to parse as JSON
                import json
                try:
                    parsed = json.loads(text)
                except json.JSONDecodeError:
                    # Try to extract JSON from text
                    import re
                    json_match = re.search(r'\{[\s\S]*\}', text)
                    if json_match:
                        parsed = json.loads(json_match.group())
                    else:
                        parsed = {"raw_text": text}
                
                return {
                    "data": parsed,
                    "model_used": model
                }
    
    async def get_available_models(self) -> List[Dict[str, Any]]:
        """Get list of available models from OpenRouter"""
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.BASE_URL}/models",
                headers=self.headers
            ) as response:
                if response.status != 200:
                    return []
                data = await response.json()
                return data.get("data", [])


# Create singleton instance
_client: Optional[OpenRouterClient] = None


def get_ai_client() -> OpenRouterClient:
    """Get or create AI client singleton"""
    global _client
    if _client is None:
        _client = OpenRouterClient()
    return _client
