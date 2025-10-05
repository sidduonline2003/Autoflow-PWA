import asyncio
import copy
import math
import time
from collections import defaultdict
from typing import Dict, Iterable, Optional, Tuple

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.api_core import exceptions as g_exceptions

from backend.routers import team
from backend.dependencies import get_current_user
from backend.services import teammate_codes


class FakeDocumentSnapshot:
    def __init__(self, path: Tuple[str, ...], data: Dict, exists: bool):
        self._path = path
        self._data = data
        self.exists = exists

    def to_dict(self) -> Dict:
        return copy.deepcopy(self._data)

    @property
    def id(self) -> str:
        return self._path[-1]


class FakeDocumentRef:
    def __init__(self, client: "FakeFirestoreClient", path: Tuple[str, ...]):
        self._client = client
        self._path = path

    @property
    def id(self) -> str:
        return self._path[-1]

    @property
    def path(self) -> str:
        return "/".join(self._path)

    def get(self, transaction: Optional["FakeTransaction"] = None) -> FakeDocumentSnapshot:
        if transaction is not None:
            data, exists = transaction._get_doc(self._path)
        else:
            data, exists = self._client._get_doc(self._path)
        return FakeDocumentSnapshot(self._path, data if exists else {}, exists)

    def collection(self, *segments: str) -> "FakeCollection":
        return FakeCollection(self._client, self._path + tuple(segments))

    def set(self, data: Dict, merge: bool = False, **kwargs):
        existing, exists = self._client._get_doc(self._path)
        if merge and exists:
            payload = _deep_merge(existing, data)
        else:
            payload = copy.deepcopy(data)
        self._client._set_doc(self._path, payload)


class FakeCollection:
    def __init__(self, client: "FakeFirestoreClient", path: Tuple[str, ...]):
        self._client = client
        self._path = path

    def document(self, doc_id: Optional[str] = None) -> FakeDocumentRef:
        if doc_id is None:
            doc_id = self._client._generate_id()
        return FakeDocumentRef(self._client, self._path + (doc_id,))

    def get(self):
        return list(self._iter_documents())

    def _iter_documents(self):
        prefix_len = len(self._path)
        for path, data in self._client._documents.items():
            if len(path) == prefix_len + 1 and path[:prefix_len] == self._path and self._client._exists.get(path, False):
                yield FakeDocumentSnapshot(path, copy.deepcopy(data), True)

    def stream(self):
        return list(self._iter_documents())

    def where(self, field: str, op: str, value):
        if op != "==":
            raise NotImplementedError("FakeFirestoreClient only supports equality filters")
        return FakeQuery(self._client, self._path, filters=[(field, value)])


class FakeQuery:
    def __init__(self, client: "FakeFirestoreClient", path: Tuple[str, ...], filters: Optional[list[tuple[str, object]]] = None, limit_value: Optional[int] = None):
        self._client = client
        self._path = path
        self._filters = filters or []
        self._limit = limit_value

    def where(self, field: str, op: str, value):
        if op != "==":
            raise NotImplementedError("FakeFirestoreClient only supports equality filters")
        return FakeQuery(self._client, self._path, filters=self._filters + [(field, value)], limit_value=self._limit)

    def limit(self, count: int):
        return FakeQuery(self._client, self._path, filters=self._filters, limit_value=count)

    def stream(self):
        results = []
        collection = FakeCollection(self._client, self._path)
        for snapshot in collection._iter_documents():
            data = snapshot.to_dict()
            matches = True
            for field, expected in self._filters:
                if data.get(field) != expected:
                    matches = False
                    break
            if not matches:
                continue
            results.append(FakeDocumentSnapshot(snapshot._path, data, True))
            if self._limit is not None and len(results) >= self._limit:
                break
        return results

def _deep_merge(dest: Dict, updates: Dict) -> Dict:
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(dest.get(key), dict):
            dest[key] = _deep_merge(dest[key], value)
        else:
            dest[key] = copy.deepcopy(value)
    return dest


