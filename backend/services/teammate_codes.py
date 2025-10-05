import asyncio
import logging
import random
import time
from dataclasses import dataclass
from typing import Optional

from google.api_core import exceptions as g_exceptions

logger = logging.getLogger(__name__)


@dataclass
class AllocationResult:
    code: str
    org_id: str
    role: str
    number: int
    attempts: int
    latency_ms: float


class OrgCodeNotFoundError(Exception):
    """Raised when an org code cannot be resolved to an organization."""


class OrgMismatchError(Exception):
    """Raised when the resolved organization does not match the caller's org."""


class AllocationExhaustedError(Exception):
    """Raised when the allocation loop cannot find a free code within the transaction."""


class AllocationFailedError(Exception):
    """Raised when allocation cannot complete after retries."""


def _org_code_ref(db, org_code: str):
    return db.collection("indexes").document("orgCodes").collection("codes").document(org_code)


def _counter_ref(db, org_id: str, role: str):
    return (
        db.collection("organizations")
        .document(org_id)
        .collection("counters")
        .document("teammates")
        .collection("roles")
        .document(role)
    )


def _unique_index_ref(db, code: str):
    return db.collection("indexes").document("teammateCodes").collection("codes").document(code)


def _teammate_ref(db, org_id: str, uid: str):
    return db.collection("organizations").document(org_id).collection("teammates").document(uid)


def _team_member_ref(db, org_id: str, uid: str):
    return db.collection("organizations").document(org_id).collection("team").document(uid)


def _format_code(org_code: str, role: str, number: int, pattern: Optional[str] = None) -> str:
    """
    Format employee code using pattern template.
    
    Pattern placeholders:
    - {ORGCODE} - Organization code
    - {ROLE} - Teammate role
    - {NUMBER:5} - Sequential number with 5 digits (configurable)
    
    Default pattern: {ORGCODE}-{ROLE}-{NUMBER:5}
    Example: ORGA-EDITOR-00001
    """
    if not pattern:
        pattern = "{ORGCODE}-{ROLE}-{NUMBER:5}"
    
    result = pattern
    result = result.replace("{ORGCODE}", org_code)
    result = result.replace("{ROLE}", role)
    
    # Handle {NUMBER:digits} placeholder
    import re
    def replace_number(match):
        digits = int(match.group(1)) if match.group(1) else 5
        return str(number).zfill(digits)
    
    result = re.sub(r"\{NUMBER:?(\d*)\}", replace_number, result)
    
    return result


@dataclass
class _TxnResult:
    code: str
    org_id: str
    role: str
    number: int


@dataclass
class _TxnContext:
    """Context passed to transaction function."""
    db: any
    firestore_module: any
    org_code: str
    role: str
    org_id_expected: str
    teammate_uid: Optional[str]
    pattern: Optional[str] = None


