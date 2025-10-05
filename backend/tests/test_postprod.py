import pytest  # type: ignore[import]
from unittest.mock import MagicMock
from backend.services.postprod_svc import start_postprod_if_ready

class DummyDoc:
    def __init__(self, data=None, exists=True):
        self._data = data or {}
        self.exists = exists
    def to_dict(self): return self._data
    def get(self, *args, **kwargs): return self
    def set(self, data, merge=False): self._data.update(data)
    def update(self, data): self._data.update(data)
    def collection(self, name): return self
    def document(self, name): return self

class DummyDB:
    def __init__(self, event_data):
        self.event_doc = DummyDoc(event_data)
        self.job_created = False
    def collection(self, *parts): return self
    def document(self, *parts): return self.event_doc
    def transaction(self): return MagicMock()

@pytest.mark.asyncio
async def test_prepare_postprod_returns_manual_flag():
    db = DummyDB({'intake': {'status': 'DATA_INTAKE_COMPLETE'}})
    result = await start_postprod_if_ready(db, 'org1', 'evt1')
    assert result['created'] is False
    assert result['manualInitRequired'] is True

@pytest.mark.asyncio
async def test_prepare_postprod_idempotent():
    db = DummyDB({'intake': {'status': 'DATA_INTAKE_COMPLETE'}})
    await start_postprod_if_ready(db, 'org1', 'evt1')
    result2 = await start_postprod_if_ready(db, 'org1', 'evt1')
    assert result2['created'] is False
    assert result2['manualInitRequired'] is True