class FakeTransaction:
    def __init__(self, client: "FakeFirestoreClient"):
        self._client = client
        self._write_buffer: Dict[Tuple[str, ...], Dict] = {}
        self._write_exists: Dict[Tuple[str, ...], bool] = {}
        self._read_paths: set[Tuple[str, ...]] = set()
        self._base_versions: Dict[Tuple[str, ...], int] = {}

    def _get_doc(self, path: Tuple[str, ...]):
        if path in self._write_buffer:
            data = copy.deepcopy(self._write_buffer[path])
            exists = self._write_exists[path]
        else:
            data, exists = self._client._get_doc(path)
        if path not in self._base_versions:
            self._base_versions[path] = self._client._versions.get(path, 0)
        self._read_paths.add(path)
        return data, exists

    def set(self, doc_ref: FakeDocumentRef, data: Dict, merge: bool = False, **kwargs):
        path = doc_ref._path
        if merge:
            base, _ = self._get_doc(path)
            merged = _deep_merge(base, data)
            self._write_buffer[path] = merged
            self._write_exists[path] = True
        else:
            self._write_buffer[path] = copy.deepcopy(data)
            self._write_exists[path] = True

    def commit(self):
        if self._client._abort_plan:
            should_abort = self._client._abort_plan.pop(0)
            if should_abort:
                raise g_exceptions.Aborted("forced abort")

        for path in self._read_paths:
            if self._client._versions.get(path, 0) != self._base_versions.get(path, 0):
                raise g_exceptions.Aborted(f"conflict on {'/'.join(path)}")

        for path, data in self._write_buffer.items():
            self._client._set_doc(path, data)

        self._write_buffer.clear()
        self._write_exists.clear()
        self._read_paths.clear()
        self._base_versions.clear()
        return []

    def rollback(self):
        self._write_buffer.clear()
        self._write_exists.clear()
        self._read_paths.clear()
        self._base_versions.clear()


class FakeFirestoreClient:
    def __init__(self):
        self._documents: Dict[Tuple[str, ...], Dict] = {}
        self._exists: Dict[Tuple[str, ...], bool] = {}
        self._versions: Dict[Tuple[str, ...], int] = {}
        self._auto_counter = 0
        self._abort_plan: list[bool] = []

    def _generate_id(self) -> str:
        self._auto_counter += 1
        return f"auto{self._auto_counter}"

    def collection(self, *segments: str) -> FakeCollection:
        return FakeCollection(self, tuple(segments))

    def transaction(self) -> FakeTransaction:
        return FakeTransaction(self)

    def _get_doc(self, path: Tuple[str, ...]):
        exists = self._exists.get(path, False)
        data = copy.deepcopy(self._documents.get(path, {})) if exists else {}
        return data, exists

    def _set_doc(self, path: Tuple[str, ...], data: Dict):
        self._documents[path] = copy.deepcopy(data)
        self._exists[path] = True
        self._versions[path] = self._versions.get(path, 0) + 1

    def seed_document(self, path: Iterable[str], data: Dict):
        tuple_path = tuple(path)
        self._documents[tuple_path] = copy.deepcopy(data)
        self._exists[tuple_path] = True
        self._versions[tuple_path] = self._versions.get(tuple_path, 0) + 1

    def plan_abort(self, pattern: Iterable[bool]):
        self._abort_plan.extend(pattern)

    def get_document(self, path: Iterable[str]):
        tuple_path = tuple(path)
        exists = self._exists.get(tuple_path, False)
        data = copy.deepcopy(self._documents.get(tuple_path, {})) if exists else None
        return exists, data


class FakeFirestoreModule:
    SERVER_TIMESTAMP = object()

    def __init__(self):
        self._client = FakeFirestoreClient()

    def client(self) -> FakeFirestoreClient:
        return self._client
    
    @staticmethod
    def transactional(func):
        """Decorator that mimics @firestore.transactional."""
        def wrapper(transaction):
            # Simulate transactional behavior by auto-committing
            result = func(transaction)
            transaction.commit()
            return result
        return wrapper