def _transaction_allocate(transaction, context: _TxnContext) -> _TxnResult:
    """
    Transactional function compatible with @firestore.transactional decorator.
    Must accept transaction as first parameter.
    """
    db = context.db
    firestore_module = context.firestore_module
    org_code = context.org_code
    role = context.role
    org_id_expected = context.org_id_expected
    teammate_uid = context.teammate_uid

    org_code_snapshot = _org_code_ref(db, org_code).get(transaction=transaction)
    if not org_code_snapshot.exists:
        raise OrgCodeNotFoundError(org_code)

    org_id = (org_code_snapshot.to_dict() or {}).get("orgId")
    if not org_id:
        raise OrgCodeNotFoundError(org_code)
    if org_id != org_id_expected:
        raise OrgMismatchError(org_id)

    counter_ref = _counter_ref(db, org_id, role)
    counter_snapshot = counter_ref.get(transaction=transaction)
    next_number = 1
    if counter_snapshot.exists:
        next_number = int((counter_snapshot.to_dict() or {}).get("next", 1))
        if next_number < 1:
            next_number = 1

    # Attempt allocation without re-running the full transaction.
    # Keep a reasonable upper bound to avoid infinite loops inside the transaction.
    for _ in range(128):
        candidate_number = next_number
        candidate_code = _format_code(org_code, role, candidate_number, context.pattern)
        index_ref = _unique_index_ref(db, candidate_code)
        index_snapshot = index_ref.get(transaction=transaction)

        if not index_snapshot.exists:
            payload = {
                "orgId": org_id,
                "role": role,
                "number": candidate_number,
                "code": candidate_code,
                "createdAt": firestore_module.SERVER_TIMESTAMP,
            }
            payload["orgCode"] = org_code
            if teammate_uid:
                payload["uid"] = teammate_uid

            transaction.set(index_ref, payload)
            transaction.set(
                counter_ref,
                {
                    "orgId": org_id,
                    "role": role,
                    "next": candidate_number + 1,
                    "updatedAt": firestore_module.SERVER_TIMESTAMP,
                },
                merge=True,
            )

            if teammate_uid:
                teammate_ref = _teammate_ref(db, org_id, teammate_uid)
                transaction.set(
                    teammate_ref,
                    {"profile": {"employeeCode": candidate_code}},
                    merge=True,
                )
                team_member_ref = _team_member_ref(db, org_id, teammate_uid)
                transaction.set(
                    team_member_ref,
                    {
                        "employeeCode": candidate_code,
                        "profile": {"employeeCode": candidate_code},
                        "orgId": org_id,
                        "role": role,
                        "codeGeneratedAt": firestore_module.SERVER_TIMESTAMP,
                    },
                    merge=True,
                )

            return _TxnResult(code=candidate_code, org_id=org_id, role=role, number=candidate_number)

        next_number = max(candidate_number + 1, int((index_snapshot.to_dict() or {}).get("number", candidate_number)) + 1)

    raise AllocationExhaustedError(f"Unable to allocate code for {org_code}-{role}")


async def allocate_teammate_code(
    firestore_module,
    org_code: str,
    role: str,
    expected_org_id: str,
    teammate_uid: Optional[str],
    *,
    pattern: Optional[str] = None,
    max_attempts: int = 6,
    base_delay: float = 0.05,
) -> AllocationResult:
    if not expected_org_id:
        raise ValueError("expected_org_id is required")

    normalized_org_code = org_code.upper()
    normalized_role = role.upper()

    db = firestore_module.client()

    start = time.perf_counter()
    attempt = 0
    last_error: Optional[Exception] = None

    # Create context object to pass to transaction
    context = _TxnContext(
        db=db,
        firestore_module=firestore_module,
        org_code=normalized_org_code,
        role=normalized_role,
        org_id_expected=expected_org_id,
        teammate_uid=teammate_uid,
        pattern=pattern,
    )

    while attempt < max_attempts:
        attempt += 1
        transaction = db.transaction()
        try:
            # Use @firestore.transactional pattern
            @firestore_module.transactional
            def run_transaction(txn):
                return _transaction_allocate(txn, context)
            
            txn_result = run_transaction(transaction)
            latency_ms = (time.perf_counter() - start) * 1000
            return AllocationResult(
                code=txn_result.code,
                org_id=txn_result.org_id,
                role=txn_result.role,
                number=txn_result.number,
                attempts=attempt,
                latency_ms=latency_ms,
            )
        except (OrgCodeNotFoundError, OrgMismatchError, AllocationExhaustedError):
            raise
        except g_exceptions.Aborted as exc:
            last_error = exc
            # Exponential backoff with jitter per Firestore recommendations.
            delay = base_delay * (2 ** (attempt - 1))
            jitter = random.uniform(0, delay * 0.1)
            await asyncio.sleep(delay + jitter)
            logger.warning(
                "teammate_code.txn_aborted",
                extra={
                    "orgCode": normalized_org_code,
                    "role": normalized_role,
                    "attempt": attempt,
                    "delaySeconds": round(delay + jitter, 4),
                },
            )
            continue
        except Exception as exc:  # pragma: no cover - unexpected
            last_error = exc
            logger.exception(
                "teammate_code.txn_unexpected_error",
                extra={
                    "orgCode": normalized_org_code,
                    "role": normalized_role,
                    "attempt": attempt,
                },
            )
            break

    raise AllocationFailedError(last_error)
