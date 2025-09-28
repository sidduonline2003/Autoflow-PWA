import copy
from dataclasses import dataclass

import pytest

from backend.routers import data_submissions


class FakeIncrement:
    def __init__(self, amount: int):
        self.amount = amount


class FakeArrayUnion:
    def __init__(self, values):
        self.values = list(values)


class FakeDelete:
    pass


@dataclass
class FakeFieldFilter:
    field: str
    op: str
    value: object


class FakeDocumentSnapshot:
    def __init__(self, path, data, exists):
        self._path = path
        self._data = data
        self.exists = exists

    @property
    def id(self):
        return self._path[-1]

    def to_dict(self):
        return copy.deepcopy(self._data)


class FakeDocumentRef:
    def __init__(self, client, path):
        self._client = client
        self.path = path

    @property
    def id(self):
        return self.path[-1]

    def get(self):
        data = copy.deepcopy(self._client._documents.get(self.path, {}))
        exists = self._client._exists.get(self.path, False)
        return FakeDocumentSnapshot(self.path, data, exists)

    def set(self, data):
        self._client._documents[self.path] = copy.deepcopy(data)
        self._client._exists[self.path] = True

    def update(self, updates):
        if not self._client._exists.get(self.path):
            self._client._documents[self.path] = {}
            self._client._exists[self.path] = True
        doc = self._client._documents[self.path]
        apply_updates(doc, updates)

    def collection(self, *segments):
        return FakeCollection(self._client, self.path + segments)


class FakeCollection:
    def __init__(self, client, path):
        self._client = client
        self.path = path

    def document(self, doc_id=None):
        if doc_id is None:
            doc_id = self._client.generate_id()
        return FakeDocumentRef(self._client, self.path + (doc_id,))

    def stream(self):
        prefix_len = len(self.path)
        snapshots = []
        for stored_path, data in self._client._documents.items():
            if stored_path[:prefix_len] == self.path and len(stored_path) == prefix_len + 1:
                exists = self._client._exists.get(stored_path, False)
                snapshots.append(FakeDocumentSnapshot(stored_path, copy.deepcopy(data), exists))
        return snapshots


class FakeFirestoreClient:
    def __init__(self):
        self._documents = {}
        self._exists = {}
        self._auto_counter = 0
        self.delete_sentinel = FakeDelete()

    def collection(self, *path):
        return FakeCollection(self, path)

    def generate_id(self):
        self._auto_counter += 1
        return f"auto{self._auto_counter}"

    def seed_document(self, path, data):
        self._documents[path] = copy.deepcopy(data)
        self._exists[path] = True


class FakeFirestoreModule:
    FieldFilter = FakeFieldFilter

    def __init__(self, client: FakeFirestoreClient):
        self._client = client
        self.DELETE_FIELD = client.delete_sentinel

    def client(self):
        return self._client

    @staticmethod
    def Increment(amount):
        return FakeIncrement(amount)

    @staticmethod
    def ArrayUnion(values):
        return FakeArrayUnion(values)


def apply_updates(target, updates):
    for key, value in updates.items():
        segments = key.split('.')
        cursor = target
        for segment in segments[:-1]:
            if segment not in cursor or not isinstance(cursor[segment], dict):
                cursor[segment] = {}
            cursor = cursor[segment]
        final_key = segments[-1]
        if isinstance(value, FakeIncrement):
            current = cursor.get(final_key, 0) or 0
            cursor[final_key] = current + value.amount
        elif isinstance(value, FakeArrayUnion):
            existing = cursor.get(final_key) or []
            existing = list(existing)
            for item in value.values:
                if item not in existing:
                    existing.append(item)
            cursor[final_key] = existing
        elif isinstance(value, FakeDelete):
            cursor.pop(final_key, None)
        else:
            cursor[final_key] = copy.deepcopy(value)