@pytest.fixture
def fake_firestore():
    module = FakeFirestoreModule()
    return module


def _seed_org(module: FakeFirestoreModule, org_code: str, org_id: str):
    module.client().seed_document(("indexes", "orgCodes", "codes", org_code), {"orgId": org_id})


@pytest.mark.asyncio
async def test_allocate_first_code_assigns_profile(fake_firestore):
    _seed_org(fake_firestore, "ASTR", "org-1")
    result = await teammate_codes.allocate_teammate_code(fake_firestore, "astr", "editor", "org-1", "uid-123", base_delay=0.001)
    assert result.code == "ASTR-EDITOR-00001"
    assert result.number == 1
    exists, data = fake_firestore.client().get_document(("indexes", "teammateCodes", "codes", "ASTR-EDITOR-00001"))
    assert exists
    assert data["orgId"] == "org-1"
    assert data["role"] == "EDITOR"
    assert data["number"] == 1
    assert data["uid"] == "uid-123"
    exists, teammate = fake_firestore.client().get_document(("organizations", "org-1", "teammates", "uid-123"))
    assert exists
    assert teammate["profile"]["employeeCode"] == "ASTR-EDITOR-00001"

    exists, team_member = fake_firestore.client().get_document(("organizations", "org-1", "team", "uid-123"))
    assert exists
    assert team_member["employeeCode"] == "ASTR-EDITOR-00001"


    exists, counter = fake_firestore.client().get_document(("organizations", "org-1", "counters", "teammates", "roles", "EDITOR"))
    assert exists
    assert counter["next"] == 2


@pytest.mark.asyncio
async def test_allocate_sequential_codes(fake_firestore):
    _seed_org(fake_firestore, "ASTR", "org-1")
    first = await teammate_codes.allocate_teammate_code(fake_firestore, "ASTR", "EDITOR", "org-1", None, base_delay=0.001)
    second = await teammate_codes.allocate_teammate_code(fake_firestore, "ASTR", "EDITOR", "org-1", None, base_delay=0.001)
    assert first.code == "ASTR-EDITOR-00001"
    assert second.code == "ASTR-EDITOR-00002"


@pytest.mark.asyncio
async def test_concurrent_allocations_get_distinct_codes(fake_firestore):
    _seed_org(fake_firestore, "ASTR", "org-1")

    async def allocate():
        return await teammate_codes.allocate_teammate_code(fake_firestore, "ASTR", "EDITOR", "org-1", None, base_delay=0.001)

    results = await asyncio.gather(allocate(), allocate())
    codes = sorted(r.code for r in results)
    assert codes == ["ASTR-EDITOR-00001", "ASTR-EDITOR-00002"]


@pytest.mark.asyncio
async def test_idempotent_when_code_exists(fake_firestore):
    _seed_org(fake_firestore, "ASTR", "org-1")
    fake_firestore.client().seed_document(("indexes", "teammateCodes", "codes", "ASTR-EDITOR-00001"), {"orgId": "org-1", "role": "EDITOR", "number": 1, "code": "ASTR-EDITOR-00001"})
    fake_firestore.client().seed_document(("organizations", "org-1", "counters", "teammates", "roles", "EDITOR"), {"next": 1})
    result = await teammate_codes.allocate_teammate_code(fake_firestore, "ASTR", "EDITOR", "org-1", None, base_delay=0.001)
    assert result.code == "ASTR-EDITOR-00002"
    exists, counter = fake_firestore.client().get_document(("organizations", "org-1", "counters", "teammates", "roles", "EDITOR"))
    assert exists
    assert counter["next"] == 3


@pytest.mark.asyncio
async def test_missing_org_code_raises(fake_firestore):
    with pytest.raises(teammate_codes.OrgCodeNotFoundError):
        await teammate_codes.allocate_teammate_code(fake_firestore, "UNKNOWN", "EDITOR", "org-1", None, base_delay=0.001)


