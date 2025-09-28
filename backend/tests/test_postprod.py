import datetime
import pytest  # type: ignore[import]
from unittest.mock import MagicMock
from backend.services.postprod_svc import start_postprod_if_ready
from backend.routers.postprod import _build_submission_summary

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


class FakeEventDocument:
    def __init__(self, data, exists=True):
        self._data = data
        self.exists = exists
    def get(self):
        return self
    def to_dict(self):
        return self._data


class FakeEventCollection:
    def __init__(self, data, exists=True):
        self._data = data
        self._exists = exists
    def document(self, _event_id):
        return FakeEventDocument(self._data, self._exists)


class FakeDB:
    def __init__(self, event_data=None, exists=True):
        self._event_data = event_data or {}
        self._exists = exists
    def collection(self, *parts):
        return FakeEventCollection(self._event_data, self._exists)


def test_build_submission_summary_with_event_data():
    event_data = {
        'assignedCrew': [
            {'userId': 'u1', 'name': 'Alice'},
            {'userId': 'u2', 'name': 'Bri'}
        ],
        'dataIntake': {
            'submissions': {
                'u1': {'status': 'APPROVED', 'submittedByName': 'Alice'},
                'u2': {'status': 'PENDING', 'submittedByName': 'Bri'}
            },
            'totalRequired': 2,
            'lastSubmittedAt': datetime.datetime(2025, 1, 1, tzinfo=datetime.timezone.utc)
        }
    }
    job = {'aiSummary': {}, 'intakeSummary': {}}
    db = FakeDB(event_data)

    summary = _build_submission_summary(db, 'org1', 'evt1', job)

    assert summary['assigned'] == 2
    assert summary['submitted'] == 2
    assert summary['approved'] == 1
    assert summary['pending'] == 1
    assert 'Bri' in summary['pendingNames']
    assert summary['isReady'] is False
    assert summary['lastUpdate'].startswith('2025-01-01')


def test_build_submission_summary_falls_back_to_job_snapshot():
    job = {
        'aiSummary': {
            'assignedCrew': [
                {'userId': 'u1', 'name': 'Alex'},
                {'userId': 'u2', 'name': 'Blair'}
            ]
        },
        'intakeSummary': {
            'requiredCount': 2,
            'approvedSubmissions': [
                {'submitterId': 'u1', 'submitterName': 'Alex', 'approvedAt': datetime.datetime(2025, 2, 1, tzinfo=datetime.timezone.utc)}
            ]
        }
    }
    db = FakeDB({}, exists=False)

    summary = _build_submission_summary(db, 'org1', 'evt1', job)

    assert summary['assigned'] == 2
    assert summary['submitted'] == 1
    assert summary['approved'] == 1
    assert summary['remaining'] == 1
    assert 'Blair' in summary['pendingNames']