def seed_base_data(client: FakeFirestoreClient):
    client.seed_document(
        ('organizations', 'org1', 'clients', 'client1'),
        {'profile': {'name': 'Client One'}}
    )
    client.seed_document(
        ('organizations', 'org1', 'clients', 'client1', 'events', 'event1'),
        {
            'name': 'Event One',
            'clientName': 'Client One',
            'status': 'COMPLETED',
            'assignedCrew': [{'userId': 'user1', 'name': 'User One', 'role': 'lead'}],
            'intakeStats': {'pendingApproval': 0, 'confirmedBatches': 0, 'requiredBatches': 1},
            'dataIntake': {}
        }
    )
    client.seed_document(
        ('organizations', 'org1', 'team', 'user1'),
        {'name': 'User One'}
    )


@pytest.mark.asyncio
async def test_create_submission_batch_sets_pending_state(monkeypatch):
    client = FakeFirestoreClient()
    seed_base_data(client)
    firestore_module = FakeFirestoreModule(client)
    monkeypatch.setattr(data_submissions, 'firestore', firestore_module)

    submission = data_submissions.DataBatchSubmission(
        eventId='event1',
        physicalHandoverDate='2025-09-27',
        storageDevices=[data_submissions.StorageDevice(type='SSD', brand='Samsung', model='T7', capacity='1TB')],
        notes='Primary drive',
        estimatedDataSize='512GB',
        handoffReference='Locker 12'
    )

    result = await data_submissions.create_submission_batch(submission, {'orgId': 'org1', 'uid': 'user1'})
    batch_id = result['batchId']

    event_doc = client.collection('organizations', 'org1', 'clients', 'client1', 'events').document('event1').get().to_dict()
    assert event_doc['deliverableStatus'] == 'PENDING_REVIEW'
    assert event_doc['deliverablePendingBatchId'] == batch_id
    assert event_doc['deliverableSubmission']['handoffReference'] == 'Locker 12'
    assert event_doc['deliverableSubmission']['deviceCount'] == 1
    assert event_doc['deliverableSubmitted'] is False
    assert event_doc['dataIntake']['status'] == 'PENDING'
    assert event_doc['dataIntake']['handoffReference'] == 'Locker 12'

    batch_doc = client.collection('organizations', 'org1', 'dataBatches').document(batch_id).get().to_dict()
    assert batch_doc['status'] == 'PENDING'
    assert batch_doc['handoffReference'] == 'Locker 12'

    intake = event_doc['dataIntake']
    assert intake['submissions']['user1']['status'] == 'PENDING'
    assert intake['totalRequired'] == 1
    assert event_doc['postProduction']['stage'] == data_submissions.POST_PROD_STAGE_DATA_COLLECTION