@pytest.mark.asyncio
async def test_abort_retries_and_succeeds(fake_firestore):
    _seed_org(fake_firestore, "ASTR", "org-1")
    fake_firestore.client().plan_abort([True, False])
    result = await teammate_codes.allocate_teammate_code(fake_firestore, "ASTR", "EDITOR", "org-1", None, base_delay=0.001)
    assert result.attempts == 2
    assert result.code == "ASTR-EDITOR-00001"


@pytest.mark.asyncio
async def test_integration_allocates_one_thousand_codes_with_stable_latency(fake_firestore):
    _seed_org(fake_firestore, "ASTR", "org-1")
    roles = ["EDITOR", "PRODUCER", "QA"]
    latencies: Dict[str, list[float]] = defaultdict(list)
    semaphore = asyncio.Semaphore(32)

    async def allocate(idx: int):
        role = roles[idx % len(roles)]
        async with semaphore:
            start = time.perf_counter()
            result = await teammate_codes.allocate_teammate_code(
                fake_firestore,
                "ASTR",
                role,
                "org-1",
                None,
                base_delay=0.0005,
            )
            elapsed_ms = (time.perf_counter() - start) * 1000
            latencies[role].append(elapsed_ms)
            return result

    results = await asyncio.gather(*(allocate(i) for i in range(1000)))
    assert len({r.code for r in results}) == 1000

    for role, samples in latencies.items():
        samples.sort()
        index = max(int(math.ceil(len(samples) * 0.95)) - 1, 0)
        p95 = samples[index]
        assert p95 < 15, f"p95 latency too high for {role}: {p95}ms"


def _build_test_app():
    app = FastAPI()
    app.include_router(team.router)
    return app


@pytest.fixture
def test_client(fake_firestore, monkeypatch):
    app = _build_test_app()

    async def admin_user():
        return {"orgId": "org-1", "role": "admin", "uid": "admin", "orgCode": "ASTR"}

    app.dependency_overrides[get_current_user] = admin_user
    monkeypatch.setattr(team, "firestore", fake_firestore)
    team._ORG_CODE_CACHE.clear()
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def non_admin_client(fake_firestore, monkeypatch):
    app = _build_test_app()

    async def member_user():
        return {"orgId": "org-1", "role": "member", "uid": "user"}

    app.dependency_overrides[get_current_user] = member_user
    monkeypatch.setattr(team, "firestore", fake_firestore)
    team._ORG_CODE_CACHE.clear()
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def test_endpoint_requires_admin(non_admin_client):
    response = non_admin_client.post("/team/codes", json={"orgCode": "ASTR", "role": "EDITOR"})
    assert response.status_code == 403


def test_endpoint_allocates_code(test_client, fake_firestore):
    _seed_org(fake_firestore, "ASTR", "org-1")
    response = test_client.post("/team/codes", json={"orgCode": "ASTR", "role": "EDITOR", "teammateUid": "uid-999"})
    assert response.status_code == 200
    body = response.json()
    assert body["code"] == "ASTR-EDITOR-00001"
    assert body["role"] == "EDITOR"
    assert body["teammateUid"] == "uid-999"
    exists, teammate = fake_firestore.client().get_document(("organizations", "org-1", "teammates", "uid-999"))
    assert exists
    assert teammate["profile"]["employeeCode"] == "ASTR-EDITOR-00001"

    exists, team_member = fake_firestore.client().get_document(("organizations", "org-1", "team", "uid-999"))
    assert exists
    assert team_member["employeeCode"] == "ASTR-EDITOR-00001"


def test_bulk_assign_endpoint_allocates_codes(test_client, fake_firestore):
    _seed_org(fake_firestore, "ASTR", "org-1")
    fake_firestore.client().seed_document(("organizations", "org-1", "team", "uid-123"), {"role": "editor"})

    response = test_client.post("/team/codes/assign", json={"teammateUids": ["uid-123"]})
    assert response.status_code == 200
    payload = response.json()
    assert payload["orgCode"] == "ASTR"
    assert payload["results"] == [
        {"teammateUid": "uid-123", "status": "assigned", "code": "ASTR-EDITOR-00001", "role": "EDITOR", "number": 1}
    ]

    exists, team_member = fake_firestore.client().get_document(("organizations", "org-1", "team", "uid-123"))
    assert exists
    assert team_member["employeeCode"] == "ASTR-EDITOR-00001"


