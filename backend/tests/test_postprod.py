import pytest  # type: ignore[import]
from datetime import datetime, timezone

from backend.services.postprod_svc import (
    ensure_postprod_job_initialized,
    start_postprod_if_ready,
    POST_PROD_STAGE_READY_FOR_JOB,
    POST_PROD_STAGE_JOB_CREATED,
)


def _merge_into(target, updates):
    for key, value in updates.items():
        parts = key.split('.')
        ref = target
        for part in parts[:-1]:
            ref = ref.setdefault(part, {})
        ref[parts[-1]] = value
    return target


class StubSnapshot:
    def __init__(self, data=None):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return self._data


class StubDocument:
    def __init__(self, db, path_parts):
        self._db = db
        self._path_parts = path_parts

    @property
    def path(self):
        return '/'.join(self._path_parts)

    def get(self):
        return StubSnapshot(self._db.storage.get(self.path))

    def set(self, data, merge=False):
        if merge and self.path in self._db.storage:
            current = dict(self._db.storage[self.path])
            current.update(data)
            self._db.storage[self.path] = current
        else:
            self._db.storage[self.path] = dict(data)

    def update(self, data):
        if self.path not in self._db.storage:
            raise ValueError('document does not exist')
        current = dict(self._db.storage[self.path])
        _merge_into(current, data)
        self._db.storage[self.path] = current

    def collection(self, name):
        return StubCollection(self._db, self._path_parts + [name])


class StubCollection:
    def __init__(self, db, path_parts):
        self._db = db
        self._path_parts = path_parts

    def document(self, doc_id=None):
        if doc_id is None:
            doc_id = f'auto_{len(self._db.auto_ids)}'
            self._db.auto_ids.append(doc_id)
        return StubDocument(self._db, self._path_parts + [doc_id])

    def stream(self):
        prefix = '/'.join(self._path_parts) + '/'
        docs = []
        for path in list(self._db.storage.keys()):
            if path.startswith(prefix):
                remainder = path[len(prefix):]
                if remainder and '/' not in remainder:
                    docs.append(StubDocument(self._db, self._path_parts + [remainder]))
        return docs


class DummyDB:
    def __init__(self, seed=None):
        self.storage = seed.copy() if seed else {}
        self.auto_ids = []

    def collection(self, *parts):
        return StubCollection(self, list(parts))

    def client(self):
        return self


@pytest.mark.asyncio
async def test_start_postprod_if_ready_initializes_stage_defaults():
    db = DummyDB({'organizations/org1/events/evt1': {'postProduction': {}}})
    result = await start_postprod_if_ready(db, 'org1', 'evt1')
    assert result['manualInitRequired'] is True
    updated = db.collection('organizations', 'org1', 'events').document('evt1').get().to_dict()
    assert updated['postProduction']['stage'] == 'DATA_COLLECTION'


@pytest.mark.asyncio
async def test_ensure_postprod_job_requires_ready_stage():
    db = DummyDB({
        'organizations/org1/events/evt1': {
            'postProduction': {'stage': 'DATA_COLLECTION'},
            'dataIntake': {'submissions': {}},
        }
    })

    result = await ensure_postprod_job_initialized(db, 'org1', 'evt1', actor_uid='admin1')
    assert result['created'] is False
    assert result['reason'] == 'stage-not-ready'


@pytest.mark.asyncio
async def test_ensure_postprod_job_creates_job_with_summary():
    ready_at = datetime.now(timezone.utc)
    submissions = {
        'teammate1': {
            'status': 'APPROVED',
            'deviceCount': 2,
            'estimatedDataSize': '100GB',
            'submittedByName': 'Teammate One',
        }
    }
    seed = {
        'organizations/org1/events/evt1': {
            'postProduction': {
                'stage': POST_PROD_STAGE_READY_FOR_JOB,
                'approvalSummary': {'required': 1},
                'readyAt': ready_at,
            },
            'dataIntake': {'submissions': submissions},
            'clientName': 'Client A',
            'assignedCrew': [],
        }
    }
    db = DummyDB(seed)

    result = await ensure_postprod_job_initialized(db, 'org1', 'evt1', actor_uid='admin1')
    assert result['created'] is True
    assert result['stage'] == POST_PROD_STAGE_JOB_CREATED
    job_snapshot = db.collection('organizations', 'org1', 'events').document('evt1').collection('postprodJob').document('job').get()
    assert job_snapshot.exists
    job_data = job_snapshot.to_dict()
    assert job_data['intakeSummary']['approvedCount'] == 1
    assert job_data['photo']['state'] == 'PHOTO_ASSIGNED'

    event_snapshot = db.collection('organizations', 'org1', 'events').document('evt1').get()
    event_data = event_snapshot.to_dict()
    assert event_data['postProduction']['stage'] == POST_PROD_STAGE_JOB_CREATED