@pytest.mark.asyncio
async def test_approve_batch_marks_event_and_storage(monkeypatch):
    client = FakeFirestoreClient()
    seed_base_data(client)
    firestore_module = FakeFirestoreModule(client)
    monkeypatch.setattr(data_submissions, 'firestore', firestore_module)

    # seed storage medium
    client.seed_document(
        ('organizations', 'org1', 'storageMedia', 'storage1'),
        {
            'status': 'available',
            'type': 'SSD',
            'capacity': '1TB',
            'room': 'A',
            'cabinet': '1',
            'shelf': '2',
            'bin': '5'
        }
    )

    submission = data_submissions.DataBatchSubmission(
        eventId='event1',
        physicalHandoverDate='2025-09-27',
        storageDevices=[data_submissions.StorageDevice(type='SSD', brand='Samsung', model='T7', capacity='1TB')],
        notes='Primary drive',
        estimatedDataSize='512GB',
        handoffReference='Locker 99'
    )
    result = await data_submissions.create_submission_batch(submission, {'orgId': 'org1', 'uid': 'user1'})
    batch_id = result['batchId']

    approval = data_submissions.BatchApproval(
        batchId=batch_id,
        action='approve',
        storageMediumId='storage1',
        storageLocation=data_submissions.StorageLocation(room='A', cabinet='1', shelf='2', bin='5', additionalNotes='Vault shelf'),
        notes='Filed in vault'
    )

    await data_submissions.approve_batch(approval, {'orgId': 'org1', 'role': 'data-manager', 'uid': 'dm1'})

    event_doc = client.collection('organizations', 'org1', 'clients', 'client1', 'events').document('event1').get().to_dict()
    assert event_doc['deliverableStatus'] == 'APPROVED'
    assert event_doc['deliverableSubmitted'] is True
    assert 'deliverablePendingBatchId' not in event_doc
    assert event_doc['deliverableBatchId'] == batch_id
    assert event_doc['deliverableSubmission']['lastApprovedBy'] == 'dm1'
    assert event_doc['deliverableSubmission']['handoffReference'] == 'Locker 99'
    assert event_doc['dataIntake']['status'] == 'READY_FOR_POST_PROD'
    assert event_doc['postProduction']['stage'] == data_submissions.POST_PROD_STAGE_READY_FOR_JOB
    assert event_doc['postProduction']['approvalSummary']['approved'] == 1
    assert event_doc['postProduction']['approvalSummary']['required'] == 1
    assert event_doc['dataIntake']['submissions']['user1']['status'] == 'APPROVED'
    assert event_doc['postProduction'].get('readyAt') is not None

    storage_doc = client.collection('organizations', 'org1', 'storageMedia').document('storage1').get().to_dict()
    assert storage_doc['status'] == 'assigned'
    assert storage_doc['assignedBatchId'] == batch_id

    batch_doc = client.collection('organizations', 'org1', 'dataBatches').document(batch_id).get().to_dict()
    assert batch_doc['status'] == 'CONFIRMED'
    assert batch_doc['dmDecision'] == 'APPROVED'


@pytest.mark.asyncio
async def test_reject_batch_sets_rejected_state(monkeypatch):
    client = FakeFirestoreClient()
    seed_base_data(client)
    firestore_module = FakeFirestoreModule(client)
    monkeypatch.setattr(data_submissions, 'firestore', firestore_module)

    submission = data_submissions.DataBatchSubmission(
        eventId='event1',
        physicalHandoverDate='2025-09-27',
        storageDevices=[data_submissions.StorageDevice(type='SD Card', brand='Sony', model='G', capacity='128GB')],
        notes='Backup card',
        handoffReference='Crew dropbox'
    )
    result = await data_submissions.create_submission_batch(submission, {'orgId': 'org1', 'uid': 'user1'})
    batch_id = result['batchId']

    rejection = data_submissions.BatchApproval(
        batchId=batch_id,
        action='reject',
        rejectionReason='Missing signature',
        notes='Please redo intake form'
    )

    await data_submissions.approve_batch(rejection, {'orgId': 'org1', 'role': 'data-manager', 'uid': 'dm2'})

    event_doc = client.collection('organizations', 'org1', 'clients', 'client1', 'events').document('event1').get().to_dict()
    assert event_doc['deliverableStatus'] == 'REJECTED'
    assert event_doc['deliverableSubmitted'] is False
    assert 'deliverablePendingBatchId' not in event_doc
    assert event_doc['deliverableSubmission']['lastRejectedReason'] == 'Missing signature'
    assert event_doc['deliverableSubmission']['handoffReference'] == 'Crew dropbox'
    assert event_doc['dataIntake']['status'] == 'REJECTED'
    assert event_doc['dataIntake']['submissions']['user1']['status'] == 'REJECTED'
    assert event_doc['postProduction']['stage'] == data_submissions.POST_PROD_STAGE_DATA_COLLECTION

    batch_doc = client.collection('organizations', 'org1', 'dataBatches').document(batch_id).get().to_dict()
    assert batch_doc['status'] == 'REJECTED'
    assert batch_doc['dmDecision'] == 'REJECTED'