def test_bulk_assign_skips_existing_codes(test_client, fake_firestore):
    _seed_org(fake_firestore, "ASTR", "org-1")
    fake_firestore.client().seed_document(("organizations", "org-1", "team", "uid-321"), {"role": "editor", "employeeCode": "ASTR-EDITOR-00099"})

    response = test_client.post("/team/codes/assign", json={"teammateUids": ["uid-321"]})
    assert response.status_code == 200
    payload = response.json()
    assert payload["results"] == [
        {"teammateUid": "uid-321", "status": "skipped", "code": "ASTR-EDITOR-00099"}
    ]


def test_bulk_assign_backfills_org_code_from_org_document(test_client, fake_firestore):
    fake_firestore.client().seed_document(("organizations", "org-1"), {"orgCode": "ASTR"})
    fake_firestore.client().seed_document(("organizations", "org-1", "team", "uid-555"), {"role": "editor"})

    response = test_client.post("/team/codes/assign", json={"teammateUids": ["uid-555"]})
    assert response.status_code == 200
    payload = response.json()
    assert payload["orgCode"] == "ASTR"
    assert payload["results"][0]["status"] == "assigned"

    exists, mapping = fake_firestore.client().get_document(("indexes", "orgCodes", "codes", "ASTR"))
    assert exists
    assert mapping["orgId"] == "org-1"


def test_bulk_assign_backfills_org_code_from_existing_employee_code(test_client, fake_firestore):
    fake_firestore.client().seed_document(("organizations", "org-1", "team", "uid-existing"), {"role": "editor", "employeeCode": "ASTR-EDITOR-00042"})
    fake_firestore.client().seed_document(("organizations", "org-1", "team", "uid-target"), {"role": "editor"})

    response = test_client.post("/team/codes/assign", json={"teammateUids": ["uid-target"]})
    assert response.status_code == 200
    payload = response.json()
    assert payload["orgCode"] == "ASTR"
    assert payload["results"][0]["status"] == "assigned"

    exists, mapping = fake_firestore.client().get_document(("indexes", "orgCodes", "codes", "ASTR"))
    assert exists
    assert mapping["orgId"] == "org-1"


def test_bulk_assign_allows_override_org_code(test_client, fake_firestore):
    fake_firestore.client().seed_document(("organizations", "org-1", "team", "uid-777"), {"role": "editor"})

    response = test_client.post(
        "/team/codes/assign",
        json={"teammateUids": ["uid-777"], "orgCode": "astr"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["orgCode"] == "ASTR"
    assert payload["results"][0]["status"] == "assigned"


def test_bulk_assign_uses_user_claim_org_code(test_client, fake_firestore):
    fake_firestore.client().seed_document(("organizations", "org-1", "team", "uid-888"), {"role": "editor"})

    response = test_client.post("/team/codes/assign", json={"teammateUids": ["uid-888"]})

    assert response.status_code == 200
    payload = response.json()
    assert payload["orgCode"] == "ASTR"


def test_list_team_members_handles_missing_trailing_slash(test_client, fake_firestore):
    fake_firestore.client().seed_document(
        ("organizations", "org-1", "team", "uid-001"),
        {"name": "Alex", "role": "editor", "employeeCode": "ASTR-EDITOR-00001"},
    )

    resp_no_slash = test_client.get("/team")
    assert resp_no_slash.status_code == 200
    body_no_slash = resp_no_slash.json()
    assert isinstance(body_no_slash, list)
    assert body_no_slash and body_no_slash[0]["employeeCode"] == "ASTR-EDITOR-00001"

    resp_with_slash = test_client.get("/team/")
    assert resp_with_slash.status_code == 200
